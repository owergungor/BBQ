#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

pub mod clipboard;
pub mod display;
pub mod drop;
pub mod file;
pub mod hotkey;
pub mod launcher;
pub mod media;
pub mod network;
pub mod notification;
pub mod registry;
pub mod reminder;
pub mod search;
pub mod settings;
pub mod storage;
pub mod system;
pub mod timer;
pub mod traits;
pub mod window;

pub use clipboard::{ClipboardService, ClipboardServiceTrait};
pub use display::{DisplayService, DisplayServiceTrait};
pub use drop::{DropEventSink, DropService, DropServiceTrait};
pub use file::{FileEventSink, FileService, FileServiceTrait, DEFAULT_MAX_WORKSPACE_FILES};
pub use hotkey::{HotkeyService, HotkeyServiceEventSink, HotkeyServiceTrait};
pub use launcher::{LauncherEventSink, LauncherService, LauncherServiceTrait};
pub use media::{MediaService, MediaServiceTrait};
pub use network::{NetworkService, NetworkServiceTrait};
pub use notification::{NotificationService, NotificationServiceTrait};
pub use registry::ServiceRegistry;
pub use reminder::{ReminderService, ReminderServiceTrait, MAX_STARTUP_OVERDUE_NOTIFICATIONS};
pub use search::SearchEngine;
pub use settings::{AppSettings, SettingsService, SettingsServiceTrait};
pub use storage::{StorageService, StorageServiceTrait};
pub use system::{SystemService, SystemServiceTrait};
pub use timer::{TimerService, TimerServiceTrait, MAX_TIMER_DURATION_MS};
pub use traits::{Service, ServiceState, ServiceStatus};
pub use window::{WindowService, WindowServiceTrait};

use bbq_core::BbqResult;
use bbq_platform::PlatformProvider;
use bbq_storage::DatabaseManager;
use std::sync::Arc;

/// Helper to bootstrap all core services with platform and database dependencies
pub fn create_service_registry(
    platform: Arc<dyn PlatformProvider>,
    db: Arc<DatabaseManager>,
) -> BbqResult<ServiceRegistry> {
    let mut registry = ServiceRegistry::new();

    // 1. StorageService
    let storage_service = Arc::new(StorageService::new(db.clone()));
    registry.register(storage_service);

    // 2. SettingsService
    let settings_repo = db.settings_repository();
    let settings_service =
        Arc::new(SettingsService::new(settings_repo.clone()).with_autostart(platform.autostart()));
    registry.register(settings_service.clone());

    // 3. DisplayService
    let display_service = Arc::new(DisplayService::new(platform.display()));
    registry.register(display_service);

    // 4. WindowService
    let window_service = Arc::new(WindowService::new(platform.window()));
    registry.register(window_service);

    // 5. MediaService
    let media_service = Arc::new(MediaService::new(platform.media()));
    registry.register(media_service);

    // 6. ClipboardService
    let clipboard_repo = db.clipboard_repository();
    let clipboard_service = Arc::new(ClipboardService::new(
        platform.clipboard(),
        Some(clipboard_repo),
        Some(settings_repo.clone()),
    ));
    registry.register(clipboard_service.clone());

    // 7. SystemService
    let system_service = Arc::new(SystemService::new(platform.system()));
    registry.register(system_service);

    // 8. NotificationService
    let notification_service = Arc::new(NotificationService::new(
        platform.notification(),
        Some(settings_service.clone()),
    ));
    registry.register(notification_service.clone());

    // 9. ReminderService
    let reminder_repo = db.reminder_repository();
    let reminder_service = Arc::new(ReminderService::new(
        Some(reminder_repo),
        notification_service.clone(),
    ));
    registry.register(reminder_service);

    // 10. NetworkService
    let network_service = Arc::new(NetworkService::new(platform.network()));
    registry.register(network_service);

    // 11. TimerService
    registry.register(Arc::new(TimerService::new()));

    // 12. FileService
    let file_repo = db.file_repository();
    let file_service = Arc::new(FileService::new(platform.file(), Some(file_repo)));
    registry.register(file_service.clone());

    // 13. LauncherService
    let launcher_repo = db.launcher_repository();
    let launcher_service = Arc::new(LauncherService::new(
        platform.launcher(),
        Some(launcher_repo),
    ));
    registry.register(launcher_service);

    // 14. DropService
    let drop_service = Arc::new(DropService::new(
        platform.file(),
        clipboard_service.clone(),
        Some(file_service.clone()),
    ));
    registry.register(drop_service);

    // 15. HotkeyService
    let hotkey_service = Arc::new(HotkeyService::new(
        platform.hotkey(),
        Some(settings_service.clone()),
    ));
    registry.register(hotkey_service);

    Ok(registry)
}
