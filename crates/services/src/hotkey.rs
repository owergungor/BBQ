use async_trait::async_trait;
use bbq_core::{BbqError, BbqEvent, BbqResult};
use bbq_platform::{HotkeyCapabilities, HotkeyDefinition, PlatformHotkey};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

use crate::settings::SettingsServiceTrait;
use crate::traits::{Service, ServiceState, ServiceStatus};

pub type HotkeyServiceEventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;

#[async_trait]
pub trait HotkeyServiceTrait: Service {
    async fn get_definition(&self) -> BbqResult<HotkeyDefinition>;
    async fn update_definition(&self, definition: HotkeyDefinition) -> BbqResult<()>;
    async fn get_capabilities(&self) -> BbqResult<HotkeyCapabilities>;
    async fn subscribe_events(&self, sink: HotkeyServiceEventSink) -> BbqResult<()>;
    async fn set_enabled(&self, enabled: bool) -> BbqResult<()>;
}

pub struct HotkeyService {
    platform: Arc<dyn PlatformHotkey>,
    settings: Option<Arc<dyn SettingsServiceTrait>>,
    current_definition: Arc<Mutex<HotkeyDefinition>>,
    event_sinks: Arc<Mutex<Vec<HotkeyServiceEventSink>>>,
    status: Arc<Mutex<ServiceStatus>>,
    running: AtomicBool,
}

impl std::fmt::Debug for HotkeyService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let display = self
            .current_definition
            .lock()
            .map(|g| g.display_str.clone())
            .unwrap_or_else(|e| e.into_inner().display_str.clone());

        f.debug_struct("HotkeyService")
            .field("running", &self.running.load(Ordering::SeqCst))
            .field("definition", &display)
            .finish()
    }
}

impl HotkeyService {
    pub fn new(
        platform: Arc<dyn PlatformHotkey>,
        settings: Option<Arc<dyn SettingsServiceTrait>>,
    ) -> Self {
        let default_def = HotkeyDefinition::default_command_surface();
        Self {
            platform,
            settings,
            current_definition: Arc::new(Mutex::new(default_def)),
            event_sinks: Arc::new(Mutex::new(Vec::new())),
            status: Arc::new(Mutex::new(ServiceStatus {
                name: "HotkeyService",
                state: ServiceState::Active,
                message: None,
            })),
            running: AtomicBool::new(false),
        }
    }

    fn notify_sinks(&self, event: BbqEvent) {
        let sinks = self
            .event_sinks
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|e| e.into_inner().clone());
        for sink in sinks {
            sink(event.clone());
        }
    }
}

#[async_trait]
impl Service for HotkeyService {
    fn name(&self) -> &'static str {
        "HotkeyService"
    }

    async fn init(&self) -> BbqResult<()> {
        info!("Initializing HotkeyService");

        // Load custom hotkey configuration if settings are available
        if let Some(ref settings) = self.settings {
            if let Ok(app_settings) = settings.get_settings() {
                if !app_settings.global_hotkey.trim().is_empty() {
                    let parsed = HotkeyDefinition::from_display_string(
                        "global_command_surface",
                        &app_settings.global_hotkey,
                    );
                    let mut def_guard = self
                        .current_definition
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    *def_guard = parsed;
                }
            }
        }

        // Subscribe to platform hotkey triggers
        let current_def = self.current_definition.clone();
        let event_sinks = self.event_sinks.clone();

        self.platform
            .subscribe(Arc::new(move |triggered_id: String| {
                let def = current_def
                    .lock()
                    .map(|g| g.clone())
                    .unwrap_or_else(|e| e.into_inner().clone());
                if def.id == triggered_id {
                    let event = BbqEvent::HotkeyTriggered {
                        id: def.id.clone(),
                        display_str: def.display_str.clone(),
                    };
                    let sinks = event_sinks
                        .lock()
                        .map(|g| g.clone())
                        .unwrap_or_else(|e| e.into_inner().clone());
                    for sink in sinks {
                        sink(event.clone());
                    }
                }
            }))
            .await?;

        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        info!("Starting HotkeyService");
        self.running.store(true, Ordering::SeqCst);

        let enabled = if let Some(ref settings) = self.settings {
            settings
                .get_settings()
                .map(|s| s.hotkey_enabled)
                .unwrap_or(true)
        } else {
            true
        };

        if !enabled {
            info!("Hotkey is disabled in settings; staying asleep");
            let mut status = self.status.lock().unwrap_or_else(|e| e.into_inner());
            status.state = ServiceState::Sleeping;
            status.message = Some("Hotkey disabled by user preference".to_string());
            return Ok(());
        }

        let def = self
            .current_definition
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|e| e.into_inner().clone());
        match self.platform.register(&def).await {
            Ok(_) => {
                info!("Registered global hotkey: {}", def.display_str);
                let mut status = self.status.lock().unwrap_or_else(|e| e.into_inner());
                status.state = ServiceState::Active;
                status.message = None;
            }
            Err(e) => {
                warn!("Global hotkey registration conflict/failure: {:?}", e);
                let reason = e.to_string();
                {
                    let mut status = self.status.lock().unwrap_or_else(|e| e.into_inner());
                    status.state = ServiceState::Failed;
                    status.message = Some(format!("Hotkey conflict: {}", reason));
                }
                self.notify_sinks(BbqEvent::HotkeyConflict {
                    id: def.id,
                    display_str: def.display_str,
                    reason,
                });
            }
        }

        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        info!("Stopping HotkeyService");
        self.running.store(false, Ordering::SeqCst);

        let def = self
            .current_definition
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|e| e.into_inner().clone());
        let _ = self.platform.unregister(&def.id).await;

        let mut status = self.status.lock().unwrap_or_else(|e| e.into_inner());
        status.state = ServiceState::Inactive;
        status.message = None;
        Ok(())
    }

    fn status(&self) -> ServiceStatus {
        self.status
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }
}

#[async_trait]
impl HotkeyServiceTrait for HotkeyService {
    async fn get_definition(&self) -> BbqResult<HotkeyDefinition> {
        Ok(self
            .current_definition
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|e| e.into_inner().clone()))
    }

    async fn update_definition(&self, definition: HotkeyDefinition) -> BbqResult<()> {
        if definition.key.trim().is_empty() {
            return Err(BbqError::Validation(
                "Hotkey key cannot be empty".to_string(),
            ));
        }

        if definition.modifiers.is_empty() {
            return Err(BbqError::Validation(
                "Hotkey must include at least one modifier key".to_string(),
            ));
        }

        let old_def = self
            .current_definition
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|e| e.into_inner().clone());

        if old_def == definition {
            return Ok(());
        }

        let _ = self.platform.unregister(&old_def.id).await;

        match self.platform.register(&definition).await {
            Ok(_) => {
                info!("Updated global hotkey: {}", definition.display_str);
                {
                    let mut def_guard = self
                        .current_definition
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    *def_guard = definition.clone();
                }
                {
                    let mut status = self.status.lock().unwrap_or_else(|e| e.into_inner());
                    status.state = ServiceState::Active;
                    status.message = None;
                }
                if let Some(ref settings) = self.settings {
                    let _ = settings.update_setting("global_hotkey", &definition.display_str);
                }
                Ok(())
            }
            Err(e) => {
                warn!("Global hotkey update conflict/failure: {:?}", e);
                let reason = e.to_string();
                // Attempt to restore previous definition
                let _ = self.platform.register(&old_def).await;
                {
                    let mut status = self.status.lock().unwrap_or_else(|e| e.into_inner());
                    status.state = ServiceState::Failed;
                    status.message = Some(format!("Hotkey conflict: {}", reason));
                }
                self.notify_sinks(BbqEvent::HotkeyConflict {
                    id: definition.id.clone(),
                    display_str: definition.display_str.clone(),
                    reason: reason.clone(),
                });
                Err(e)
            }
        }
    }

    async fn get_capabilities(&self) -> BbqResult<HotkeyCapabilities> {
        self.platform.capabilities().await
    }

    async fn subscribe_events(&self, sink: HotkeyServiceEventSink) -> BbqResult<()> {
        let mut sinks = self.event_sinks.lock().unwrap_or_else(|e| e.into_inner());
        sinks.push(sink);
        Ok(())
    }

    async fn set_enabled(&self, enabled: bool) -> BbqResult<()> {
        let is_running = self.running.load(Ordering::SeqCst);
        if enabled {
            if !is_running {
                self.start().await?;
            }
        } else if is_running {
            self.stop().await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::SettingsService;
    use bbq_platform::MockHotkey;
    use bbq_storage::DatabaseManager;

    #[tokio::test]
    async fn test_default_registration() {
        let platform = Arc::new(MockHotkey::default());
        let service = HotkeyService::new(platform.clone(), None);

        service.init().await.expect("init must succeed");
        service.start().await.expect("start must succeed");

        let def = service.get_definition().await.expect("definition");
        assert_eq!(def.id, "global_command_surface");
        assert!(platform.is_registered(&def.id).await.unwrap());
    }

    #[tokio::test]
    async fn test_custom_registration_and_update() {
        let platform = Arc::new(MockHotkey::default());
        let service = HotkeyService::new(platform.clone(), None);

        service.init().await.unwrap();
        service.start().await.unwrap();

        let new_def = HotkeyDefinition::new(
            "global_command_surface",
            "K",
            vec!["Ctrl".to_string(), "Shift".to_string()],
            "Ctrl+Shift+K",
        );

        service
            .update_definition(new_def.clone())
            .await
            .expect("update");
        let current = service.get_definition().await.unwrap();
        assert_eq!(current.display_str, "Ctrl+Shift+K");
        assert!(platform
            .is_registered("global_command_surface")
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn test_duplicate_registration_is_noop() {
        let platform = Arc::new(MockHotkey::default());
        let service = HotkeyService::new(platform.clone(), None);

        service.init().await.unwrap();
        service.start().await.unwrap();

        let initial_reg_count = platform.registered_count();

        // Re-updating with exact same definition
        let def = service.get_definition().await.unwrap();
        service
            .update_definition(def)
            .await
            .expect("duplicate should succeed as no-op");

        assert_eq!(platform.registered_count(), initial_reg_count);
    }

    #[tokio::test]
    async fn test_invalid_hotkey_validation() {
        let platform = Arc::new(MockHotkey::default());
        let service = HotkeyService::new(platform.clone(), None);

        service.init().await.unwrap();
        service.start().await.unwrap();

        // Empty key
        let empty_key = HotkeyDefinition::new(
            "global_command_surface",
            "",
            vec!["Ctrl".to_string()],
            "Ctrl+",
        );
        assert!(service.update_definition(empty_key).await.is_err());

        // Empty modifiers
        let no_mods = HotkeyDefinition::new("global_command_surface", "A", vec![], "A");
        assert!(service.update_definition(no_mods).await.is_err());
    }

    #[tokio::test]
    async fn test_hotkey_conflict_handling() {
        let platform = Arc::new(MockHotkey::default());
        platform.simulate_conflict("Ctrl+Alt+P");

        let service = HotkeyService::new(platform.clone(), None);
        service.init().await.unwrap();
        service.start().await.unwrap();

        let conflicted = HotkeyDefinition::new(
            "global_command_surface",
            "P",
            vec!["Ctrl".to_string(), "Alt".to_string()],
            "Ctrl+Alt+P",
        );

        let res = service.update_definition(conflicted).await;
        assert!(res.is_err());
        assert_eq!(service.status().state, ServiceState::Failed);
    }

    #[tokio::test]
    async fn test_hotkey_persistence_with_settings() {
        let db = DatabaseManager::open_in_memory().unwrap();
        let settings_service = Arc::new(SettingsService::new(db.settings_repository()));
        let platform = Arc::new(MockHotkey::default());

        let service = HotkeyService::new(platform.clone(), Some(settings_service.clone()));
        service.init().await.unwrap();
        service.start().await.unwrap();

        let new_def = HotkeyDefinition::new(
            "global_command_surface",
            "Space",
            vec!["Alt".to_string()],
            "Alt+Space",
        );

        service.update_definition(new_def).await.unwrap();

        // Verify settings stored the updated hotkey string
        let saved_settings = settings_service.get_settings().unwrap();
        assert_eq!(saved_settings.global_hotkey, "Alt+Space");

        // Simulate app restart: new service instance reads persisted hotkey
        let restarted_service =
            HotkeyService::new(platform.clone(), Some(settings_service.clone()));
        restarted_service.init().await.unwrap();
        let def = restarted_service.get_definition().await.unwrap();
        assert_eq!(def.display_str, "Alt+Space");
    }
}
