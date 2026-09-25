use crate::AppState;
use bbq_core::IslandMode;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn get_island_state(state: State<'_, AppState>) -> Result<IslandMode, String> {
    state
        .current_mode
        .lock()
        .map(|m| *m)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_island_mode(
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
        // For compact envelope (Idle or Hovering), calculate Hovering geometry (280x44)
        // so the OS window maintains a stable envelope and does not oscillate or re-position during hover.
        // For Expanded, calculate 520x360 expanded geometry with dims = None (not idle settings).
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
pub async fn calculate_island_geometry(
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
pub async fn apply_island_geometry(
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
