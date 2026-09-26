#![allow(
    clippy::unwrap_used,
    clippy::panic,
    clippy::field_reassign_with_default
)]

use bbq_core::{
    calculate_island_geometry, validate_launcher_url, BbqError, BbqSettings, DisplayInfo,
    DisplayRect, IslandAnchor, IslandLayoutState, LauncherAction, LauncherItem, LauncherItemSource,
    NotificationCategory, NotificationRequest, WidgetDimensions,
};
use bbq_platform::{
    MockDisplay, MockFile, MockHotkey, MockMedia, MockNotification, MockPlatformProvider,
    MockWindow, PlatformMedia, PlatformProvider,
};
use bbq_services::{
    ClipboardService, ClipboardServiceTrait, DisplayService, DisplayServiceTrait, FileService,
    FileServiceTrait, HotkeyService, LauncherService, NotificationService,
    NotificationServiceTrait, Service, ServiceState, SettingsService, SettingsServiceTrait,
    WindowService, WindowServiceTrait,
};
use bbq_storage::DatabaseManager;
use std::sync::Arc;

#[tokio::test]
async fn test_hotkey_startup_guard_and_shutdown_cleanup() {
    let db = DatabaseManager::open_in_memory().expect("In-memory DB required");
    let settings_service = Arc::new(SettingsService::new(db.settings_repository()));
    let mock_hotkey = Arc::new(MockHotkey::default());

    // 1. Configure settings with hotkey disabled
    let mut settings = BbqSettings::default();
    settings.hotkey_enabled = false;
    settings_service
        .update_settings(&settings)
        .expect("Settings update failed");

    let hotkey_service = HotkeyService::new(mock_hotkey.clone(), Some(settings_service.clone()));
    hotkey_service.init().await.expect("Init failed");

    // 2. Start service when hotkey is disabled -> should stay Sleeping and NOT register with OS
    hotkey_service.start().await.expect("Start should succeed");
    assert_eq!(hotkey_service.status().state, ServiceState::Sleeping);
    assert_eq!(
        mock_hotkey.registered_count(),
        0,
        "No hotkey should be registered when disabled"
    );

    // 3. Enable hotkey in settings -> should transition to active and register
    let mut settings = settings_service.get_settings().unwrap();
    settings.hotkey_enabled = true;
    settings_service
        .update_settings(&settings)
        .expect("Settings update failed");

    hotkey_service.start().await.expect("Start should succeed");
    assert_eq!(hotkey_service.status().state, ServiceState::Active);
    assert_eq!(
        mock_hotkey.registered_count(),
        1,
        "Hotkey should be registered when enabled"
    );

    // 4. Shutdown / stop service -> should unregister from OS and become Inactive
    hotkey_service.stop().await.expect("Stop should succeed");
    assert_eq!(hotkey_service.status().state, ServiceState::Inactive);
    assert_eq!(
        mock_hotkey.registered_count(),
        0,
        "Hotkey should be unregistered after stop"
    );
}

#[tokio::test]
async fn test_clipboard_startup_guard_and_lazy_subscription() {
    let db = DatabaseManager::open_in_memory().expect("In-memory DB required");
    let clipboard_repo = db.clipboard_repository();
    let settings_repo = db.settings_repository();
    let mock_platform = Arc::new(MockPlatformProvider::new());

    // Explicitly set clipboard disabled in settings
    settings_repo
        .set(ClipboardService::SETTING_HISTORY_ENABLED, "false")
        .unwrap();

    let clipboard_service = ClipboardService::new(
        mock_platform.clipboard(),
        Some(clipboard_repo),
        Some(settings_repo),
    );

    // 1. Init when disabled -> platform listener must NOT be attached
    clipboard_service.init().await.expect("Init failed");
    assert_eq!(clipboard_service.status().state, ServiceState::Sleeping);

    // 2. Enabling history lazily attaches listener and activates service
    clipboard_service
        .set_history_enabled(true)
        .await
        .expect("Enable failed");
    assert_eq!(clipboard_service.status().state, ServiceState::Active);
    assert!(clipboard_service.is_history_enabled());

    // 3. Stop service sets state to Sleeping
    clipboard_service.stop().await.expect("Stop failed");
    assert_eq!(clipboard_service.status().state, ServiceState::Sleeping);
}

#[tokio::test]
async fn test_notification_guard_and_unavailable_platform() {
    let db = DatabaseManager::open_in_memory().expect("In-memory DB required");
    let settings_service = Arc::new(SettingsService::new(db.settings_repository()));
    let mock_platform = Arc::new(MockNotification::default());

    let notif_service =
        NotificationService::new(mock_platform.clone(), Some(settings_service.clone()));
    notif_service.init().await.expect("Init failed");

    // 1. Disable notifications in settings
    let mut settings = BbqSettings::default();
    settings.notifications_enabled = false;
    settings_service.update_settings(&settings).unwrap();

    let req = NotificationRequest::new(
        "test_guard_1",
        NotificationCategory::General,
        "Test Guard",
        "Body content",
    )
    .unwrap();

    // Calling notify() when disabled must return Ok(()) without calling platform
    assert!(notif_service.notify(req.clone()).is_ok());
    assert_eq!(
        mock_platform.notification_count(),
        0,
        "No notification should be dispatched when disabled"
    );

    // 2. Enable notifications in settings
    let mut settings = settings_service.get_settings().unwrap();
    settings.notifications_enabled = true;
    settings_service.update_settings(&settings).unwrap();

    let req2 = NotificationRequest::new(
        "test_guard_2",
        NotificationCategory::General,
        "Test Guard 2",
        "Body content 2",
    )
    .unwrap();
    assert!(notif_service.notify(req2).is_ok());
    assert_eq!(
        mock_platform.notification_count(),
        1,
        "Notification should be dispatched when enabled"
    );

    // 3. Test unavailable platform (e.g. Linux / macOS without native daemon or permissions)
    mock_platform.set_available(false);
    let req3 = NotificationRequest::new(
        "test_guard_3",
        NotificationCategory::General,
        "Test Guard 3",
        "Body content 3",
    )
    .unwrap();
    let res = notif_service.notify(req3);
    assert!(
        res.is_err(),
        "Must report error when platform capability unavailable"
    );
    match res {
        Err(BbqError::Platform(_)) => {}
        other => panic!("Expected Platform error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_mock_platform_failure_modes_parity() {
    // 1. MockWindow failures
    let mock_window = Arc::new(MockWindow::default());
    let window_service = WindowService::new(mock_window.clone());
    mock_window.set_fail_operations(true);

    let info = DisplayInfo {
        id: "disp-1".to_string(),
        name: "Test Display".to_string(),
        bounds: DisplayRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        },
        work_area: DisplayRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        },
        scale_factor: 1.0,
        is_primary: true,
    };
    let geo = calculate_island_geometry(
        &info,
        IslandLayoutState::Idle,
        None,
        IslandAnchor::TopCenter,
    );
    let apply_res = window_service.apply_geometry(&geo).await;
    assert!(
        apply_res.is_err(),
        "MockWindow must fail when fail_operations is true"
    );

    // 2. MockDisplay disconnect & fallback
    let mock_display = Arc::new(MockDisplay::default());
    mock_display.set_displays(vec![
        DisplayInfo {
            id: "primary".to_string(),
            name: "Primary Monitor".to_string(),
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            },
            scale_factor: 1.0,
            is_primary: true,
        },
        DisplayInfo {
            id: "secondary".to_string(),
            name: "Secondary Monitor".to_string(),
            bounds: DisplayRect {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1040,
            },
            scale_factor: 1.25,
            is_primary: false,
        },
    ]);
    let display_service = DisplayService::new(mock_display.clone());

    // Target secondary display
    let target = display_service
        .get_target_display(Some("secondary"))
        .await
        .unwrap();
    assert_eq!(target.id, "secondary");

    // Disconnect secondary display -> target should fall back to primary
    mock_display.disconnect_display("secondary");
    let fallback = display_service
        .get_target_display(Some("secondary"))
        .await
        .unwrap();
    assert_eq!(
        fallback.id, "primary",
        "Must fall back to primary when target display is disconnected"
    );

    // 3. MockMedia availability toggle
    let mock_media = Arc::new(MockMedia::default());
    mock_media.set_available(false);
    let session_res = mock_media.current_session().await;
    assert!(
        session_res.is_err(),
        "Session query must fail when media platform is unavailable"
    );

    // 4. MockFile failure simulation
    let mock_file = Arc::new(MockFile::default());
    let file_service = FileService::new(mock_file.clone(), None);
    mock_file.set_fail_operations(true);
    let open_res = file_service.open_file("C:\\some\\file.txt").await;
    assert!(
        open_res.is_err(),
        "MockFile must fail operations when fail_operations is true"
    );
}

#[tokio::test]
async fn test_file_and_launcher_security_bounds() {
    let mock_platform = Arc::new(MockPlatformProvider::new());
    let file_service = FileService::new(mock_platform.file(), None);
    let _launcher_service = LauncherService::new(mock_platform.launcher(), None);

    // 1. Path length limit (<= 4096 chars)
    let giant_path = "a".repeat(4097);
    let add_res = file_service.add_file(&giant_path, None).await;
    assert!(
        matches!(add_res, Err(BbqError::Validation(_))),
        "Must reject paths > 4096 chars in add_file"
    );

    let open_res = file_service.open_file(&giant_path).await;
    assert!(
        matches!(open_res, Err(BbqError::Validation(_))),
        "Must reject paths > 4096 chars in open_file"
    );

    let reveal_res = file_service.reveal_file(&giant_path).await;
    assert!(
        matches!(reveal_res, Err(BbqError::Validation(_))),
        "Must reject paths > 4096 chars in reveal_file"
    );

    // 2. Empty paths
    assert!(file_service.add_file("", None).await.is_err());
    assert!(file_service.open_file("   ").await.is_err());

    // 3. Launcher item path and action bounds
    let giant_open_action = LauncherAction::OpenFile {
        path: giant_path.clone(),
    };
    let item_res = LauncherItem::new(
        "test_item",
        "Test Item",
        None,
        None,
        giant_open_action,
        LauncherItemSource::BuiltIn,
        false,
    );
    assert!(
        item_res.is_err(),
        "LauncherItem must reject paths > 4096 chars"
    );

    // 4. URL security: reject non-http/https
    assert!(validate_launcher_url("file:///C:/Windows/System32/cmd.exe").is_err());
    assert!(validate_launcher_url("javascript:alert(1)").is_err());
    assert!(validate_launcher_url("data:text/html,<h1>XSS</h1>").is_err());
    assert!(validate_launcher_url("powershell:rmdir").is_err());
    assert!(validate_launcher_url("cmd:format").is_err());
    assert!(validate_launcher_url("vbscript:execute").is_err());

    // URL length bound (> 4096)
    let giant_url = format!("https://example.com/{}", "x".repeat(4100));
    assert!(validate_launcher_url(&giant_url).is_err());

    // Valid URLs
    assert!(validate_launcher_url("https://github.com").is_ok());
    assert!(validate_launcher_url("http://localhost:3000").is_ok());
}

#[test]
fn test_display_dpi_and_multi_monitor_determinism() {
    let scales = [1.0, 1.25, 1.5, 2.0];

    for &scale in &scales {
        let display = DisplayInfo {
            id: format!("disp-scale-{}", scale),
            name: "Scale Monitor".to_string(),
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: (1920.0 * scale) as u32,
                height: (1080.0 * scale) as u32,
            },
            work_area: DisplayRect {
                x: 0,
                y: 0,
                width: (1920.0 * scale) as u32,
                height: (1040.0 * scale) as u32,
            },
            scale_factor: scale,
            is_primary: true,
        };

        let geo1 = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            Some(WidgetDimensions {
                preferred_width: Some(300),
                preferred_height: Some(40),
                ..Default::default()
            }),
            IslandAnchor::TopCenter,
        );

        let geo2 = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            Some(WidgetDimensions {
                preferred_width: Some(300),
                preferred_height: Some(40),
                ..Default::default()
            }),
            IslandAnchor::TopCenter,
        );

        // Determinism check: same display + same settings -> exact same geometry
        assert_eq!(geo1.x, geo2.x);
        assert_eq!(geo1.y, geo2.y);
        assert_eq!(geo1.width, geo2.width);
        assert_eq!(geo1.height, geo2.height);

        // Clamping check: island must stay strictly inside work area
        assert!(geo1.x >= display.work_area.x);
        assert!(geo1.y >= display.work_area.y);
        assert!(geo1.x + geo1.width as i32 <= display.work_area.x + display.work_area.width as i32);
        assert!(
            geo1.y + geo1.height as i32 <= display.work_area.y + display.work_area.height as i32
        );
    }
}

#[tokio::test]
async fn test_displays_changed_heterogeneous_dpi_transition_invariants() {
    // Heterogeneous 3-monitor layout:
    // Monitor 1 (Left, negative coords, 1.0x standard DPI)
    let left_display = DisplayInfo {
        id: "disp_left_100".to_string(),
        name: "Standard Secondary Monitor".to_string(),
        is_primary: false,
        scale_factor: 1.0,
        bounds: DisplayRect {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
        },
        work_area: DisplayRect {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1040,
        },
    };

    // Monitor 2 (Center, primary, 1.5x scaling 1440p)
    let center_primary = DisplayInfo {
        id: "disp_center_150".to_string(),
        name: "Primary High-DPI QHD Monitor".to_string(),
        is_primary: true,
        scale_factor: 1.5,
        bounds: DisplayRect {
            x: 0,
            y: 0,
            width: 2560,
            height: 1440,
        },
        work_area: DisplayRect {
            x: 0,
            y: 0,
            width: 2560,
            height: 1400,
        },
    };

    // Monitor 3 (Right, 2.0x Retina scaling 4K/HiDPI)
    let right_display = DisplayInfo {
        id: "disp_right_200".to_string(),
        name: "Retina 4K Monitor".to_string(),
        is_primary: false,
        scale_factor: 2.0,
        bounds: DisplayRect {
            x: 2560,
            y: 0,
            width: 1440,
            height: 900,
        },
        work_area: DisplayRect {
            x: 2560,
            y: 25,
            width: 1440,
            height: 875,
        },
    };

    let initial_displays = vec![
        left_display.clone(),
        center_primary.clone(),
        right_display.clone(),
    ];

    let mock_display = Arc::new(MockDisplay {
        displays: Arc::new(std::sync::Mutex::new(initial_displays.clone())),
        active_display_id: Arc::new(std::sync::Mutex::new(Some("disp_center_150".to_string()))),
        subscribers: Arc::new(std::sync::Mutex::new(Vec::new())),
    });
    let mock_window = Arc::new(MockWindow::default());

    let display_service = DisplayService::new(mock_display.clone());
    let window_service = WindowService::new(mock_window.clone());

    // Verify geometry invariants on all 3 heterogeneous displays
    let layout_states = [
        IslandLayoutState::Idle,
        IslandLayoutState::Hovering,
        IslandLayoutState::Expanded,
    ];

    for disp in &initial_displays {
        for state in &layout_states {
            let geo = calculate_island_geometry(
                disp,
                *state,
                Some(WidgetDimensions {
                    preferred_width: Some(300),
                    preferred_height: Some(200),
                    ..Default::default()
                }),
                IslandAnchor::TopCenter,
            );

            // 1. Invariant: Strict horizontal centering on target display's work area
            let expected_center_x = disp.work_area.x + (disp.work_area.width as i32) / 2;
            let actual_center_x = geo.x + (geo.width as i32) / 2;
            assert_eq!(
                actual_center_x, expected_center_x,
                "Center invariant violated on display {} for state {:?}",
                disp.id, state
            );

            // 2. Invariant: Window strictly within display horizontal work area bounds
            assert!(
                geo.x >= disp.work_area.x,
                "Window left edge ({}) < work_area.x ({}) on display {}",
                geo.x,
                disp.work_area.x,
                disp.id
            );
            assert!(
                geo.x + geo.width as i32 <= disp.work_area.x + disp.work_area.width as i32,
                "Window right edge ({}) > work_area right boundary on display {}",
                geo.x + geo.width as i32,
                disp.id
            );

            // 3. Invariant: Top pinned within work area (no negative y drift relative to work area)
            assert!(
                geo.y >= disp.work_area.y,
                "Window top ({}) < work_area.y ({}) on display {}",
                geo.y,
                disp.work_area.y,
                disp.id
            );
            assert!(
                geo.y + geo.height as i32 <= disp.work_area.y + disp.work_area.height as i32,
                "Window bottom ({}) exceeds work area height on display {}",
                geo.y + geo.height as i32,
                disp.id
            );
        }
    }

    // Simulate DisplaysChanged transition: Primary changes to the negative coordinate display (left_display)
    // and right_display is disconnected
    let mut updated_left = left_display.clone();
    updated_left.is_primary = true;
    let mut updated_center = center_primary.clone();
    updated_center.is_primary = false;

    let updated_displays = vec![updated_left.clone(), updated_center.clone()];

    display_service
        .init()
        .await
        .expect("DisplayService init should succeed");

    // Trigger display change event subscription
    let fired_events = Arc::new(std::sync::Mutex::new(Vec::new()));
    let fired_events_clone = fired_events.clone();
    display_service
        .subscribe_events(Arc::new(move |event| {
            if let Ok(mut g) = fired_events_clone.lock() {
                g.push(event);
            }
        }))
        .await
        .expect("Subscription should succeed");

    // Broadcast DisplaysChanged through mock display
    mock_display.set_displays(updated_displays.clone());
    if let Ok(mut g) = mock_display.active_display_id.lock() {
        *g = Some("disp_left_100".to_string());
    }

    assert_eq!(fired_events.lock().unwrap().len(), 1);

    // Verify that primary display is now the left display in negative coordinates
    let current_primary = display_service
        .get_primary_display()
        .await
        .expect("Primary display must be resolvable");
    assert_eq!(current_primary.id, "disp_left_100");
    assert_eq!(current_primary.scale_factor, 1.0);
    assert_eq!(current_primary.work_area.x, -1920);

    // Position island on newly primary negative coordinate display
    window_service
        .position_island(&current_primary, 240, 38)
        .await
        .expect("Positioning must succeed");

    let (win_x, win_y) = *mock_window.position.lock().unwrap();
    let (win_w, win_h) = *mock_window.size.lock().unwrap();

    assert_eq!(win_w, 240);
    assert_eq!(win_h, 38);
    assert_eq!(win_x, -1920 + (1920 - 240) / 2);
    assert_eq!(win_y, current_primary.work_area.y);
    assert_eq!(
        win_x + (win_w as i32) / 2,
        current_primary.work_area.x + (current_primary.work_area.width as i32) / 2
    );
}
