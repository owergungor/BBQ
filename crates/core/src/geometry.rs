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
}
