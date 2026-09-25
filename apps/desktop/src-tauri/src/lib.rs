#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

use bbq_core::{init_logging, AppDirectories, IslandMode};
use bbq_platform::{create_default_platform_provider, PlatformProvider};
use bbq_services::{
    ClipboardService, DisplayService, DropService, FileService, HotkeyService, LauncherService,
    NotificationService, ReminderService, ServiceRegistry, SettingsService, SystemService,
    TimerService, WindowService,
};
use bbq_storage::DatabaseManager;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub mod commands;
pub mod events;
pub mod tray;

use commands::*;

pub struct AppState {
    pub current_mode: Mutex<IslandMode>,
    pub last_geometry: Mutex<Option<bbq_core::IslandGeometry>>,
    pub services: ServiceRegistry,
    pub platform: Arc<dyn PlatformProvider>,
    pub db: Arc<DatabaseManager>,
    pub settings_service: Arc<SettingsService>,
    pub clipboard: Arc<ClipboardService>,
    pub file_service: Arc<FileService>,
    pub drop_service: Arc<DropService>,
    pub system_service: Arc<SystemService>,
    pub timer_service: Arc<TimerService>,
    pub notification_service: Arc<NotificationService>,
    pub reminder_service: Arc<ReminderService>,
    pub launcher_service: Arc<LauncherService>,
    pub hotkey_service: Arc<HotkeyService>,
    pub display_service: Arc<DisplayService>,
    pub window_service: Arc<WindowService>,
    pub media_service: Arc<bbq_services::MediaService>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("current_mode", &self.current_mode)
            .field("services", &self.services)
            .finish()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = init_logging();
    tracing::info!("Starting BBQ Desktop runtime");

    let dirs = AppDirectories::resolve().unwrap_or_else(|_| AppDirectories {
        config_dir: std::path::PathBuf::from(".bbq/config"),
        data_dir: std::path::PathBuf::from(".bbq/data"),
        cache_dir: std::path::PathBuf::from(".bbq/cache"),
        logs_dir: std::path::PathBuf::from(".bbq/logs"),
    });
    let _ = dirs.ensure_created();

    let db_path = dirs.data_dir.join("bbq.sqlite");
    let (db, db_recovered_quarantine) = match DatabaseManager::open_with_recovery(&db_path) {
        Ok((d, q_opt)) => (Arc::new(d), q_opt),
        Err(err) => {
            tracing::error!(
                "Failed to open/recover disk database at {}: {}. Falling back to in-memory DB.",
                db_path.display(),
                err
            );
            (
                Arc::new(
                    DatabaseManager::open_in_memory()
                        .expect("In-memory SQLite must always succeed"),
                ),
                None,
            )
        }
    };

    let platform = create_default_platform_provider();

    let clipboard_repo = db.clipboard_repository();
    let settings_repo = db.settings_repository();
    let file_repo = db.file_repository();
    let reminder_repo = db.reminder_repository();
    let launcher_repo = db.launcher_repository();

    let storage_service = Arc::new(bbq_services::StorageService::new(db.clone()));
    let settings_service =
        Arc::new(SettingsService::new(settings_repo.clone()).with_autostart(platform.autostart()));
    let display_service = Arc::new(DisplayService::new(platform.display()));
    let window_service = Arc::new(WindowService::new(platform.window()));
    let media_service = Arc::new(bbq_services::MediaService::new(platform.media()));
    let clipboard = Arc::new(ClipboardService::new(
        platform.clipboard(),
        Some(clipboard_repo),
        Some(settings_repo.clone()),
    ));
    let system_service = Arc::new(SystemService::new(platform.system()));
    let notification_service = Arc::new(NotificationService::new(
        platform.notification(),
        Some(settings_service.clone()),
    ));
    let reminder_service = Arc::new(ReminderService::new(
        Some(reminder_repo),
        notification_service.clone(),
    ));
    let network_service = Arc::new(bbq_services::NetworkService::new(platform.network()));
    let timer_service = Arc::new(TimerService::new());
    let file_service = Arc::new(FileService::new(platform.file(), Some(file_repo)));
    let launcher_service = Arc::new(LauncherService::new(
        platform.launcher(),
        Some(launcher_repo),
    ));
    let drop_service = Arc::new(DropService::new(
        platform.file(),
        clipboard.clone(),
        Some(file_service.clone()),
    ));
    let hotkey_service = Arc::new(HotkeyService::new(
        platform.hotkey(),
        Some(settings_service.clone()),
    ));

    let mut services = ServiceRegistry::new();
    services.register(storage_service);
    services.register(settings_service.clone());
    services.register(display_service.clone());
    services.register(window_service.clone());
    services.register(media_service.clone());
    services.register(clipboard.clone());
    services.register(system_service.clone());
    services.register(notification_service.clone());
    services.register(reminder_service.clone());
    services.register(network_service);
    services.register(timer_service.clone());
    services.register(file_service.clone());
    services.register(launcher_service.clone());
    services.register(drop_service.clone());
    services.register(hotkey_service.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            tracing::info!("Single-instance check triggered: focusing existing BBQ instance");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            let valid_paths = bbq_services::drop::filter_cli_paths(&args, Some(&cwd));
            if !valid_paths.is_empty() {
                tracing::info!(
                    "Single-instance forwarding {} validated path(s) to Drop Shelf",
                    valid_paths.len()
                );
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    use bbq_services::DropServiceTrait;
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        if let Err(e) = state.drop_service.inspect(&valid_paths).await {
                            tracing::warn!(
                                "Failed to forward single-instance paths to Drop Shelf: {}",
                                e
                            );
                        }
                    }
                });
            }
        }))
        .manage(AppState {
            current_mode: Mutex::new(IslandMode::Idle),
            last_geometry: Mutex::new(None),
            services,
            platform,
            db,
            settings_service,
            clipboard,
            file_service,
            drop_service,
            system_service,
            timer_service,
            notification_service,
            reminder_service,
            launcher_service,
            hotkey_service,
            display_service,
            window_service,
            media_service,
        })
        .invoke_handler(tauri::generate_handler![
            get_island_state,
            set_island_mode,
            get_displays,
            get_primary_display,
            get_active_display,
            get_display_capabilities,
            calculate_island_geometry,
            apply_island_geometry,
            get_settings,
            update_setting,
            update_settings,
            reset_settings_to_defaults,
            get_service_statuses,
            media_get_current_session,
            media_play,
            media_pause,
            media_toggle_play_pause,
            media_next,
            media_previous,
            media_seek,
            clipboard_get_history,
            clipboard_clear_history,
            clipboard_delete_entry,
            clipboard_set_history_enabled,
            clipboard_get_status,
            clipboard_write_text,
            file_get_workspace,
            file_add,
            file_open,
            file_reveal,
            file_remove,
            file_clear_workspace,
            drop_inspect,
            drop_get_actions,
            drop_execute,
            drop_clear,
            system_get_state,
            system_get_capabilities,
            system_set_volume,
            system_set_muted,
            system_toggle_muted,
            timer_get_state,
            timer_start_countdown,
            timer_start_stopwatch,
            timer_start_pomodoro,
            timer_pause,
            timer_resume,
            timer_reset,
            timer_cancel,
            timer_set_mode,
            notification_get_capabilities,
            reminder_list,
            reminder_create,
            reminder_cancel,
            reminder_get,
            reminder_clear_fired,
            launcher_get_capabilities,
            launcher_list,
            launcher_search,
            launcher_launch,
            launcher_add_favorite,
            launcher_remove_favorite,
            launcher_list_favorites,
            launcher_list_recent,
            launcher_clear_recent,
            hotkey_get_definition,
            hotkey_update_definition,
            hotkey_get_capabilities,
            get_platform_capabilities,
        ])
        .setup(move |app| {
            let handle = app.handle();
            let state = handle.state::<AppState>();

            // Asynchronously initialize all registered services
            let services_clone = state.services.get_statuses();
            tracing::info!(
                "Registered {} services in BBQ registry",
                services_clone.len()
            );

            // If a corrupted database was quarantined and recovered, emit a safe warning event to frontend
            if let Some(backup_file) = db_recovered_quarantine.clone() {
                let recovery_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    use tauri::Emitter;
                    let _ = recovery_handle.emit(
                        "bbq://db_recovered",
                        serde_json::json!({
                            "recovered": true,
                            "backup_name": backup_file,
                            "message": "A damaged database was quarantined and a clean database was initialized.",
                        }),
                    );
                });
            }

            // Initialize System Tray
            if let Err(e) = tray::setup_tray(handle) {
                tracing::warn!("Failed to initialize system tray: {}", e);
            }

            // Consolidated async initialization and event forwarding
            events::wire_service_events(handle, &state);

            // Setup main window and DragDrop listener
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_shadow(false);
                let drop_svc_window = state.drop_service.clone();
                let app_handle_window_drop = handle.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                        let drop_svc = drop_svc_window.clone();
                        let app_emit = app_handle_window_drop.clone();
                        let paths_str: Vec<String> = paths
                            .iter()
                            .map(|p| p.to_string_lossy().to_string())
                            .collect();
                        tauri::async_runtime::spawn(async move {
                            use bbq_services::DropServiceTrait;
                            if let Ok(batch) = drop_svc.inspect(&paths_str).await {
                                use tauri::Emitter;
                                let _ = app_emit.emit(
                                    "bbq://drop_changed",
                                    serde_json::json!({
                                        "type": "inspected",
                                        "batch": batch
                                    }),
                                );
                            }
                        });
                    }
                    tauri::WindowEvent::Focused(false) => {
                        use tauri::Emitter;
                        let _ = app_handle_window_drop.emit("bbq://window_blur", ());
                    }
                    _ => {}
                });

                use bbq_services::SettingsServiceTrait;
                let display_svc = state.display_service.clone();
                let win_svc = state.window_service.clone();
                let initial_settings = state.settings_service.get_settings().unwrap_or_default();
                let initial_layout = if !initial_settings.onboarding_completed {
                    if let Ok(mut current) = state.current_mode.lock() {
                        *current = IslandMode::Expanded;
                    }
                    bbq_core::IslandLayoutState::Expanded
                } else {
                    bbq_core::IslandLayoutState::Idle
                };
                let window_clone = window.clone();
                let initial_target_display_id = initial_settings.target_display_id.clone();
                let initial_island_width = initial_settings.island_width;
                let initial_island_height = initial_settings.island_height;
                let handle_geo = handle.clone();
                tauri::async_runtime::spawn(async move {
                    use bbq_services::DisplayServiceTrait;
                    use bbq_services::WindowServiceTrait;
                    if let Ok(target_display) = display_svc
                        .get_target_display(initial_target_display_id.as_deref())
                        .await
                    {
                        let (calc_state, dims) = match initial_layout {
                            bbq_core::IslandLayoutState::Expanded => {
                                (bbq_core::IslandLayoutState::Expanded, None)
                            }
                            _ => (
                                bbq_core::IslandLayoutState::Hovering,
                                Some(bbq_core::WidgetDimensions {
                                    preferred_width: Some(initial_island_width),
                                    preferred_height: Some(initial_island_height),
                                }),
                            ),
                        };
                        let geo = bbq_core::calculate_island_geometry(
                            &target_display,
                            calc_state,
                            dims,
                            bbq_core::IslandAnchor::TopCenter,
                        );
                        if let Some(state_ref) = handle_geo.try_state::<AppState>() {
                            if let Ok(mut last) = state_ref.last_geometry.lock() {
                                *last = Some(geo.clone());
                            }
                        }
                        let _ = window_clone.set_size(tauri::Size::Logical(tauri::LogicalSize {
                            width: geo.width as f64,
                            height: geo.height as f64,
                        }));
                        let _ = window_clone.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition {
                                x: geo.x as f64,
                                y: geo.y as f64,
                            },
                        ));
                        let _ = win_svc.apply_geometry(&geo).await;
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building BBQ desktop application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    let db = state.db.clone();
                    let services = state.services.clone();
                    tauri::async_runtime::block_on(async move {
                        // 1. Controlled shutdown of all services in reverse dependency order (bounded timeout)
                        let _ = services.stop_all().await;
                        // 2. Perform SQLite WAL truncate checkpoint during clean shutdown
                        if let Err(e) = db.checkpoint_wal() {
                            tracing::warn!("SQLite WAL checkpoint on exit reported: {}", e);
                        }
                    });
                }
            }
        });
}
