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

pub fn resolve_anchor(settings: &bbq_core::BbqSettings) -> bbq_core::IslandAnchor {
    let v = settings.island_vertical_position.trim().to_lowercase();
    let h = settings.island_horizontal_position.trim().to_lowercase();
    let (mig_v, mig_h) = bbq_core::decompose_island_position(&settings.island_position);
    let vert = if matches!(v.as_str(), "top" | "center" | "bottom") {
        v.as_str()
    } else {
        mig_v
    };
    let horiz = if matches!(h.as_str(), "left" | "center" | "right") {
        h.as_str()
    } else {
        mig_h
    };

    match (vert, horiz) {
        ("top", "left") => bbq_core::IslandAnchor::TopLeft,
        ("top", "right") => bbq_core::IslandAnchor::TopRight,
        ("top", _) => bbq_core::IslandAnchor::TopCenter,
        ("center", "left") => bbq_core::IslandAnchor::CenterLeft,
        ("center", "right") => bbq_core::IslandAnchor::CenterRight,
        ("center", _) => bbq_core::IslandAnchor::Center,
        ("bottom", "left") => bbq_core::IslandAnchor::BottomLeft,
        ("bottom", "right") => bbq_core::IslandAnchor::BottomRight,
        ("bottom", _) => bbq_core::IslandAnchor::BottomCenter,
        _ => bbq_core::IslandAnchor::TopCenter,
    }
}

pub fn apply_notch_edge_alignment(
    geo: &mut bbq_core::IslandGeometry,
    display: &bbq_core::DisplayInfo,
    settings: &bbq_core::BbqSettings,
) {
    if settings.island_mode.trim().eq_ignore_ascii_case("notch") {
        match settings
            .island_vertical_position
            .trim()
            .to_lowercase()
            .as_str()
        {
            "top" => {
                geo.y = display.work_area.y;
            }
            "bottom" => {
                geo.y = (display.work_area.y + display.work_area.height as i32 - geo.height as i32)
                    .max(display.work_area.y);
            }
            _ => {}
        }
    }
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
        // For compact envelope (Idle or Hovering), calculate Hovering geometry
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
            _ => {
                let (w, h) = if settings.island_mode == "dot" {
                    (settings.dot_size, settings.dot_size)
                } else {
                    (settings.island_width, settings.island_height)
                };
                (
                    bbq_core::IslandLayoutState::Hovering,
                    Some(bbq_core::WidgetDimensions {
                        preferred_width: Some(w),
                        preferred_height: Some(h),
                        compact_width: Some(w),
                        compact_height: Some(h),
                        ..Default::default()
                    }),
                )
            }
        };

        let anchor = resolve_anchor(&settings);
        let mut geo = bbq_core::calculate_island_geometry(&target_disp, calc_state, dims, anchor);
        apply_notch_edge_alignment(&mut geo, &target_disp, &settings);

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
                } else {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    let (cur_logical_x, cur_logical_y) = if let Ok(pos) = window.outer_position() {
                        (pos.x as f64 / scale, pos.y as f64 / scale)
                    } else {
                        (geo.x as f64, geo.y as f64)
                    };

                    let cur_w = window
                        .inner_size()
                        .map(|s| s.width as f64 / scale)
                        .unwrap_or(geo.width as f64);

                    let center_x = if let Ok(mut cx) = state.custom_center_x.lock() {
                        if let Some(stored_cx) = *cx {
                            stored_cx
                        } else {
                            let computed = cur_logical_x + (cur_w / 2.0);
                            *cx = Some(computed);
                            computed
                        }
                    } else {
                        cur_logical_x + (cur_w / 2.0)
                    };

                    let new_x = center_x - (geo.width as f64 / 2.0);
                    let max_x = (target_disp.work_area.width - geo.width) as f64;
                    let max_y = (target_disp.work_area.height - geo.height) as f64;
                    let clamped_x = new_x.clamp(
                        target_disp.work_area.x as f64,
                        target_disp.work_area.x as f64 + max_x.max(0.0),
                    );
                    let clamped_y = cur_logical_y.clamp(
                        target_disp.work_area.y as f64,
                        target_disp.work_area.y as f64 + max_y.max(0.0),
                    );

                    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                        x: clamped_x,
                        y: clamped_y,
                    }));
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
    app: AppHandle,
    state: State<'_, AppState>,
    is_custom: bool,
) -> Result<(), String> {
    if let Ok(mut c) = state.is_custom_positioned.lock() {
        *c = is_custom;
    }
    if is_custom {
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(pos) = window.outer_position() {
                let scale = window.scale_factor().unwrap_or(1.0);
                let cur_x = pos.x as f64 / scale;
                let cur_w = window
                    .inner_size()
                    .map(|s| s.width as f64 / scale)
                    .unwrap_or(240.0);
                let center_x = cur_x + (cur_w / 2.0);
                if let Ok(mut cx) = state.custom_center_x.lock() {
                    *cx = Some(center_x);
                }
            }
        }
    } else if let Ok(mut cx) = state.custom_center_x.lock() {
        *cx = None;
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
    if let Ok(mut cx) = state.custom_center_x.lock() {
        *cx = None;
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
        _ => {
            let (w, h) = if settings.island_mode == "dot" {
                (settings.dot_size, settings.dot_size)
            } else {
                (settings.island_width, settings.island_height)
            };
            (
                bbq_core::IslandLayoutState::Hovering,
                Some(bbq_core::WidgetDimensions {
                    preferred_width: Some(w),
                    preferred_height: Some(h),
                    compact_width: Some(w),
                    compact_height: Some(h),
                    ..Default::default()
                }),
            )
        }
    };

    let anchor = resolve_anchor(&settings);
    let mut geo = bbq_core::calculate_island_geometry(&display, calc_state, dims, anchor);
    apply_notch_edge_alignment(&mut geo, &display, &settings);

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
    use bbq_services::SettingsServiceTrait;
    let settings = state.settings_service.get_settings().unwrap_or_default();
    let anchor = anchor.unwrap_or_else(|| resolve_anchor(&settings));
    let mut geo = bbq_core::calculate_island_geometry(&display, layout_state, widget_dims, anchor);
    apply_notch_edge_alignment(&mut geo, &display, &settings);
    Ok(geo)
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
        let is_custom = state
            .is_custom_positioned
            .lock()
            .map(|c| *c)
            .unwrap_or(false);

        if !is_custom {
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: clamped.width as f64,
                height: clamped.height as f64,
            }));
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: clamped.x as f64,
                y: clamped.y as f64,
            }));
        } else {
            let scale = window.scale_factor().unwrap_or(1.0);
            let (cur_logical_x, cur_logical_y) = if let Ok(pos) = window.outer_position() {
                (pos.x as f64 / scale, pos.y as f64 / scale)
            } else {
                (clamped.x as f64, clamped.y as f64)
            };

            let cur_w = window
                .inner_size()
                .map(|s| s.width as f64 / scale)
                .unwrap_or(clamped.width as f64);

            let center_x = if let Ok(mut cx) = state.custom_center_x.lock() {
                if let Some(stored_cx) = *cx {
                    stored_cx
                } else {
                    let computed = cur_logical_x + (cur_w / 2.0);
                    *cx = Some(computed);
                    computed
                }
            } else {
                cur_logical_x + (cur_w / 2.0)
            };

            let new_x = center_x - (clamped.width as f64 / 2.0);
            let max_x = (display.work_area.width - clamped.width) as f64;
            let max_y = (display.work_area.height - clamped.height) as f64;
            let clamped_x = new_x.clamp(
                display.work_area.x as f64,
                display.work_area.x as f64 + max_x.max(0.0),
            );
            let clamped_y = cur_logical_y.clamp(
                display.work_area.y as f64,
                display.work_area.y as f64 + max_y.max(0.0),
            );

            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: clamped.width as f64,
                height: clamped.height as f64,
            }));
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

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_core::{BbqSettings, DisplayInfo, DisplayRect, IslandAnchor, IslandGeometry};

    #[test]
    fn test_resolve_anchor_all_nine_combinations() {
        let cases = [
            ("top", "left", IslandAnchor::TopLeft),
            ("top", "center", IslandAnchor::TopCenter),
            ("top", "right", IslandAnchor::TopRight),
            ("center", "left", IslandAnchor::CenterLeft),
            ("center", "center", IslandAnchor::Center),
            ("center", "right", IslandAnchor::CenterRight),
            ("bottom", "left", IslandAnchor::BottomLeft),
            ("bottom", "center", IslandAnchor::BottomCenter),
            ("bottom", "right", IslandAnchor::BottomRight),
        ];

        for (v, h, expected) in cases {
            let settings = BbqSettings {
                island_vertical_position: v.to_string(),
                island_horizontal_position: h.to_string(),
                island_position: bbq_core::compose_island_position(v, h),
                ..Default::default()
            };
            assert_eq!(resolve_anchor(&settings), expected, "Failed for ({v}, {h})");
        }
    }

    #[test]
    fn test_notch_edge_alignment_top_bottom_center() {
        let display = DisplayInfo {
            id: "disp-1".to_string(),
            name: "Primary".to_string(),
            is_primary: true,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 0,
                y: 24,
                width: 1920,
                height: 1016,
            },
        };

        let mut geo_top = IslandGeometry {
            x: 820,
            y: 36,
            width: 280,
            height: 44,
            display_id: "disp-1".to_string(),
            anchor: IslandAnchor::TopCenter,
            scale_factor: 1.0,
        };
        let settings_top = BbqSettings {
            island_mode: "notch".to_string(),
            island_vertical_position: "top".to_string(),
            ..Default::default()
        };
        apply_notch_edge_alignment(&mut geo_top, &display, &settings_top);
        assert_eq!(geo_top.y, 24);

        let mut geo_bottom = IslandGeometry {
            x: 820,
            y: 984,
            width: 280,
            height: 44,
            display_id: "disp-1".to_string(),
            anchor: IslandAnchor::BottomCenter,
            scale_factor: 1.0,
        };
        let settings_bottom = BbqSettings {
            island_mode: "notch".to_string(),
            island_vertical_position: "bottom".to_string(),
            ..Default::default()
        };
        apply_notch_edge_alignment(&mut geo_bottom, &display, &settings_bottom);
        assert_eq!(geo_bottom.y, 24 + 1016 - 44);
    }
}
