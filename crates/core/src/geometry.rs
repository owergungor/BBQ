use serde::{Deserialize, Serialize};

/// Rectangle representation for display bounds and work areas.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DisplayRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Information about a connected display monitor.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    pub id: String,
    pub name: String,
    pub is_primary: bool,
    pub scale_factor: f64,
    pub bounds: DisplayRect,
    pub work_area: DisplayRect,
}

/// Capability level for display geometry and monitor enumeration on host platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DisplayGeometrySupport {
    /// Fully verified native multi-monitor display enumeration & coordinate system.
    Supported,
    /// Partial support: display info is queried, but compositor or OS dictates window coordinates.
    Partial,
    /// Compositor-dependent: Wayland restricts absolute window placement; requires layer-shell protocol.
    CompositorDependent,
    /// Native implementation present but runtime unverified on physical hardware.
    Unverified,
}

/// Host platform display subsystem capabilities and limitations.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayCapabilities {
    /// Whether host platform supports enumerating multiple displays.
    pub multi_monitor: bool,
    /// Whether display scale factor / DPI is dynamically queried.
    pub dpi_scaling: bool,
    /// Whether absolute window positioning (set_position) is supported by the window server.
    pub absolute_positioning: bool,
    /// Level of geometry support.
    pub geometry_support: DisplayGeometrySupport,
    /// Underlying backend identifier (e.g. "Win32 GDI", "CoreGraphics", "X11 XRandR", "Wayland Compositor").
    pub backend_name: String,
    /// Optional explanatory notes on compositor limitations or security boundaries.
    pub notes: Option<String>,
}

impl Default for DisplayCapabilities {
    fn default() -> Self {
        Self {
            multi_monitor: true,
            dpi_scaling: true,
            absolute_positioning: true,
            geometry_support: DisplayGeometrySupport::Supported,
            backend_name: "Generic".to_string(),
            notes: None,
        }
    }
}

/// Minimum allowed Island width in logical pixels.
pub const MIN_ISLAND_WIDTH: u32 = 180;
/// Maximum allowed Island width in logical pixels.
pub const MAX_ISLAND_WIDTH: u32 = 640;
/// Minimum allowed Island height in logical pixels.
pub const MIN_ISLAND_HEIGHT: u32 = 36;
/// Maximum allowed Island height in logical pixels.
pub const MAX_ISLAND_HEIGHT: u32 = 520;

/// Default idle compact width.
pub const DEFAULT_IDLE_WIDTH: u32 = 240;
/// Default idle compact height.
pub const DEFAULT_IDLE_HEIGHT: u32 = 40;

/// Default hover width.
pub const DEFAULT_HOVER_WIDTH: u32 = 260;
/// Default hover height.
pub const DEFAULT_HOVER_HEIGHT: u32 = 44;

/// Default drop overlay width.
pub const DEFAULT_DROP_WIDTH: u32 = 380;
/// Default drop overlay height.
pub const DEFAULT_DROP_HEIGHT: u32 = 200;

/// Default top margin from the top edge of work area in logical pixels.
pub const DEFAULT_TOP_MARGIN: i32 = 6;

/// Layout state corresponding to Island interaction modes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IslandLayoutState {
    Idle,
    Hovering,
    Expanded,
    DraggingOver,
    Transitioning,
}

/// Preferred dimensions suggested by a widget (optional).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WidgetDimensions {
    pub preferred_width: Option<u32>,
    pub preferred_height: Option<u32>,
}

/// Anchor positioning rule for the Island.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum IslandAnchor {
    #[default]
    TopCenter,
    TopLeft,
    TopRight,
    Custom {
        offset_x: i32,
        offset_y: i32,
    },
}

/// Calculated Island geometry for window positioning and frontend rendering.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandGeometry {
    /// Logical X coordinate (supports negative multi-monitor spaces).
    pub x: i32,
    /// Logical Y coordinate (supports negative multi-monitor spaces).
    pub y: i32,
    /// Bounded logical width.
    pub width: u32,
    /// Bounded logical height.
    pub height: u32,
    /// Anchor rule used.
    pub anchor: IslandAnchor,
    /// Target display identifier.
    pub display_id: String,
    /// Display scale factor / DPI.
    pub scale_factor: f64,
}

/// Calculates bounded Island geometry for a given display, layout state, and widget preferences.
///
/// Ensures the Island:
/// 1. Clamps dimensions within universal [MIN, MAX] bounds.
/// 2. Never exceeds the display's `work_area` (taskbar/dock safe area).
/// 3. Centers horizontally correctly in both positive and negative coordinate spaces.
/// 4. Leaves safe top margin under menu bars / screen edges.
pub fn calculate_island_geometry(
    display: &DisplayInfo,
    layout_state: IslandLayoutState,
    widget_dims: Option<WidgetDimensions>,
    anchor: IslandAnchor,
) -> IslandGeometry {
    let (target_w, target_h) = match layout_state {
        IslandLayoutState::Idle => {
            let pref = widget_dims.unwrap_or_default();
            let w = pref.preferred_width.unwrap_or(DEFAULT_IDLE_WIDTH);
            let h = pref.preferred_height.unwrap_or(DEFAULT_IDLE_HEIGHT);
            (w, h)
        }
        IslandLayoutState::Hovering => (DEFAULT_HOVER_WIDTH, DEFAULT_HOVER_HEIGHT),
        IslandLayoutState::DraggingOver => (DEFAULT_DROP_WIDTH, DEFAULT_DROP_HEIGHT),
        IslandLayoutState::Expanded => {
            let pref = widget_dims.unwrap_or_default();
            let w = pref.preferred_width.unwrap_or(400);
            let h = pref.preferred_height.unwrap_or(280);
            (w, h)
        }
        IslandLayoutState::Transitioning => {
            let pref = widget_dims.unwrap_or_default();
            let w = pref.preferred_width.unwrap_or(320);
            let h = pref.preferred_height.unwrap_or(120);
            (w, h)
        }
    };

    // 1. Clamp to universal min/max
    let mut bounded_w = target_w.clamp(MIN_ISLAND_WIDTH, MAX_ISLAND_WIDTH);
    let mut bounded_h = target_h.clamp(MIN_ISLAND_HEIGHT, MAX_ISLAND_HEIGHT);

    // 2. Clamp to display work area (never exceed monitor work area minus safe margins)
    let max_avail_w = display.work_area.width.saturating_sub(16);
    let max_avail_h = display.work_area.height.saturating_sub(16);
    if max_avail_w > 0 && bounded_w > max_avail_w {
        bounded_w = max_avail_w.clamp(MIN_ISLAND_WIDTH, MAX_ISLAND_WIDTH);
    }
    if max_avail_h > 0 && bounded_h > max_avail_h {
        bounded_h = max_avail_h.clamp(MIN_ISLAND_HEIGHT, MAX_ISLAND_HEIGHT);
    }

    // 3. Compute (x, y) coordinates relative to work_area (supports negative coordinates)
    let (x, y) = match anchor {
        IslandAnchor::TopCenter => {
            let offset_x = (display.work_area.width as i32 - bounded_w as i32) / 2;
            let x = display.work_area.x + offset_x;
            let y = display.work_area.y + DEFAULT_TOP_MARGIN;
            (x, y)
        }
        IslandAnchor::TopLeft => {
            let x = display.work_area.x + 8;
            let y = display.work_area.y + DEFAULT_TOP_MARGIN;
            (x, y)
        }
        IslandAnchor::TopRight => {
            let x = display.work_area.x + (display.work_area.width as i32 - bounded_w as i32) - 8;
            let y = display.work_area.y + DEFAULT_TOP_MARGIN;
            (x, y)
        }
        IslandAnchor::Custom { offset_x, offset_y } => {
            let x = display.work_area.x + offset_x;
            let y = display.work_area.y + offset_y;
            (x, y)
        }
    };

    // Ensure window does not spill out of work area boundary
    let safe_x = x.clamp(
        display.work_area.x,
        (display.work_area.x + display.work_area.width as i32 - bounded_w as i32)
            .max(display.work_area.x),
    );
    let safe_y = y.clamp(
        display.work_area.y,
        (display.work_area.y + display.work_area.height as i32 - bounded_h as i32)
            .max(display.work_area.y),
    );

    IslandGeometry {
        x: safe_x,
        y: safe_y,
        width: bounded_w,
        height: bounded_h,
        anchor,
        display_id: display.id.clone(),
        scale_factor: display.scale_factor,
    }
}

/// Helper to convert IslandGeometry into a DisplayRect
impl From<&IslandGeometry> for DisplayRect {
    fn from(geo: &IslandGeometry) -> Self {
        DisplayRect {
            x: geo.x,
            y: geo.y,
            width: geo.width,
            height: geo.height,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_primary_display() -> DisplayInfo {
        DisplayInfo {
            id: "primary-1".to_string(),
            name: "Main Monitor".to_string(),
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
                y: 0,
                width: 1920,
                height: 1040, // 40px taskbar at bottom
            },
        }
    }

    fn sample_negative_secondary_display() -> DisplayInfo {
        // Monitor positioned to the left: x starts at -1920
        DisplayInfo {
            id: "secondary-left".to_string(),
            name: "Left Monitor".to_string(),
            is_primary: false,
            scale_factor: 1.25,
            bounds: DisplayRect {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
        }
    }

    #[test]
    fn test_calculate_idle_geometry() {
        let display = sample_primary_display();
        let geo = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );

        assert_eq!(geo.width, DEFAULT_IDLE_WIDTH);
        assert_eq!(geo.height, DEFAULT_IDLE_HEIGHT);
        // (1920 - 240) / 2 = 840
        assert_eq!(geo.x, 840);
        assert_eq!(geo.y, DEFAULT_TOP_MARGIN);
        assert_eq!(geo.display_id, "primary-1");
    }

    #[test]
    fn test_calculate_negative_coordinates_secondary() {
        let display = sample_negative_secondary_display();
        let geo = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );

        assert_eq!(geo.width, DEFAULT_IDLE_WIDTH);
        // -1920 + (1920 - 240)/2 = -1920 + 840 = -1080
        assert_eq!(geo.x, -1080);
        assert_eq!(geo.y, DEFAULT_TOP_MARGIN);
        assert_eq!(geo.display_id, "secondary-left");
        assert_eq!(geo.scale_factor, 1.25);
    }

    #[test]
    fn test_clamping_widget_dimensions() {
        let display = sample_primary_display();
        // Request excessive size
        let dims = WidgetDimensions {
            preferred_width: Some(2000),
            preferred_height: Some(1000),
        };
        let geo = calculate_island_geometry(
            &display,
            IslandLayoutState::Expanded,
            Some(dims),
            IslandAnchor::TopCenter,
        );

        assert_eq!(geo.width, MAX_ISLAND_WIDTH);
        assert_eq!(geo.height, MAX_ISLAND_HEIGHT);
    }

    #[test]
    fn test_clamping_tiny_widget_dimensions() {
        let display = sample_primary_display();
        let dims = WidgetDimensions {
            preferred_width: Some(50),
            preferred_height: Some(10),
        };
        let geo = calculate_island_geometry(
            &display,
            IslandLayoutState::Expanded,
            Some(dims),
            IslandAnchor::TopCenter,
        );

        assert_eq!(geo.width, MIN_ISLAND_WIDTH);
        assert_eq!(geo.height, MIN_ISLAND_HEIGHT);
    }

    #[test]
    fn test_portrait_display_clamping() {
        // Vertical monitor: 1080x1920
        let display = DisplayInfo {
            id: "portrait-1".to_string(),
            name: "Vertical Monitor".to_string(),
            is_primary: false,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 1920,
                y: 0,
                width: 1080,
                height: 1920,
            },
            work_area: DisplayRect {
                x: 1920,
                y: 0,
                width: 1080,
                height: 1880,
            },
        };
        let geo = calculate_island_geometry(
            &display,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        assert_eq!(geo.width, 400);
        assert_eq!(geo.height, 280);
        // 1920 + (1080 - 400)/2 = 1920 + 340 = 2260
        assert_eq!(geo.x, 2260);
        assert_eq!(geo.y, DEFAULT_TOP_MARGIN);
    }

    #[test]
    fn test_resolutions_and_scale_factors() {
        let resolutions = [(1366, 768), (1920, 1080), (2560, 1440)];
        let scale_factors = [1.0, 1.25, 1.5, 2.0];

        for (w, h) in resolutions {
            for scale in scale_factors {
                let display = DisplayInfo {
                    id: format!("disp-{}x{}-{}", w, h, scale),
                    name: "Test Display".to_string(),
                    is_primary: true,
                    scale_factor: scale,
                    bounds: DisplayRect {
                        x: 0,
                        y: 0,
                        width: w,
                        height: h,
                    },
                    work_area: DisplayRect {
                        x: 0,
                        y: 0,
                        width: w,
                        height: h.saturating_sub(40),
                    },
                };

                // Test Idle State
                let idle_geo = calculate_island_geometry(
                    &display,
                    IslandLayoutState::Idle,
                    None,
                    IslandAnchor::TopCenter,
                );
                assert_eq!(idle_geo.width, DEFAULT_IDLE_WIDTH);
                assert_eq!(idle_geo.height, DEFAULT_IDLE_HEIGHT);
                assert_eq!(idle_geo.x, (w as i32 - DEFAULT_IDLE_WIDTH as i32) / 2);
                assert_eq!(idle_geo.y, DEFAULT_TOP_MARGIN);
                assert_eq!(idle_geo.scale_factor, scale);

                // Test Expanded State
                let exp_geo = calculate_island_geometry(
                    &display,
                    IslandLayoutState::Expanded,
                    None,
                    IslandAnchor::TopCenter,
                );
                assert_eq!(exp_geo.width, 400);
                assert_eq!(exp_geo.height, 280);
                assert_eq!(exp_geo.x, (w as i32 - 400) / 2);
                assert_eq!(exp_geo.y, DEFAULT_TOP_MARGIN);
                assert_eq!(exp_geo.scale_factor, scale);
            }
        }
    }

    #[test]
    fn test_scenario_1_single_monitor() {
        // Single monitor: origin (0,0), size 1920x1080
        let display = DisplayInfo {
            id: "mon-single".to_string(),
            name: "Primary Single".to_string(),
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
                y: 0,
                width: 1920,
                height: 1040,
            },
        };

        let idle = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        // (1920 - 240) / 2 = 840
        assert_eq!(idle.x, 840);
        assert_eq!(idle.y, DEFAULT_TOP_MARGIN);
        assert_eq!(idle.width, DEFAULT_IDLE_WIDTH);
        assert_eq!(idle.height, DEFAULT_IDLE_HEIGHT);
    }

    #[test]
    fn test_scenario_2_right_secondary_monitor() {
        // Primary at (0,0), Secondary to the right at (1920,0)
        let primary = DisplayInfo {
            id: "mon-prim".to_string(),
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
                y: 0,
                width: 1920,
                height: 1040,
            },
        };

        let secondary = DisplayInfo {
            id: "mon-right".to_string(),
            name: "Secondary Right".to_string(),
            is_primary: false,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
        };

        let prim_geo = calculate_island_geometry(
            &primary,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        assert_eq!(prim_geo.x, 840);

        let sec_geo = calculate_island_geometry(
            &secondary,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        // 1920 + (1920 - 240) / 2 = 1920 + 840 = 2760
        assert_eq!(sec_geo.x, 2760);
        assert_eq!(sec_geo.y, DEFAULT_TOP_MARGIN);
    }

    #[test]
    fn test_scenario_3_left_secondary_monitor_negative_coords() {
        // Secondary to the left at (-1920,0), Primary at (0,0)
        let secondary = DisplayInfo {
            id: "mon-left".to_string(),
            name: "Secondary Left".to_string(),
            is_primary: false,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
        };

        let sec_geo = calculate_island_geometry(
            &secondary,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        // -1920 + (1920 - 240) / 2 = -1920 + 840 = -1080
        assert_eq!(sec_geo.x, -1080);
        assert_eq!(sec_geo.y, DEFAULT_TOP_MARGIN);
        // Ensure window bounds stay completely within left monitor [-1920, 0]
        assert!(sec_geo.x >= -1920);
        assert!(sec_geo.x + sec_geo.width as i32 <= 0);
    }

    #[test]
    fn test_scenario_4_top_secondary_monitor_negative_coords() {
        // Secondary above at (0,-1080)
        let secondary = DisplayInfo {
            id: "mon-top".to_string(),
            name: "Secondary Top".to_string(),
            is_primary: false,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 0,
                y: -1080,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 0,
                y: -1080,
                width: 1920,
                height: 1080,
            },
        };

        let sec_geo = calculate_island_geometry(
            &secondary,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        assert_eq!(sec_geo.x, 840);
        // -1080 + 6 = -1074
        assert_eq!(sec_geo.y, -1080 + DEFAULT_TOP_MARGIN);
        // Ensure window stays within top monitor vertical bounds [-1080, 0]
        assert!(sec_geo.y >= -1080);
        assert!(sec_geo.y + sec_geo.height as i32 <= 0);
    }

    #[test]
    fn test_scenario_5_different_resolutions() {
        // Primary 2560x1440, Secondary 1920x1080
        let primary = DisplayInfo {
            id: "mon-2k".to_string(),
            name: "2K Primary".to_string(),
            is_primary: true,
            scale_factor: 1.25,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 2560,
                height: 1440,
            },
            work_area: DisplayRect {
                x: 0,
                y: 0,
                width: 2560,
                height: 1392,
            },
        };

        let secondary = DisplayInfo {
            id: "mon-1080p".to_string(),
            name: "1080p Secondary".to_string(),
            is_primary: false,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 2560,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 2560,
                y: 0,
                width: 1920,
                height: 1080,
            },
        };

        let prim_geo = calculate_island_geometry(
            &primary,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        // (2560 - 400) / 2 = 1080
        assert_eq!(prim_geo.x, 1080);
        assert_eq!(prim_geo.y, DEFAULT_TOP_MARGIN);

        let sec_geo = calculate_island_geometry(
            &secondary,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        // 2560 + (1920 - 400) / 2 = 2560 + 760 = 3320
        assert_eq!(sec_geo.x, 3320);
        assert_eq!(sec_geo.y, DEFAULT_TOP_MARGIN);
    }

    #[test]
    fn test_scenario_6_retina_logical_vs_physical() {
        // Retina: logical size 1440x900 points, physical pixels 2880x1800, scale 2.0
        let retina = DisplayInfo {
            id: "macos-retina".to_string(),
            name: "Built-in Retina Display".to_string(),
            is_primary: true,
            scale_factor: 2.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1440,
                height: 900,
            },
            work_area: DisplayRect {
                x: 0,
                y: 25,
                width: 1440,
                height: 875,
            },
        };

        let idle_geo = calculate_island_geometry(
            &retina,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        // In logical coordinates: (1440 - 240) / 2 = 600
        assert_eq!(idle_geo.x, 600);
        // In work area with menu bar: 25 + 6 = 31
        assert_eq!(idle_geo.y, 31);
        assert_eq!(idle_geo.scale_factor, 2.0);

        let exp_geo = calculate_island_geometry(
            &retina,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        // (1440 - 400) / 2 = 520
        assert_eq!(exp_geo.x, 520);
        assert_eq!(exp_geo.y, 31);
    }

    #[test]
    fn test_scenario_7_portrait_monitor() {
        // Portrait orientation: 1080x1920
        let portrait = DisplayInfo {
            id: "mon-portrait".to_string(),
            name: "Portrait Secondary".to_string(),
            is_primary: false,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 1920,
                y: 0,
                width: 1080,
                height: 1920,
            },
            work_area: DisplayRect {
                x: 1920,
                y: 0,
                width: 1080,
                height: 1920,
            },
        };

        let idle = calculate_island_geometry(
            &portrait,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        // 1920 + (1080 - 240) / 2 = 1920 + 420 = 2340
        assert_eq!(idle.x, 2340);
        assert_eq!(idle.y, DEFAULT_TOP_MARGIN);

        let exp = calculate_island_geometry(
            &portrait,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        // 1920 + (1080 - 400) / 2 = 1920 + 340 = 2260
        assert_eq!(exp.x, 2260);
        assert_eq!(exp.y, DEFAULT_TOP_MARGIN);
    }
}
