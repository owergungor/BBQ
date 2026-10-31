use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{validate_setting_entry, BbqResult, BbqSettings, ThemePreference};
use bbq_platform::PlatformAutostart;
use bbq_storage::SettingsRepository;
use std::sync::{Arc, Mutex};

pub type AppSettings = BbqSettings;

pub type SettingsEventSink = Arc<dyn Fn(BbqSettings) + Send + Sync>;

pub trait SettingsServiceTrait: Service {
    fn get_settings(&self) -> BbqResult<BbqSettings>;
    fn update_setting(&self, key: &str, value: &str) -> BbqResult<()>;
    fn update_settings(&self, settings: &BbqSettings) -> BbqResult<()>;
    fn reset_to_defaults(&self) -> BbqResult<BbqSettings>;
    fn subscribe_events(&self, sink: SettingsEventSink);
}

pub struct SettingsService {
    repo: Arc<dyn SettingsRepository>,
    autostart: Option<Arc<dyn PlatformAutostart>>,
    event_sinks: Arc<Mutex<Vec<SettingsEventSink>>>,
}

impl std::fmt::Debug for SettingsService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SettingsService").finish()
    }
}

impl SettingsService {
    pub fn new(repo: Arc<dyn SettingsRepository>) -> Self {
        Self {
            repo,
            autostart: None,
            event_sinks: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn with_autostart(mut self, autostart: Arc<dyn PlatformAutostart>) -> Self {
        self.autostart = Some(autostart);
        self
    }

    fn notify_change(&self, settings: &BbqSettings) {
        if let Ok(sinks) = self.event_sinks.lock() {
            for sink in sinks.iter() {
                sink(settings.clone());
            }
        }
    }
}

#[async_trait]
impl Service for SettingsService {
    fn name(&self) -> &'static str {
        "SettingsService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing SettingsService");
        // Ensure defaults are valid and accessible
        let _ = self.get_settings()?;
        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        Ok(())
    }

    fn status(&self) -> ServiceStatus {
        ServiceStatus {
            name: self.name(),
            state: ServiceState::Active,
            message: None,
        }
    }
}

#[async_trait]
impl SettingsServiceTrait for SettingsService {
    fn get_settings(&self) -> BbqResult<BbqSettings> {
        let mut settings = BbqSettings::default();

        let all_settings = self.repo.get_all()?;
        let get_val = |k: &str| all_settings.get(k).map(|s| s.as_str());

        if let Some(t) = get_val("theme") {
            if let Ok(theme) = t.parse::<ThemePreference>() {
                settings.theme = theme;
            }
        }
        if let Some(ac) = get_val("accent_color") {
            let trimmed = ac.trim().to_lowercase();
            match trimmed.as_str() {
                "blue" | "red" | "green" | "orange" | "yellow" | "pink" | "purple" | "indigo"
                | "teal" | "mint" | "cyan" | "custom" => {
                    settings.accent_color = trimmed;
                }
                _ => {
                    if bbq_core::is_valid_hex_color(&trimmed) {
                        settings.accent_color = trimmed;
                    }
                }
            }
        }
        if let Some(cac) = get_val("custom_accent_color") {
            let trimmed = cac.trim();
            if !trimmed.is_empty() && trimmed != "null" {
                settings.custom_accent_color = Some(trimmed.to_string());
            }
        }
        if let Some(rm) = get_val("reduced_motion") {
            settings.reduced_motion = rm == "true";
        }
        if let Some(w) = get_val("island_width") {
            if let Ok(num) = w.parse::<u32>() {
                settings.island_width =
                    num.clamp(bbq_core::MIN_ISLAND_WIDTH, bbq_core::MAX_ISLAND_WIDTH);
            }
        }
        if let Some(h) = get_val("island_height") {
            if let Ok(num) = h.parse::<u32>() {
                settings.island_height =
                    num.clamp(bbq_core::MIN_ISLAND_HEIGHT, bbq_core::MAX_ISLAND_HEIGHT);
            }
        }
        if let Some(d) = get_val("target_display_id") {
            if d.trim().is_empty() || d == "null" {
                settings.target_display_id = None;
            } else {
                settings.target_display_id = Some(d.to_string());
            }
        }
        if let Some(a) = get_val("auto_expand_on_event") {
            settings.auto_expand_on_event = a == "true";
        }
        if let Some(s) = get_val("start_at_login") {
            settings.start_at_login = s == "true";
        }
        if let Some(gh) = get_val("global_hotkey") {
            let trimmed = gh.trim();
            if !trimmed.is_empty() && trimmed.len() <= bbq_core::MAX_HOTKEY_LEN {
                settings.global_hotkey = trimmed.to_string();
            }
        }
        if let Some(he) = get_val("hotkey_enabled") {
            settings.hotkey_enabled = he == "true";
        }
        if let Some(ch) = get_val("clipboard_history_enabled") {
            settings.clipboard_history_enabled = ch == "true";
        }
        if let Some(crd) = get_val("clipboard_retention_days") {
            if let Ok(num) = crd.parse::<u32>() {
                settings.clipboard_retention_days = num.clamp(
                    bbq_core::MIN_CLIPBOARD_RETENTION_DAYS,
                    bbq_core::MAX_CLIPBOARD_RETENTION_DAYS,
                );
            }
        }
        if let Some(cme) = get_val("clipboard_max_entries") {
            if let Ok(num) = cme.parse::<usize>() {
                settings.clipboard_max_entries = num.clamp(
                    bbq_core::MIN_CLIPBOARD_MAX_ENTRIES,
                    bbq_core::MAX_CLIPBOARD_MAX_ENTRIES,
                );
            }
        }
        if let Some(ne) = get_val("notifications_enabled") {
            settings.notifications_enabled = ne == "true";
        }
        if let Some(tse) = get_val("timer_sound_enabled") {
            settings.timer_sound_enabled = tse == "true";
        }
        if let Some(rse) = get_val("reminder_sound_enabled") {
            settings.reminder_sound_enabled = rse == "true";
        }
        if let Some(dw) = get_val("disabled_widgets") {
            if let Ok(mut list) = serde_json::from_str::<Vec<String>>(dw) {
                list.truncate(bbq_core::MAX_DISABLED_WIDGETS);
                settings.disabled_widgets = list;
            }
        }
        if let Some(cio) = get_val("compact_indicator_order") {
            if let Ok(mut list) = serde_json::from_str::<Vec<String>>(cio) {
                list.truncate(bbq_core::MAX_DISABLED_WIDGETS);
                settings.compact_indicator_order = list;
            }
        }
        if let Some(frc) = get_val("first_run_completed") {
            settings.first_run_completed = frc == "true";
        }
        if let Some(oc) = get_val("onboarding_completed") {
            settings.onboarding_completed = oc == "true";
        }
        let mut has_legacy_pos = false;
        if let Some(pos) = get_val("island_position") {
            let trimmed = pos.trim().to_lowercase();
            match trimmed.as_str() {
                "top-center" | "top-left" | "top-right" | "center" | "center-center"
                | "center-left" | "center-right" | "bottom-left" | "bottom-center"
                | "bottom-right" => {
                    settings.island_position = trimmed;
                    has_legacy_pos = true;
                }
                _ => {}
            }
        }
        if let Some(im) = get_val("island_mode") {
            let trimmed = im.trim().to_lowercase();
            match trimmed.as_str() {
                "island" | "notch" | "dot" => {
                    settings.island_mode = trimmed;
                }
                _ => {}
            }
        }
        let (mig_v, mig_h) = bbq_core::decompose_island_position(&settings.island_position);
        if let Some(ivp) = get_val("island_vertical_position") {
            let trimmed = ivp.trim().to_lowercase();
            match trimmed.as_str() {
                "top" | "center" | "bottom" => {
                    settings.island_vertical_position = trimmed;
                }
                _ => {}
            }
        } else if has_legacy_pos {
            settings.island_vertical_position = mig_v.to_string();
        }
        if let Some(ihp) = get_val("island_horizontal_position") {
            let trimmed = ihp.trim().to_lowercase();
            match trimmed.as_str() {
                "left" | "center" | "right" => {
                    settings.island_horizontal_position = trimmed;
                }
                _ => {}
            }
        } else if has_legacy_pos {
            settings.island_horizontal_position = mig_h.to_string();
        }
        settings.island_position = bbq_core::compose_island_position(
            &settings.island_vertical_position,
            &settings.island_horizontal_position,
        );
        if let Some(ds) = get_val("dot_size") {
            if let Ok(num) = ds.parse::<u32>() {
                if (32..=64).contains(&num) {
                    settings.dot_size = num;
                }
            }
        }
        if let Some(tr) = get_val("island_transparency") {
            if let Ok(num) = tr.parse::<u32>() {
                settings.island_transparency = num.min(100);
            }
        }
        if let Some(bl) = get_val("island_blur") {
            if let Ok(num) = bl.parse::<u32>() {
                settings.island_blur = num.min(50);
            }
        }
        if let Some(ble) = get_val("island_blur_enabled") {
            settings.island_blur_enabled = ble == "true";
        }
        if let Some(aot) = get_val("always_on_top") {
            settings.always_on_top = aot == "true";
        }
        if let Some(mh) = get_val("move_hud") {
            settings.move_hud = mh == "true";
        }
        if let Some(lang) = get_val("language") {
            let trimmed = lang.trim().to_lowercase();
            match trimmed.as_str() {
                "en" | "es" | "fr" | "de" | "tr" => {
                    settings.language = trimmed;
                }
                _ => {}
            }
        }

        Ok(settings)
    }

    fn update_setting(&self, key: &str, value: &str) -> BbqResult<()> {
        validate_setting_entry(key, value)?;
        self.repo.set(key, value)?;

        if key == "island_position" {
            let (v, h) = bbq_core::decompose_island_position(value);
            self.repo.set("island_vertical_position", v)?;
            self.repo.set("island_horizontal_position", h)?;
        }

        if key == "start_at_login" {
            if let Some(ref autostart) = self.autostart {
                let autostart = autostart.clone();
                let enabled = value == "true";
                tokio::spawn(async move {
                    if let Err(e) = autostart.set_enabled(enabled).await {
                        tracing::warn!("Failed to synchronize OS autostart: {}", e);
                    }
                });
            }
        }

        let updated = self.get_settings()?;
        if key == "island_vertical_position" || key == "island_horizontal_position" {
            self.repo.set("island_position", &updated.island_position)?;
        }
        self.notify_change(&updated);
        Ok(())
    }

    fn update_settings(&self, settings: &BbqSettings) -> BbqResult<()> {
        settings.validate()?;

        if let Some(ref autostart) = self.autostart {
            let autostart = autostart.clone();
            let enabled = settings.start_at_login;
            tokio::spawn(async move {
                if let Err(e) = autostart.set_enabled(enabled).await {
                    tracing::warn!("Failed to synchronize OS autostart: {}", e);
                }
            });
        }

        self.repo.set("theme", &settings.theme.to_string())?;
        self.repo.set("accent_color", &settings.accent_color)?;
        if let Some(ref custom) = settings.custom_accent_color {
            let trimmed = custom.trim();
            if !trimmed.is_empty() && trimmed != "null" {
                self.repo.set("custom_accent_color", trimmed)?;
            }
        }
        self.repo.set(
            "reduced_motion",
            if settings.reduced_motion {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo
            .set("island_width", &settings.island_width.to_string())?;
        self.repo
            .set("island_height", &settings.island_height.to_string())?;
        self.repo.set(
            "target_display_id",
            settings.target_display_id.as_deref().unwrap_or(""),
        )?;
        self.repo.set(
            "auto_expand_on_event",
            if settings.auto_expand_on_event {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set(
            "start_at_login",
            if settings.start_at_login {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set("global_hotkey", &settings.global_hotkey)?;
        self.repo.set(
            "hotkey_enabled",
            if settings.hotkey_enabled {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set(
            "clipboard_history_enabled",
            if settings.clipboard_history_enabled {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set(
            "clipboard_retention_days",
            &settings.clipboard_retention_days.to_string(),
        )?;
        self.repo.set(
            "clipboard_max_entries",
            &settings.clipboard_max_entries.to_string(),
        )?;
        self.repo.set(
            "notifications_enabled",
            if settings.notifications_enabled {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set(
            "timer_sound_enabled",
            if settings.timer_sound_enabled {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set(
            "reminder_sound_enabled",
            if settings.reminder_sound_enabled {
                "true"
            } else {
                "false"
            },
        )?;

        let dw_json =
            serde_json::to_string(&settings.disabled_widgets).unwrap_or_else(|_| "[]".to_string());
        self.repo.set("disabled_widgets", &dw_json)?;

        let cio_json = serde_json::to_string(&settings.compact_indicator_order)
            .unwrap_or_else(|_| "[]".to_string());
        self.repo.set("compact_indicator_order", &cio_json)?;

        self.repo.set(
            "first_run_completed",
            if settings.first_run_completed {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set(
            "onboarding_completed",
            if settings.onboarding_completed {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo
            .set("island_position", &settings.island_position)?;
        self.repo.set(
            "island_transparency",
            &settings.island_transparency.to_string(),
        )?;
        self.repo
            .set("island_blur", &settings.island_blur.to_string())?;
        self.repo.set(
            "island_blur_enabled",
            if settings.island_blur_enabled {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo.set(
            "always_on_top",
            if settings.always_on_top {
                "true"
            } else {
                "false"
            },
        )?;
        self.repo
            .set("move_hud", if settings.move_hud { "true" } else { "false" })?;
        self.repo.set("language", &settings.language)?;
        self.repo.set("island_mode", &settings.island_mode)?;
        self.repo.set(
            "island_vertical_position",
            &settings.island_vertical_position,
        )?;
        self.repo.set(
            "island_horizontal_position",
            &settings.island_horizontal_position,
        )?;
        let composed_pos = bbq_core::compose_island_position(
            &settings.island_vertical_position,
            &settings.island_horizontal_position,
        );
        self.repo.set("island_position", &composed_pos)?;
        self.repo.set("dot_size", &settings.dot_size.to_string())?;

        let mut normalized = settings.clone();
        normalized.island_position = composed_pos;
        self.notify_change(&normalized);
        Ok(())
    }

    fn reset_to_defaults(&self) -> BbqResult<BbqSettings> {
        let defaults = BbqSettings::default();
        self.update_settings(&defaults)?;
        Ok(defaults)
    }

    fn subscribe_events(&self, sink: SettingsEventSink) {
        if let Ok(mut sinks) = self.event_sinks.lock() {
            sinks.push(sink);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_storage::DatabaseManager;

    #[test]
    fn test_settings_always_on_top_persistence_and_legacy_compat() {
        let db = DatabaseManager::open_in_memory().expect("in-memory db");
        let repo = db.settings_repository();

        // Seed with legacy obsolete keys as if an older version of BBQ wrote them
        repo.set("auto_update_schedule", "daily")
            .expect("set legacy");
        repo.set("last_update_check_at", "1234567890")
            .expect("set legacy");
        repo.set("always_on_top", "false")
            .expect("set always on top");
        repo.set("move_hud", "true").expect("set move hud");

        let service = SettingsService::new(repo.clone());
        let loaded = service.get_settings().expect("load settings");

        // Old obsolete keys are safely ignored and do not fail loading
        assert!(!loaded.always_on_top);
        assert!(loaded.move_hud);

        // Update always_on_top back to true, move_hud to false
        service
            .update_setting("always_on_top", "true")
            .expect("update always_on_top");
        service
            .update_setting("move_hud", "false")
            .expect("update move_hud");

        let updated = service.get_settings().expect("get updated");
        assert!(updated.always_on_top);
        assert!(!updated.move_hud);
        assert_eq!(repo.get("always_on_top").unwrap().as_deref(), Some("true"));
        assert_eq!(repo.get("move_hud").unwrap().as_deref(), Some("false"));
    }

    #[test]
    fn test_single_pass_get_all_and_defaults_preservation() {
        let db = DatabaseManager::open_in_memory().expect("in-memory db");
        let repo = db.settings_repository();
        let service = SettingsService::new(repo.clone());

        // 1. Initially empty: returns default settings
        let defaults = service.get_settings().expect("load default settings");
        assert_eq!(defaults, BbqSettings::default());

        // 2. Populate settings in DB
        repo.set("island_width", "360").expect("set width");
        repo.set("island_height", "44").expect("set height");
        repo.set("theme", "Dark").expect("set theme");
        repo.set("language", "tr").expect("set lang");
        repo.set("island_blur", "24").expect("set blur");

        // 3. Verify get_all in repository returns exactly those keys
        let all = repo.get_all().expect("get_all from repo");
        assert_eq!(all.get("island_width").map(String::as_str), Some("360"));
        assert_eq!(all.get("theme").map(String::as_str), Some("Dark"));
        assert_eq!(all.get("language").map(String::as_str), Some("tr"));
        assert_eq!(all.get("island_blur").map(String::as_str), Some("24"));

        // 4. Verify service.get_settings loads and parses them correctly in single pass
        let loaded = service.get_settings().expect("load custom settings");
        assert_eq!(loaded.island_width, 360);
        assert_eq!(loaded.island_height, 44);
        assert_eq!(loaded.theme, ThemePreference::Dark);
        assert_eq!(loaded.language, "tr");
        assert_eq!(loaded.island_blur, 24);
        assert!(loaded.island_blur_enabled);
        // Unset keys still resolve to defaults
        assert!(loaded.always_on_top);
        assert_eq!(loaded.global_hotkey, BbqSettings::default().global_hotkey);
    }

    #[test]
    fn test_v41_island_position_migration_and_sync() {
        let db = DatabaseManager::open_in_memory().expect("in-memory db");
        let repo = db.settings_repository();
        let service = SettingsService::new(repo.clone());

        // Legacy saved value "bottom-right" without explicit vertical/horizontal keys
        repo.set("island_position", "bottom-right")
            .expect("set legacy position");
        let loaded = service.get_settings().expect("load migrated settings");
        assert_eq!(loaded.island_vertical_position, "bottom");
        assert_eq!(loaded.island_horizontal_position, "right");
        assert_eq!(loaded.island_position, "bottom-right");

        // Updating horizontal position updates composed island_position
        service
            .update_setting("island_horizontal_position", "left")
            .expect("update horizontal position");
        let after_horiz = service.get_settings().expect("load after horiz");
        assert_eq!(after_horiz.island_vertical_position, "bottom");
        assert_eq!(after_horiz.island_horizontal_position, "left");
        assert_eq!(after_horiz.island_position, "bottom-left");

        // Updating vertical position updates composed island_position
        service
            .update_setting("island_vertical_position", "center")
            .expect("update vertical position");
        let after_vert = service.get_settings().expect("load after vert");
        assert_eq!(after_vert.island_vertical_position, "center");
        assert_eq!(after_vert.island_horizontal_position, "left");
        assert_eq!(after_vert.island_position, "center-left");
    }
}
