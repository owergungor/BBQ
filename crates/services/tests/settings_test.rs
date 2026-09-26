#![allow(clippy::unwrap_used, clippy::panic)]

use bbq_core::ThemePreference;
use bbq_services::{SettingsService, SettingsServiceTrait};
use bbq_storage::DatabaseManager;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

#[test]
fn test_settings_service_defaults_and_read() {
    let db = DatabaseManager::open_in_memory().expect("in-memory db");
    let service = SettingsService::new(db.settings_repository());

    let settings = service.get_settings().expect("get_settings must succeed");
    assert_eq!(settings.theme, ThemePreference::System);
    assert_eq!(settings.island_width, 240);
    assert_eq!(settings.island_height, 38);
    assert_eq!(settings.clipboard_max_entries, 100);
    assert!(!settings.clipboard_history_enabled);
    assert!(settings.notifications_enabled);
}

#[test]
fn test_settings_service_single_update_and_validation() {
    let db = DatabaseManager::open_in_memory().expect("in-memory db");
    let service = SettingsService::new(db.settings_repository());

    // Valid updates
    service
        .update_setting("theme", "dark")
        .expect("update theme to dark must succeed");
    let s = service.get_settings().expect("get_settings");
    assert_eq!(s.theme, ThemePreference::Dark);

    service
        .update_setting("island_width", "320")
        .expect("update width to 320 must succeed");
    let s = service.get_settings().expect("get_settings");
    assert_eq!(s.island_width, 320);

    service
        .update_setting("clipboard_history_enabled", "true")
        .expect("enable clipboard history must succeed");
    let s = service.get_settings().expect("get_settings");
    assert!(s.clipboard_history_enabled);

    // Invalid updates must be rejected
    assert!(service.update_setting("theme", "neon_rainbow").is_err());
    assert!(service.update_setting("island_width", "50").is_err()); // Below MIN 180
    assert!(service.update_setting("island_width", "1000").is_err()); // Above MAX 640
    assert!(service
        .update_setting("clipboard_max_entries", "5")
        .is_err()); // Below MIN 10
    assert!(service
        .update_setting("unknown_setting_key", "val")
        .is_err());
}

#[test]
fn test_settings_service_batch_update_and_events() {
    let db = DatabaseManager::open_in_memory().expect("in-memory db");
    let service = SettingsService::new(db.settings_repository());

    let notification_count = Arc::new(AtomicUsize::new(0));
    let notif_clone = notification_count.clone();

    service.subscribe_events(Arc::new(move |_settings| {
        notif_clone.fetch_add(1, Ordering::SeqCst);
    }));

    let mut patch = service.get_settings().expect("get_settings");
    patch.theme = ThemePreference::Light;
    patch.reduced_motion = true;
    patch.island_width = 300;
    patch.disabled_widgets = vec!["notes".to_string(), "network".to_string()];

    service
        .update_settings(&patch)
        .expect("batch update must succeed");

    assert_eq!(notification_count.load(Ordering::SeqCst), 1);

    let reloaded = service.get_settings().expect("get_settings");
    assert_eq!(reloaded.theme, ThemePreference::Light);
    assert!(reloaded.reduced_motion);
    assert_eq!(reloaded.island_width, 300);
    assert_eq!(reloaded.disabled_widgets, vec!["notes", "network"]);

    // Test reset to defaults
    let defaults = service
        .reset_to_defaults()
        .expect("reset_to_defaults must succeed");
    assert_eq!(defaults.theme, ThemePreference::System);
    assert!(!defaults.reduced_motion);
    assert_eq!(defaults.island_width, 240);
    assert_eq!(notification_count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn test_clipboard_budget_and_runtime_sync() {
    use bbq_core::ClipboardEntry;
    use bbq_platform::MockClipboard;
    use bbq_services::{ClipboardService, ClipboardServiceTrait, Service};

    let db = DatabaseManager::open_in_memory().expect("in-memory db");
    let settings_repo = db.settings_repository();
    let clip_repo = db.clipboard_repository();
    let platform = Arc::new(MockClipboard::default());

    let service = SettingsService::new(settings_repo.clone());

    // 1. Validate bounds: 100 accepted, 101 rejected
    assert!(service
        .update_setting("clipboard_max_entries", "100")
        .is_ok());
    assert!(service
        .update_setting("clipboard_max_entries", "101")
        .is_err());
    assert!(service
        .update_setting("clipboard_max_entries", "9")
        .is_err());

    // 2. ClipboardService canonical keys and init
    let clipboard_svc = ClipboardService::new(
        platform.clone(),
        Some(clip_repo.clone()),
        Some(settings_repo.clone()),
    );
    clipboard_svc.init().await.expect("init clipboard service");

    // Default is disabled
    assert!(!clipboard_svc.is_history_enabled());
    assert_eq!(clipboard_svc.get_max_entries(), 100);

    // 3. Runtime sync: enable history and set max entries
    clipboard_svc
        .set_history_enabled(true)
        .await
        .expect("enable history");
    assert!(clipboard_svc.is_history_enabled());
    assert_eq!(
        settings_repo.get("clipboard_history_enabled").unwrap(),
        Some("true".to_string())
    );

    clipboard_svc.set_max_entries(50);
    assert_eq!(clipboard_svc.get_max_entries(), 50);
    assert_eq!(
        settings_repo.get("clipboard_max_entries").unwrap(),
        Some("50".to_string())
    );

    // 4. Simulate clipboard changes and verify capture
    clipboard_svc.handle_clipboard_event(bbq_platform::PlatformClipboardEvent::Changed(
        ClipboardEntry::new_text("1".to_string(), "item 1", None),
    ));
    clipboard_svc.handle_clipboard_event(bbq_platform::PlatformClipboardEvent::Changed(
        ClipboardEntry::new_text("2".to_string(), "item 2", None),
    ));

    let history = clipboard_svc.get_history().await.expect("get history");
    assert_eq!(history.len(), 2);

    // 5. Disable history -> purges content
    clipboard_svc
        .set_history_enabled(false)
        .await
        .expect("disable history");
    assert!(!clipboard_svc.is_history_enabled());
    let history_after = clipboard_svc
        .get_history()
        .await
        .expect("get history after disable");
    assert_eq!(history_after.len(), 0);

    // 6. Re-enable -> history active again
    clipboard_svc
        .set_history_enabled(true)
        .await
        .expect("re-enable history");
    assert!(clipboard_svc.is_history_enabled());
    clipboard_svc.handle_clipboard_event(bbq_platform::PlatformClipboardEvent::Changed(
        ClipboardEntry::new_text("3".to_string(), "item 3", None),
    ));
    let history_re = clipboard_svc.get_history().await.expect("get history re");
    assert_eq!(history_re.len(), 1);
    assert_eq!(history_re[0].content.as_deref(), Some("item 3"));
}

#[tokio::test]
async fn test_hotkey_runtime_synchronization() {
    use bbq_platform::{HotkeyDefinition, MockPlatformProvider, PlatformProvider};
    use bbq_services::{HotkeyService, HotkeyServiceTrait, Service, ServiceState};

    let platform = Arc::new(MockPlatformProvider::new());
    let hotkey_svc = HotkeyService::new(platform.hotkey(), None);

    hotkey_svc.init().await.expect("init hotkey");
    hotkey_svc.start().await.expect("start hotkey");
    assert_eq!(hotkey_svc.status().state, ServiceState::Active);

    // 1. Disable hotkey -> unregisters with platform
    hotkey_svc.set_enabled(false).await.expect("disable hotkey");
    assert_eq!(hotkey_svc.status().state, ServiceState::Inactive);

    // 2. Re-enable hotkey -> registers with platform
    hotkey_svc.set_enabled(true).await.expect("enable hotkey");
    assert_eq!(hotkey_svc.status().state, ServiceState::Active);

    // 3. Update definition to new hotkey
    let new_def = HotkeyDefinition::from_display_string("global_command_surface", "Ctrl+Shift+P");
    hotkey_svc
        .update_definition(new_def.clone())
        .await
        .expect("update definition");
    let current = hotkey_svc.get_definition().await.expect("get definition");
    assert_eq!(current.display_str, "Ctrl+Shift+P");

    // 4. Registration conflict gracefully handles and restores previous
    platform.hotkey.simulate_conflict("Ctrl+Alt+Del");
    let conflict_def =
        HotkeyDefinition::from_display_string("global_command_surface", "Ctrl+Alt+Del");
    assert!(hotkey_svc.update_definition(conflict_def).await.is_err());

    // Current definition kept as previously valid
    let fallback = hotkey_svc
        .get_definition()
        .await
        .expect("get fallback definition");
    assert_eq!(fallback.display_str, "Ctrl+Shift+P");
}

#[tokio::test]
async fn test_display_and_geometry_runtime_synchronization() {
    use bbq_core::{calculate_island_geometry, IslandAnchor, IslandLayoutState, WidgetDimensions};
    use bbq_platform::{MockPlatformProvider, PlatformProvider};
    use bbq_services::{DisplayService, DisplayServiceTrait, Service};

    let platform = MockPlatformProvider::default();
    let display_svc = DisplayService::new(platform.display());
    display_svc.init().await.expect("init display service");

    // 1. Valid display ID resolves to specific display
    let primary = display_svc
        .get_primary_display()
        .await
        .expect("get primary");
    let target = display_svc
        .get_target_display(Some(&primary.id))
        .await
        .expect("get target");
    assert_eq!(target.id, primary.id);

    // 2. Invalid / missing display ID gracefully falls back to primary display
    let fallback = display_svc
        .get_target_display(Some("non_existent_monitor_999"))
        .await
        .expect("fallback target");
    assert_eq!(fallback.id, primary.id);

    // 3. Custom width & height geometry recalculation
    let dims = Some(WidgetDimensions {
        preferred_width: Some(360),
        preferred_height: Some(48),
        ..Default::default()
    });
    let geo = calculate_island_geometry(
        &primary,
        IslandLayoutState::Idle,
        dims,
        IslandAnchor::TopCenter,
    );
    assert_eq!(geo.width, 360);
    assert_eq!(geo.height, 48);
}

#[test]
fn test_persistence_defensive_reading_and_hardening() {
    let db = DatabaseManager::open_in_memory().expect("in-memory db");
    let repo = db.settings_repository();

    // 1. Write oversized JSON array with 50 items (limit is MAX_DISABLED_WIDGETS = 20)
    let oversized: Vec<String> = (0..50).map(|i| format!("widget_{}", i)).collect();
    let json_str = serde_json::to_string(&oversized).unwrap();
    repo.set("disabled_widgets", &json_str).unwrap();

    let service = SettingsService::new(repo.clone());
    let loaded = service.get_settings().expect("get_settings must not panic");
    assert_eq!(
        loaded.disabled_widgets.len(),
        bbq_core::MAX_DISABLED_WIDGETS,
        "Oversized list must be truncated to MAX_DISABLED_WIDGETS"
    );

    // 2. Write malformed JSON -> safely falls back to default empty vec
    repo.set("disabled_widgets", "not-a-valid-json{[[[")
        .unwrap();
    let loaded_malformed = service
        .get_settings()
        .expect("get_settings on malformed JSON");
    assert_eq!(loaded_malformed.disabled_widgets, Vec::<String>::new());

    // 3. Write corrupted number -> defensively clamped to default or range
    repo.set("island_width", "not_a_number").unwrap();
    let loaded_num = service
        .get_settings()
        .expect("get_settings on malformed int");
    assert_eq!(loaded_num.island_width, 240); // default
}

#[test]
fn test_accent_persistence_and_custom_hex_retention() {
    let db = DatabaseManager::open_in_memory().expect("in-memory db");
    let service = SettingsService::new(db.settings_repository());

    // Default accent is blue, onboarding_completed is false
    let initial = service.get_settings().expect("get_settings");
    assert_eq!(initial.accent_color, "blue");
    assert_eq!(initial.custom_accent_color, None);
    assert!(!initial.onboarding_completed);

    // Update to custom #00D4FF and mark onboarding complete
    let mut s1 = initial.clone();
    s1.accent_color = "custom".to_string();
    s1.custom_accent_color = Some("#00D4FF".to_string());
    s1.onboarding_completed = true;
    service.update_settings(&s1).expect("update to custom");

    let loaded1 = service.get_settings().expect("get_settings");
    assert_eq!(loaded1.accent_color, "custom");
    assert_eq!(loaded1.custom_accent_color.as_deref(), Some("#00D4FF"));
    assert!(loaded1.onboarding_completed);

    // Switch to preset purple with None as custom_accent_color
    let mut s2 = loaded1.clone();
    s2.accent_color = "purple".to_string();
    s2.custom_accent_color = None;
    service.update_settings(&s2).expect("update to purple");

    let loaded2 = service.get_settings().expect("get_settings");
    assert_eq!(loaded2.accent_color, "purple");
    // Stored custom color must NOT be erased by preset switch
    assert_eq!(loaded2.custom_accent_color.as_deref(), Some("#00D4FF"));
    assert!(loaded2.onboarding_completed);

    // Switch back to custom without re-specifying hex
    let mut s3 = loaded2.clone();
    s3.accent_color = "custom".to_string();
    s3.custom_accent_color = None;
    service.update_settings(&s3).expect("update back to custom");

    let loaded3 = service.get_settings().expect("get_settings");
    assert_eq!(loaded3.accent_color, "custom");
    assert_eq!(loaded3.custom_accent_color.as_deref(), Some("#00D4FF"));
    assert!(loaded3.onboarding_completed);
}
