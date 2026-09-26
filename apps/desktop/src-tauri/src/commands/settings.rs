use crate::AppState;
use bbq_core::{BbqSettings, IslandMode};
use tauri::{AppHandle, Manager, State};

pub async fn sync_runtime_services_with_settings(
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
    if prev.map(|p| p.clipboard_retention_days) != Some(current.clipboard_retention_days) {
        let _ = state
            .clipboard
            .set_retention_days(current.clipboard_retention_days)
            .await;
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
                        ..Default::default()
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
pub fn get_settings(state: State<'_, AppState>) -> Result<BbqSettings, String> {
    use bbq_services::SettingsServiceTrait;
    state
        .settings_service
        .get_settings()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_setting(
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
pub async fn update_settings(
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
pub async fn reset_settings_to_defaults(
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
