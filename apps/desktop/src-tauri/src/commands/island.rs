use crate::AppState;
use bbq_core::IslandMode;
use bbq_services::{DisplayServiceTrait, WindowServiceTrait};
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
        // For Expanded, calculate 560x420 expanded geometry to envelope all widgets without bottom clipping.
        let (calc_state, dims) = match layout_state {
            bbq_core::IslandLayoutState::Expanded => (
                bbq_core::IslandLayoutState::Expanded,
                Some(bbq_core::WidgetDimensions {
                    preferred_width: Some(560),
                    preferred_height: Some(420),
                    expanded_width: Some(560),
                    expanded_height: Some(420),
                    ..Default::default()
                }),
            ),
            _ => (
                bbq_core::IslandLayoutState::Hovering,
                Some(bbq_core::WidgetDimensions {
                    preferred_width: Some(settings.island_width),
                    preferred_height: Some(settings.island_height),
                    compact_width: Some(settings.island_width),
                    compact_height: Some(settings.island_height),
                    ..Default::default()
                }),
            ),
        };

        let anchor = bbq_core::IslandAnchor::from_str_name(&settings.island_position);
        let geo = bbq_core::calculate_island_geometry(&target_disp, calc_state, dims, anchor);

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

                let is_custom = state
                    .is_custom_positioned
                    .lock()
                    .map(|c| *c)
                    .unwrap_or(false);

                if !is_custom {
                    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                        x: geo.x as f64,
                        y: geo.y as f64,
                    }));
                } else if layout_state == bbq_core::IslandLayoutState::Expanded {
                    if let Ok(pos) = window.outer_position() {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        let cur_logical_x = pos.x as f64 / scale;
                        let cur_logical_y = pos.y as f64 / scale;
                        let max_x = (target_disp.work_area.width - geo.width) as f64;
                        let max_y = (target_disp.work_area.height - geo.height) as f64;
                        let clamped_x = cur_logical_x.clamp(
                            target_disp.work_area.x as f64,
                            target_disp.work_area.x as f64 + max_x.max(0.0),
                        );
                        let clamped_y = cur_logical_y.clamp(
                            target_disp.work_area.y as f64,
                            target_disp.work_area.y as f64 + max_y.max(0.0),
                        );
                        let _ =
                            window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                                x: clamped_x,
                                y: clamped_y,
                            }));
                    }
                }
            }
            let _ = state.window_service.apply_geometry(&geo).await;
        }
    }

    use tauri::Emitter;
    let _ = app.emit("bbq://island_mode_changed", mode);
    Ok(())
}

#[tauri::command]
pub async fn set_custom_drag_position(
    state: State<'_, AppState>,
    is_custom: bool,
) -> Result<(), String> {
    if let Ok(mut c) = state.is_custom_positioned.lock() {
        *c = is_custom;
    }
    Ok(())
}

#[tauri::command]
pub async fn reset_island_position(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Ok(mut c) = state.is_custom_positioned.lock() {
        *c = false;
    }

    use bbq_services::SettingsServiceTrait;
    let settings = state.settings_service.get_settings().unwrap_or_default();
    let display = state
        .display_service
        .get_target_display(settings.target_display_id.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    let mode = state
        .current_mode
        .lock()
        .map(|m| *m)
        .unwrap_or(IslandMode::Idle);
    let (calc_state, dims) = match mode {
        IslandMode::Expanding | IslandMode::Expanded | IslandMode::Interacting => (
            bbq_core::IslandLayoutState::Expanded,
            Some(bbq_core::WidgetDimensions {
                preferred_width: Some(560),
                preferred_height: Some(420),
                expanded_width: Some(560),
                expanded_height: Some(420),
                ..Default::default()
            }),
        ),
        _ => (
            bbq_core::IslandLayoutState::Hovering,
            Some(bbq_core::WidgetDimensions {
                preferred_width: Some(settings.island_width),
                preferred_height: Some(settings.island_height),
                compact_width: Some(settings.island_width),
                compact_height: Some(settings.island_height),
                ..Default::default()
            }),
        ),
    };

    let anchor = bbq_core::IslandAnchor::from_str_name(&settings.island_position);
    let geo = bbq_core::calculate_island_geometry(&display, calc_state, dims, anchor);

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
    let display = state
        .display_service
        .get_target_display(Some(&geometry.display_id))
        .await
        .map_err(|e| e.to_string())?;

    // Native clamping invariant: frontend dimensions can never bypass native work_area bounds
    let clamped = bbq_core::clamp_geometry_to_display(&geometry, &display);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: clamped.width as f64,
            height: clamped.height as f64,
        }));

        let is_custom = state
            .is_custom_positioned
            .lock()
            .map(|c| *c)
            .unwrap_or(false);

        if !is_custom {
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: clamped.x as f64,
                y: clamped.y as f64,
            }));
        } else if let Ok(pos) = window.outer_position() {
            let scale = window.scale_factor().unwrap_or(1.0);
            let cur_logical_x = pos.x as f64 / scale;
            let cur_logical_y = pos.y as f64 / scale;
            let max_x = (display.work_area.width - clamped.width) as f64;
            let max_y = (display.work_area.height - clamped.height) as f64;
            let clamped_x = cur_logical_x.clamp(
                display.work_area.x as f64,
                display.work_area.x as f64 + max_x.max(0.0),
            );
            let clamped_y = cur_logical_y.clamp(
                display.work_area.y as f64,
                display.work_area.y as f64 + max_y.max(0.0),
            );
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: clamped_x,
                y: clamped_y,
            }));
        }
    }
    state
        .window_service
        .apply_geometry(&clamped)
        .await
        .map_err(|e| e.to_string())
}
