#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

use bbq_core::{
    init_logging, AppDirectories, BbqSettings, ClipboardEntry, ClipboardStatus, DropAction,
    DropActionResult, DropBatch, FileEntry, IslandMode, LauncherCapabilities, LauncherItem,
    NotificationCapabilities, NotificationCategory, NotificationRequest, PomodoroPhase, Reminder,
    SystemCapabilities, SystemState, TimerMode, TimerSession,
};
use bbq_platform::{
    create_default_platform_provider, DisplayInfo, HotkeyCapabilities, HotkeyDefinition,
    PlatformProvider,
};
use bbq_services::{
    create_service_registry, ClipboardService, ClipboardServiceTrait, DisplayService,
    DisplayServiceTrait, DropService, DropServiceTrait, FileService, FileServiceTrait,
    HotkeyService, HotkeyServiceTrait, LauncherService, LauncherServiceTrait, NotificationService,
    NotificationServiceTrait, ReminderService, ReminderServiceTrait, ServiceRegistry,
    ServiceStatus, SettingsService, SystemService, SystemServiceTrait, TimerService,
    TimerServiceTrait, WindowService, WindowServiceTrait,
};
use bbq_storage::DatabaseManager;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

pub mod tray;

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
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("current_mode", &self.current_mode)
            .field("services", &self.services)
            .finish()
    }
}

#[tauri::command]
fn get_island_state(state: State<'_, AppState>) -> Result<IslandMode, String> {
    state
        .current_mode
        .lock()
        .map(|m| *m)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_island_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    mode: IslandMode,
) -> Result<(), String> {
    if let Ok(mut current) = state.current_mode.lock() {
        if *current == mode {
            return Ok(());
        }
        *current = mode;
    }

    let layout_state = match mode {
        IslandMode::Idle | IslandMode::Collapsing => bbq_core::IslandLayoutState::Idle,
        IslandMode::Active => bbq_core::IslandLayoutState::Hovering,
        IslandMode::Expanding | IslandMode::Expanded | IslandMode::Interacting => {
            bbq_core::IslandLayoutState::Expanded
        }
    };

    use bbq_services::SettingsServiceTrait;
    let settings = state.settings_service.get_settings().unwrap_or_default();
    if let Ok(target_disp) = state
        .display_service
        .get_target_display(settings.target_display_id.as_deref())
        .await
    {
        // For compact envelope (Idle or Hovering), calculate Hovering geometry (260x44)
        // so the OS window maintains a stable envelope and does not oscillate or re-position during hover.
        // For Expanded, calculate 400x280 expanded geometry with dims = None (not idle settings).
        let (calc_state, dims) = match layout_state {
            bbq_core::IslandLayoutState::Expanded => (bbq_core::IslandLayoutState::Expanded, None),
            _ => (
                bbq_core::IslandLayoutState::Hovering,
                Some(bbq_core::WidgetDimensions {
                    preferred_width: Some(settings.island_width),
                    preferred_height: Some(settings.island_height),
                }),
            ),
        };

        let geo = bbq_core::calculate_island_geometry(
            &target_disp,
            calc_state,
            dims,
            bbq_core::IslandAnchor::TopCenter,
        );

        let should_apply = if let Ok(mut last) = state.last_geometry.lock() {
            if let Some(ref last_geo) = *last {
                if last_geo.x == geo.x
                    && last_geo.y == geo.y
                    && last_geo.width == geo.width
                    && last_geo.height == geo.height
                {
                    false
                } else {
                    *last = Some(geo.clone());
                    true
                }
            } else {
                *last = Some(geo.clone());
                true
            }
        } else {
            true
        };

        if should_apply {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width: geo.width as f64,
                    height: geo.height as f64,
                }));
                let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                    x: geo.x as f64,
                    y: geo.y as f64,
                }));
            }
            let _ = state.window_service.apply_geometry(&geo).await;
        }
    }

    use tauri::Emitter;
    let _ = app.emit("bbq://island_mode_changed", mode);
    Ok(())
}

#[tauri::command]
async fn get_displays(state: State<'_, AppState>) -> Result<Vec<DisplayInfo>, String> {
    state
        .display_service
        .list_displays()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_primary_display(state: State<'_, AppState>) -> Result<DisplayInfo, String> {
    state
        .display_service
        .get_primary_display()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_active_display(state: State<'_, AppState>) -> Result<DisplayInfo, String> {
    state
        .display_service
        .get_active_display()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_display_capabilities(
    state: State<'_, AppState>,
) -> Result<bbq_core::DisplayCapabilities, String> {
    Ok(state.display_service.capabilities())
}

#[tauri::command]
async fn calculate_island_geometry(
    state: State<'_, AppState>,
    layout_state: bbq_core::IslandLayoutState,
    widget_dims: Option<bbq_core::WidgetDimensions>,
    anchor: Option<bbq_core::IslandAnchor>,
    display_id: Option<String>,
) -> Result<bbq_core::IslandGeometry, String> {
    let display = state
        .display_service
        .get_target_display(display_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    let anchor = anchor.unwrap_or(bbq_core::IslandAnchor::TopCenter);
    Ok(bbq_core::calculate_island_geometry(
        &display,
        layout_state,
        widget_dims,
        anchor,
    ))
}

#[tauri::command]
async fn apply_island_geometry(
    app: AppHandle,
    state: State<'_, AppState>,
    geometry: bbq_core::IslandGeometry,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: geometry.width as f64,
            height: geometry.height as f64,
        }));
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
            x: geometry.x as f64,
            y: geometry.y as f64,
        }));
    }
    state
        .window_service
        .apply_geometry(&geometry)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<BbqSettings, String> {
    use bbq_services::SettingsServiceTrait;
    state
        .settings_service
        .get_settings()
        .map_err(|e| e.to_string())
}

async fn sync_runtime_services_with_settings(
    app: &AppHandle,
    state: &AppState,
    prev: Option<&BbqSettings>,
    current: &BbqSettings,
) {
    use bbq_platform::HotkeyDefinition;
    use bbq_services::{
        ClipboardServiceTrait, DisplayServiceTrait, HotkeyServiceTrait, WindowServiceTrait,
    };

    // 1. Clipboard runtime synchronization
    if prev.map(|p| p.clipboard_history_enabled) != Some(current.clipboard_history_enabled) {
        let _ = state
            .clipboard
            .set_history_enabled(current.clipboard_history_enabled)
            .await;
    }
    if prev.map(|p| p.clipboard_max_entries) != Some(current.clipboard_max_entries) {
        state
            .clipboard
            .set_max_entries(current.clipboard_max_entries);
    }

    // 2. Hotkey runtime synchronization
    if prev.map(|p| p.hotkey_enabled) != Some(current.hotkey_enabled) {
        let _ = state
            .hotkey_service
            .set_enabled(current.hotkey_enabled)
            .await;
    }
    if current.hotkey_enabled
        && prev.map(|p| p.global_hotkey.as_str()) != Some(&current.global_hotkey)
    {
        let def =
            HotkeyDefinition::from_display_string("global_command_surface", &current.global_hotkey);
        let _ = state.hotkey_service.update_definition(def).await;
    }

    // 3. Target Display & Geometry runtime synchronization
    let target_display_changed =
        prev.and_then(|p| p.target_display_id.as_deref()) != current.target_display_id.as_deref();
    let dims_changed = prev.map(|p| p.island_width) != Some(current.island_width)
        || prev.map(|p| p.island_height) != Some(current.island_height);

    if target_display_changed || dims_changed {
        if let Ok(mut last) = state.last_geometry.lock() {
            *last = None;
        }
        if let Ok(display) = state
            .display_service
            .get_target_display(current.target_display_id.as_deref())
            .await
        {
            let mode = *state.current_mode.lock().unwrap_or_else(|e| e.into_inner());
            let (layout_state, dims) = match mode {
                IslandMode::Expanded | IslandMode::Interacting | IslandMode::Expanding => {
                    (bbq_core::IslandLayoutState::Expanded, None)
                }
                _ => (
                    bbq_core::IslandLayoutState::Hovering,
                    Some(bbq_core::WidgetDimensions {
                        preferred_width: Some(current.island_width),
                        preferred_height: Some(current.island_height),
                    }),
                ),
            };

            if matches!(
                mode,
                IslandMode::Idle | IslandMode::Active | IslandMode::Collapsing
            ) {
                let geo = bbq_core::calculate_island_geometry(
                    &display,
                    layout_state,
                    dims,
                    bbq_core::IslandAnchor::TopCenter,
                );
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                        width: geo.width as f64,
                        height: geo.height as f64,
                    }));
                    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                        x: geo.x as f64,
                        y: geo.y as f64,
                    }));
                }
                if let Ok(mut last) = state.last_geometry.lock() {
                    *last = Some(geo.clone());
                }
                let _ = state.window_service.apply_geometry(&geo).await;
            }
        }
    }
}

#[tauri::command]
async fn update_setting(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    use bbq_services::SettingsServiceTrait;
    let prev = state.settings_service.get_settings().ok();
    state
        .settings_service
        .update_setting(&key, &value)
        .map_err(|e| e.to_string())?;

    let updated = state
        .settings_service
        .get_settings()
        .map_err(|e| e.to_string())?;

    sync_runtime_services_with_settings(&app, &state, prev.as_ref(), &updated).await;

    use tauri::Emitter;
    let _ = app.emit("bbq://settings_changed", &updated);
    Ok(())
}

#[tauri::command]
async fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: BbqSettings,
) -> Result<(), String> {
    use bbq_services::SettingsServiceTrait;
    let prev = state.settings_service.get_settings().ok();
    state
        .settings_service
        .update_settings(&settings)
        .map_err(|e| e.to_string())?;

    sync_runtime_services_with_settings(&app, &state, prev.as_ref(), &settings).await;

    use tauri::Emitter;
    let _ = app.emit("bbq://settings_changed", &settings);
    Ok(())
}

#[tauri::command]
async fn reset_settings_to_defaults(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BbqSettings, String> {
    use bbq_services::SettingsServiceTrait;
    let prev = state.settings_service.get_settings().ok();
    let defaults = state
        .settings_service
        .reset_to_defaults()
        .map_err(|e| e.to_string())?;

    sync_runtime_services_with_settings(&app, &state, prev.as_ref(), &defaults).await;

    use tauri::Emitter;
    let _ = app.emit("bbq://settings_changed", &defaults);
    Ok(defaults)
}

#[tauri::command]
fn get_service_statuses(state: State<'_, AppState>) -> Result<Vec<ServiceStatus>, String> {
    Ok(state.services.get_statuses())
}

#[tauri::command]
async fn media_get_current_session(
    state: State<'_, AppState>,
) -> Result<Option<bbq_core::MediaSession>, String> {
    let media = bbq_services::MediaService::new(state.platform.media());
    use bbq_services::MediaServiceTrait;
    media.current_session().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn media_play(state: State<'_, AppState>) -> Result<(), String> {
    let media = bbq_services::MediaService::new(state.platform.media());
    use bbq_services::MediaServiceTrait;
    media.play().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn media_pause(state: State<'_, AppState>) -> Result<(), String> {
    let media = bbq_services::MediaService::new(state.platform.media());
    use bbq_services::MediaServiceTrait;
    media.pause().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn media_toggle_play_pause(state: State<'_, AppState>) -> Result<(), String> {
    let media = bbq_services::MediaService::new(state.platform.media());
    use bbq_services::MediaServiceTrait;
    media.toggle_play_pause().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn media_next(state: State<'_, AppState>) -> Result<(), String> {
    let media = bbq_services::MediaService::new(state.platform.media());
    use bbq_services::MediaServiceTrait;
    media.next().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn media_previous(state: State<'_, AppState>) -> Result<(), String> {
    let media = bbq_services::MediaService::new(state.platform.media());
    use bbq_services::MediaServiceTrait;
    media.previous().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn clipboard_get_history(state: State<'_, AppState>) -> Result<Vec<ClipboardEntry>, String> {
    state
        .clipboard
        .get_history()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clipboard_clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state
        .clipboard
        .clear_history()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clipboard_delete_entry(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .clipboard
        .delete_entry(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clipboard_set_history_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    state
        .clipboard
        .set_history_enabled(enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn clipboard_get_status(state: State<'_, AppState>) -> Result<ClipboardStatus, String> {
    state
        .clipboard
        .get_status()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn file_get_workspace(state: State<'_, AppState>) -> Result<Vec<FileEntry>, String> {
    state
        .file_service
        .get_workspace()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn file_add(
    state: State<'_, AppState>,
    path: String,
    source: Option<String>,
) -> Result<FileEntry, String> {
    state
        .file_service
        .add_file(&path, source)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn file_open(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .file_service
        .open_file(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn file_reveal(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .file_service
        .reveal_file(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn file_remove(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .file_service
        .remove_file(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn file_clear_workspace(state: State<'_, AppState>) -> Result<(), String> {
    state
        .file_service
        .clear_workspace()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn drop_inspect(state: State<'_, AppState>, paths: Vec<String>) -> Result<DropBatch, String> {
    state
        .drop_service
        .inspect(&paths)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn drop_get_actions(
    state: State<'_, AppState>,
    batch_id: String,
) -> Result<Vec<DropAction>, String> {
    state
        .drop_service
        .get_actions(&batch_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn drop_execute(
    state: State<'_, AppState>,
    batch_id: String,
    action: DropAction,
    target_id: Option<String>,
) -> Result<DropActionResult, String> {
    state
        .drop_service
        .execute_action(&batch_id, action, target_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn drop_clear(state: State<'_, AppState>) -> Result<(), String> {
    state.drop_service.clear().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn system_get_state(state: State<'_, AppState>) -> Result<SystemState, String> {
    state
        .system_service
        .get_state()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn system_get_capabilities(state: State<'_, AppState>) -> Result<SystemCapabilities, String> {
    state
        .system_service
        .get_capabilities()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn system_set_volume(state: State<'_, AppState>, volume: f32) -> Result<(), String> {
    state
        .system_service
        .set_volume(volume)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn system_set_muted(state: State<'_, AppState>, muted: bool) -> Result<(), String> {
    state
        .system_service
        .set_muted(muted)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn system_toggle_muted(state: State<'_, AppState>) -> Result<(), String> {
    state
        .system_service
        .toggle_muted()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_get_state(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .get_state()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_start_countdown(
    state: State<'_, AppState>,
    duration_ms: u64,
) -> Result<TimerSession, String> {
    state
        .timer_service
        .start_countdown(duration_ms)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_start_stopwatch(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .start_stopwatch()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_start_pomodoro(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .start_pomodoro()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_pause(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state.timer_service.pause().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_resume(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .resume()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_reset(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state.timer_service.reset().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_cancel(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .cancel()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_set_mode(
    state: State<'_, AppState>,
    mode: TimerMode,
    duration_ms: Option<u64>,
) -> Result<TimerSession, String> {
    state
        .timer_service
        .set_mode(mode, duration_ms)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn notification_get_capabilities(
    state: State<'_, AppState>,
) -> Result<NotificationCapabilities, String> {
    state
        .notification_service
        .capabilities()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reminder_list(state: State<'_, AppState>) -> Result<Vec<Reminder>, String> {
    state
        .reminder_service
        .list_reminders()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reminder_create(
    state: State<'_, AppState>,
    title: String,
    body: Option<String>,
    due_at: u64,
) -> Result<Reminder, String> {
    state
        .reminder_service
        .create_reminder(&title, body, due_at)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reminder_cancel(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    state
        .reminder_service
        .cancel_reminder(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reminder_get(state: State<'_, AppState>, id: String) -> Result<Option<Reminder>, String> {
    state
        .reminder_service
        .get_reminder(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reminder_clear_fired(state: State<'_, AppState>) -> Result<(), String> {
    state
        .reminder_service
        .clear_fired()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_get_capabilities(
    state: State<'_, AppState>,
) -> Result<LauncherCapabilities, String> {
    state
        .launcher_service
        .get_capabilities()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_list(state: State<'_, AppState>) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .list_items()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_search(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .search_items(&query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_launch(state: State<'_, AppState>, item_id: String) -> Result<(), String> {
    state
        .launcher_service
        .launch_item(&item_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_add_favorite(state: State<'_, AppState>, item_id: String) -> Result<(), String> {
    state
        .launcher_service
        .add_favorite(&item_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_remove_favorite(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<(), String> {
    state
        .launcher_service
        .remove_favorite(&item_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_list_favorites(state: State<'_, AppState>) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .list_favorites()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_list_recent(state: State<'_, AppState>) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .list_recent()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launcher_clear_recent(state: State<'_, AppState>) -> Result<(), String> {
    state
        .launcher_service
        .clear_recent()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn hotkey_get_definition(state: State<'_, AppState>) -> Result<HotkeyDefinition, String> {
    state
        .hotkey_service
        .get_definition()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn hotkey_update_definition(
    state: State<'_, AppState>,
    definition: HotkeyDefinition,
) -> Result<(), String> {
    state
        .hotkey_service
        .update_definition(definition)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn hotkey_get_capabilities(state: State<'_, AppState>) -> Result<HotkeyCapabilities, String> {
    state
        .hotkey_service
        .get_capabilities()
        .await
        .map_err(|e| e.to_string())
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
    let db = match DatabaseManager::open(&db_path) {
        Ok(d) => Arc::new(d),
        Err(err) => {
            tracing::error!(
                "Failed to open disk database at {}: {}. Falling back to in-memory DB.",
                db_path.display(),
                err
            );
            Arc::new(
                DatabaseManager::open_in_memory().expect("In-memory SQLite must always succeed"),
            )
        }
    };

    let platform = create_default_platform_provider();
    let services = create_service_registry(platform.clone(), db.clone())
        .expect("Service registry bootstrap must succeed");

    let clipboard_repo = db.clipboard_repository();
    let settings_repo = db.settings_repository();
    let file_repo = db.file_repository();

    let settings_service = Arc::new(
        SettingsService::new(db.settings_repository()).with_autostart(platform.autostart()),
    );
    let clipboard = Arc::new(ClipboardService::new(
        platform.clipboard(),
        Some(clipboard_repo),
        Some(settings_repo),
    ));
    let file_service = Arc::new(FileService::new(platform.file(), Some(file_repo)));
    let system_service = Arc::new(SystemService::new(platform.system()));
    let timer_service = Arc::new(TimerService::new());
    let notification_service = Arc::new(NotificationService::new(
        platform.notification(),
        Some(settings_service.clone()),
    ));
    let reminder_repo = db.reminder_repository();
    let reminder_service = Arc::new(ReminderService::new(
        Some(reminder_repo),
        notification_service.clone(),
    ));
    let launcher_repo = db.launcher_repository();
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
    let display_service = Arc::new(DisplayService::new(platform.display()));
    let window_service = Arc::new(WindowService::new(platform.window()));

    tauri::Builder::default()
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
            clipboard_get_history,
            clipboard_clear_history,
            clipboard_delete_entry,
            clipboard_set_history_enabled,
            clipboard_get_status,
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
            hotkey_get_capabilities
        ])
        .setup(|app| {
            let handle = app.handle();
            let state = handle.state::<AppState>();

            // Asynchronously initialize all registered services
            let services_clone = state.services.get_statuses();
            tracing::info!(
                "Registered {} services in BBQ registry",
                services_clone.len()
            );

            // Initialize System Tray
            if let Err(e) = tray::setup_tray(handle) {
                tracing::warn!("Failed to initialize system tray: {}", e);
            }

            // Forward media events to frontend
            let app_handle = handle.clone();
            let platform_media = state.platform.media();
            tauri::async_runtime::spawn(async move {
                let _ = platform_media
                    .subscribe(Arc::new(move |event| {
                        use tauri::Emitter;
                        match event {
                            bbq_core::MediaEvent::SessionChanged(session) => {
                                let _ = app_handle.emit("bbq://media_changed", session);
                            }
                            bbq_core::MediaEvent::PlaybackChanged { state, .. } => {
                                let _ = app_handle.emit("bbq://media_playback_state", state);
                            }
                            _ => {}
                        }
                    }))
                    .await;
            });

            // Forward clipboard events to frontend
            let app_handle_clip = handle.clone();
            let clipboard_clone = state.clipboard.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = clipboard_clone.init().await;
                use bbq_services::ClipboardServiceTrait;
                let _ = clipboard_clone
                    .subscribe_events(Arc::new(move |entry| {
                        use tauri::Emitter;
                        let _ = app_handle_clip.emit("bbq://clipboard_changed", entry);
                    }))
                    .await;
            });

            // Forward file events to frontend
            let app_handle_file = handle.clone();
            let file_clone = state.file_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = file_clone.init().await;
                use bbq_services::FileServiceTrait;
                let _ = file_clone
                    .subscribe_events(Arc::new(move |event| {
                        use tauri::Emitter;
                        match event {
                            bbq_core::BbqEvent::FileAdded { entry } => {
                                let _ = app_handle_file.emit("bbq://file_added", entry);
                            }
                            bbq_core::BbqEvent::FileRemoved { id } => {
                                let _ = app_handle_file.emit("bbq://file_removed", id);
                            }
                            bbq_core::BbqEvent::FileWorkspaceChanged { entries } => {
                                let _ =
                                    app_handle_file.emit("bbq://file_workspace_changed", entries);
                            }
                            _ => {}
                        }
                    }))
                    .await;
            });

            // Forward system events to frontend
            let app_handle_system = handle.clone();
            let system_clone = state.system_service.clone();
            let platform_sys = state.platform.system();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = system_clone.init().await;
                let sys_for_emit = system_clone.clone();
                let _ = platform_sys
                    .subscribe(Arc::new(move |_event| {
                        use tauri::Emitter;
                        let app_emit = app_handle_system.clone();
                        let sys_read = sys_for_emit.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Ok(state) = sys_read.get_state().await {
                                let _ = app_emit.emit("bbq://system_changed", state);
                            }
                        });
                    }))
                    .await;
            });

            // Forward timer events to frontend and coordinate desktop notification on completion
            let app_handle_timer = handle.clone();
            let timer_clone = state.timer_service.clone();
            let notif_for_timer = state.notification_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = timer_clone.init().await;
                let _ = timer_clone
                    .subscribe_events(Arc::new(move |event| {
                        use tauri::Emitter;
                        match event {
                            bbq_core::BbqEvent::TimerCompleted(ref session) => {
                                let _ = app_handle_timer.emit("bbq://timer_changed", session);

                                // Application Event Layer: dispatch native notification
                                let notif_res = match session.mode {
                                    TimerMode::Countdown => NotificationRequest::new(
                                        format!("timer_finish_{}", session.id),
                                        NotificationCategory::Timer,
                                        "Timer finished",
                                        "Your countdown is complete.",
                                    ),
                                    TimerMode::Pomodoro => {
                                        let (title, body) = match session.pomodoro_phase {
                                            Some(PomodoroPhase::Work) => (
                                                "Pomodoro break finished",
                                                "Work session starting. Stay focused.",
                                            ),
                                            Some(PomodoroPhase::ShortBreak)
                                            | Some(PomodoroPhase::LongBreak) => (
                                                "Pomodoro finished",
                                                "Work session complete. Take a break.",
                                            ),
                                            None => ("Pomodoro finished", "Session complete."),
                                        };
                                        NotificationRequest::new(
                                            format!("pomodoro_finish_{}", session.id),
                                            NotificationCategory::Pomodoro,
                                            title,
                                            body,
                                        )
                                    }
                                    _ => Err(bbq_core::BbqError::Validation(
                                        "No notification for stopwatch completion".to_string(),
                                    )),
                                };

                                if let Ok(req) = notif_res {
                                    let _ = notif_for_timer.notify(req);
                                }
                            }
                            bbq_core::BbqEvent::TimerStarted(session)
                            | bbq_core::BbqEvent::TimerPaused(session)
                            | bbq_core::BbqEvent::TimerResumed(session)
                            | bbq_core::BbqEvent::TimerReset(session)
                            | bbq_core::BbqEvent::TimerPhaseChanged(session)
                            | bbq_core::BbqEvent::TimerChanged(session) => {
                                let _ = app_handle_timer.emit("bbq://timer_changed", session);
                            }
                            _ => {}
                        }
                    }))
                    .await;
            });

            // Initialize and forward reminder events to frontend
            let app_handle_reminder = handle.clone();
            let reminder_clone = state.reminder_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = reminder_clone.init().await;
                let _ = reminder_clone.subscribe_events(Arc::new(move |event| {
                    use tauri::Emitter;
                    match event {
                        bbq_core::BbqEvent::ReminderCreated(rem)
                        | bbq_core::BbqEvent::ReminderCancelled(rem)
                        | bbq_core::BbqEvent::ReminderFired(rem)
                        | bbq_core::BbqEvent::ReminderChanged(rem) => {
                            let _ = app_handle_reminder.emit("bbq://reminder_changed", rem);
                        }
                        _ => {}
                    }
                }));
            });

            // Initialize and forward notification events to frontend
            let app_handle_notif = handle.clone();
            let notif_clone = state.notification_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = notif_clone.init().await;
                let _ = notif_clone.subscribe_events(Arc::new(move |event| {
                    use tauri::Emitter;
                    match event {
                        bbq_core::BbqEvent::NotificationRequested(req)
                        | bbq_core::BbqEvent::NotificationDelivered(req)
                        | bbq_core::BbqEvent::NotificationUnavailable(req) => {
                            let _ = app_handle_notif.emit("bbq://notification_changed", req);
                        }
                        _ => {}
                    }
                }));
            });

            // Initialize and forward launcher events to frontend
            let app_handle_launcher = handle.clone();
            let launcher_clone = state.launcher_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = launcher_clone.init().await;
                use bbq_services::LauncherServiceTrait;
                let _ = launcher_clone.subscribe_events(Arc::new(move |event| {
                    use tauri::Emitter;
                    match event {
                        bbq_core::BbqEvent::LauncherItemsChanged(items)
                        | bbq_core::BbqEvent::LauncherRecentChanged(items)
                        | bbq_core::BbqEvent::LauncherFavoritesChanged(items) => {
                            let _ = app_handle_launcher.emit("bbq://launcher_changed", items);
                        }
                        bbq_core::BbqEvent::LauncherActionCompleted { item_id, action } => {
                            let _ = app_handle_launcher.emit(
                                "bbq://launcher_changed",
                                serde_json::json!({
                                    "item_id": item_id,
                                    "action": action,
                                    "status": "completed"
                                }),
                            );
                        }
                        bbq_core::BbqEvent::LauncherActionFailed { item_id, error } => {
                            let _ = app_handle_launcher.emit(
                                "bbq://launcher_changed",
                                serde_json::json!({
                                    "item_id": item_id,
                                    "error": error,
                                    "status": "failed"
                                }),
                            );
                        }
                        _ => {}
                    }
                }));
            });

            // Initialize and forward drop events to frontend
            let app_handle_drop = handle.clone();
            let drop_clone = state.drop_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = drop_clone.init().await;
                use bbq_services::DropServiceTrait;
                let _ = drop_clone
                    .subscribe_events(Arc::new(move |event| {
                        use tauri::Emitter;
                        match event {
                            bbq_core::BbqEvent::DropBatchInspected(batch) => {
                                let _ = app_handle_drop.emit(
                                    "bbq://drop_changed",
                                    serde_json::json!({
                                        "type": "inspected",
                                        "batch": batch
                                    }),
                                );
                            }
                            bbq_core::BbqEvent::DropActionExecuted(result) => {
                                let _ = app_handle_drop.emit(
                                    "bbq://drop_changed",
                                    serde_json::json!({
                                        "type": "action_executed",
                                        "result": result
                                    }),
                                );
                            }
                            _ => {}
                        }
                    }))
                    .await;
            });

            // Forward display events to frontend
            let app_handle_display = handle.clone();
            let display_clone = state.display_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = display_clone.init().await;
                use bbq_services::DisplayServiceTrait;
                let _ = display_clone
                    .subscribe_events(Arc::new(move |event| {
                        use tauri::Emitter;
                        if let bbq_core::BbqEvent::DisplayChanged(info) = event {
                            let _ = app_handle_display.emit("bbq://display_changed", info);
                        }
                    }))
                    .await;
            });

            // Initialize and forward hotkey events to frontend
            let app_handle_hotkey = handle.clone();
            let hotkey_clone = state.hotkey_service.clone();
            let hotkey_disp_svc = state.display_service.clone();
            let hotkey_win_svc = state.window_service.clone();
            tauri::async_runtime::spawn(async move {
                use bbq_services::Service;
                let _ = hotkey_clone.init().await;
                let _ = hotkey_clone.start().await;
                use bbq_services::HotkeyServiceTrait;
                let _ = hotkey_clone
                    .subscribe_events(Arc::new(move |event| {
                        use tauri::Emitter;
                        match event {
                            bbq_core::BbqEvent::HotkeyTriggered { id, display_str } => {
                                let window_opt = app_handle_hotkey.get_webview_window("main");
                                let disp_svc = hotkey_disp_svc.clone();
                                let win_svc = hotkey_win_svc.clone();
                                tauri::async_runtime::spawn(async move {
                                    use bbq_services::DisplayServiceTrait;
                                    use bbq_services::WindowServiceTrait;
                                    if let Ok(active_display) = disp_svc.get_active_display().await
                                    {
                                        let geo = bbq_core::calculate_island_geometry(
                                            &active_display,
                                            bbq_core::IslandLayoutState::Expanded,
                                            None,
                                            bbq_core::IslandAnchor::TopCenter,
                                        );
                                        if let Some(ref window) = window_opt {
                                            let _ = window.set_size(tauri::Size::Logical(
                                                tauri::LogicalSize {
                                                    width: geo.width as f64,
                                                    height: geo.height as f64,
                                                },
                                            ));
                                            let _ = window.set_position(tauri::Position::Logical(
                                                tauri::LogicalPosition {
                                                    x: geo.x as f64,
                                                    y: geo.y as f64,
                                                },
                                            ));
                                            let _ = window.unminimize();
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                        let _ = win_svc.apply_geometry(&geo).await;
                                    }
                                });
                                let _ = app_handle_hotkey.emit(
                                    "bbq://hotkey_triggered",
                                    serde_json::json!({
                                        "id": id,
                                        "display_str": display_str
                                    }),
                                );
                            }
                            bbq_core::BbqEvent::HotkeyConflict {
                                id,
                                display_str,
                                reason,
                            } => {
                                let _ = app_handle_hotkey.emit(
                                    "bbq://hotkey_conflict",
                                    serde_json::json!({
                                        "id": id,
                                        "display_str": display_str,
                                        "reason": reason
                                    }),
                                );
                            }
                            _ => {}
                        }
                    }))
                    .await;
            });

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
                    let hotkey_svc = state.hotkey_service.clone();
                    let clip_svc = state.clipboard.clone();
                    tauri::async_runtime::block_on(async move {
                        use bbq_services::Service;
                        let _ = hotkey_svc.stop().await;
                        let _ = clip_svc.stop().await;
                    });
                }
            }
        });
}
