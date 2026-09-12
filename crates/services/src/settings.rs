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

        if let Ok(Some(t)) = self.repo.get("theme") {
            if let Ok(theme) = t.parse::<ThemePreference>() {
                settings.theme = theme;
            }
        }
        if let Ok(Some(rm)) = self.repo.get("reduced_motion") {
            settings.reduced_motion = rm == "true";
        }
        if let Ok(Some(w)) = self.repo.get("island_width") {
            if let Ok(num) = w.parse::<u32>() {
                settings.island_width =
                    num.clamp(bbq_core::MIN_ISLAND_WIDTH, bbq_core::MAX_ISLAND_WIDTH);
            }
        }
        if let Ok(Some(h)) = self.repo.get("island_height") {
            if let Ok(num) = h.parse::<u32>() {
                settings.island_height =
                    num.clamp(bbq_core::MIN_ISLAND_HEIGHT, bbq_core::MAX_ISLAND_HEIGHT);
            }
        }
        if let Ok(Some(d)) = self.repo.get("target_display_id") {
            if d.trim().is_empty() || d == "null" {
                settings.target_display_id = None;
            } else {
                settings.target_display_id = Some(d);
            }
        }
        if let Ok(Some(a)) = self.repo.get("auto_expand_on_event") {
            settings.auto_expand_on_event = a == "true";
        }
        if let Ok(Some(s)) = self.repo.get("start_at_login") {
            settings.start_at_login = s == "true";
        }
        if let Ok(Some(gh)) = self.repo.get("global_hotkey") {
            let trimmed = gh.trim();
            if !trimmed.is_empty() && trimmed.len() <= bbq_core::MAX_HOTKEY_LEN {
                settings.global_hotkey = trimmed.to_string();
            }
        }
        if let Ok(Some(he)) = self.repo.get("hotkey_enabled") {
            settings.hotkey_enabled = he == "true";
        }
        if let Ok(Some(ch)) = self.repo.get("clipboard_history_enabled") {
            settings.clipboard_history_enabled = ch == "true";
        }
        if let Ok(Some(crd)) = self.repo.get("clipboard_retention_days") {
            if let Ok(num) = crd.parse::<u32>() {
                settings.clipboard_retention_days = num.clamp(
                    bbq_core::MIN_CLIPBOARD_RETENTION_DAYS,
                    bbq_core::MAX_CLIPBOARD_RETENTION_DAYS,
                );
            }
        }
        if let Ok(Some(cme)) = self.repo.get("clipboard_max_entries") {
            if let Ok(num) = cme.parse::<usize>() {
                settings.clipboard_max_entries = num.clamp(
                    bbq_core::MIN_CLIPBOARD_MAX_ENTRIES,
                    bbq_core::MAX_CLIPBOARD_MAX_ENTRIES,
                );
            }
        }
        if let Ok(Some(ne)) = self.repo.get("notifications_enabled") {
            settings.notifications_enabled = ne == "true";
        }
        if let Ok(Some(tse)) = self.repo.get("timer_sound_enabled") {
            settings.timer_sound_enabled = tse == "true";
        }
        if let Ok(Some(rse)) = self.repo.get("reminder_sound_enabled") {
            settings.reminder_sound_enabled = rse == "true";
        }
        if let Ok(Some(dw)) = self.repo.get("disabled_widgets") {
            if let Ok(mut list) = serde_json::from_str::<Vec<String>>(&dw) {
                list.truncate(bbq_core::MAX_DISABLED_WIDGETS);
                settings.disabled_widgets = list;
            }
        }
        if let Ok(Some(cio)) = self.repo.get("compact_indicator_order") {
            if let Ok(mut list) = serde_json::from_str::<Vec<String>>(&cio) {
                list.truncate(bbq_core::MAX_DISABLED_WIDGETS);
                settings.compact_indicator_order = list;
            }
        }
        if let Ok(Some(frc)) = self.repo.get("first_run_completed") {
            settings.first_run_completed = frc == "true";
        }
        if let Ok(Some(oc)) = self.repo.get("onboarding_completed") {
            settings.onboarding_completed = oc == "true";
        }

        Ok(settings)
    }

    fn update_setting(&self, key: &str, value: &str) -> BbqResult<()> {
        validate_setting_entry(key, value)?;
        self.repo.set(key, value)?;

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

        self.notify_change(settings);
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
