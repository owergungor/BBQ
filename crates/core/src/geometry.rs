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
pub const DEFAULT_IDLE_HEIGHT: u32 = 38;

/// Default hover width.
pub const DEFAULT_HOVER_WIDTH: u32 = 280;
/// Default hover height.
pub const DEFAULT_HOVER_HEIGHT: u32 = 44;

/// Default expanded HUD width.
pub const DEFAULT_EXPANDED_WIDTH: u32 = 520;
/// Default expanded HUD height.
pub const DEFAULT_EXPANDED_HEIGHT: u32 = 360;

/// Default drop overlay width.
pub const DEFAULT_DROP_WIDTH: u32 = 380;
/// Default drop overlay height.
pub const DEFAULT_DROP_HEIGHT: u32 = 200;

/// Default top margin from the top edge of work area in logical pixels.
pub const DEFAULT_TOP_MARGIN: i32 = 8;

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

/// Policy governing dynamic content expansion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ContentPolicy {
    #[default]
    Fixed,
    ContentDriven,
    BoundedExpansion,
}

/// Sizing constraints for a specific widget state.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSizingConstraints {
    pub min_width: u32,
    pub preferred_width: u32,
    pub max_width: u32,
    pub min_height: u32,
    pub preferred_height: u32,
    pub max_height: u32,
    pub aspect_ratio: Option<f32>,
}

/// Per-widget explicit sizing contract.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSizingContract {
    pub compact: WidgetSizingConstraints,
    pub expanded: WidgetSizingConstraints,
    pub content_policy: ContentPolicy,
}

impl WidgetSizingContract {
    pub fn new(
        compact: WidgetSizingConstraints,
        expanded: WidgetSizingConstraints,
        content_policy: ContentPolicy,
    ) -> Self {
        Self {
            compact,
            expanded,
            content_policy,
        }
    }

    pub fn clamp_compact(&self, requested_w: Option<u32>, requested_h: Option<u32>) -> (u32, u32) {
        match self.content_policy {
            ContentPolicy::Fixed => (self.compact.preferred_width, self.compact.preferred_height),
            ContentPolicy::ContentDriven | ContentPolicy::BoundedExpansion => {
                let w = requested_w
                    .unwrap_or(self.compact.preferred_width)
                    .clamp(self.compact.min_width, self.compact.max_width);
                let h = if let Some(ratio) = self.compact.aspect_ratio {
                    if ratio > 0.0 {
                        ((w as f32 / ratio).round() as u32)
                            .clamp(self.compact.min_height, self.compact.max_height)
                    } else {
                        requested_h
                            .unwrap_or(self.compact.preferred_height)
                            .clamp(self.compact.min_height, self.compact.max_height)
                    }
                } else {
                    requested_h
                        .unwrap_or(self.compact.preferred_height)
                        .clamp(self.compact.min_height, self.compact.max_height)
                };
                (w, h)
            }
        }
    }

    pub fn clamp_expanded(&self, requested_w: Option<u32>, requested_h: Option<u32>) -> (u32, u32) {
        match self.content_policy {
            ContentPolicy::Fixed => (
                self.expanded.preferred_width,
                self.expanded.preferred_height,
            ),
            ContentPolicy::ContentDriven | ContentPolicy::BoundedExpansion => {
                let w = requested_w
                    .unwrap_or(self.expanded.preferred_width)
                    .clamp(self.expanded.min_width, self.expanded.max_width);
                let h = if let Some(ratio) = self.expanded.aspect_ratio {
                    if ratio > 0.0 {
                        ((w as f32 / ratio).round() as u32)
                            .clamp(self.expanded.min_height, self.expanded.max_height)
                    } else {
                        requested_h
                            .unwrap_or(self.expanded.preferred_height)
                            .clamp(self.expanded.min_height, self.expanded.max_height)
                    }
                } else {
                    requested_h
                        .unwrap_or(self.expanded.preferred_height)
                        .clamp(self.expanded.min_height, self.expanded.max_height)
                };
                (w, h)
            }
        }
    }
}

/// Preferred dimensions suggested by a widget (optional).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WidgetDimensions {
    pub preferred_width: Option<u32>,
    pub preferred_height: Option<u32>,
    pub compact_width: Option<u32>,
    pub compact_height: Option<u32>,
    pub expanded_width: Option<u32>,
    pub expanded_height: Option<u32>,
    pub aspect_ratio: Option<f32>,
    pub contract: Option<WidgetSizingContract>,
}

impl WidgetDimensions {
    pub fn from_contract(contract: WidgetSizingContract) -> Self {
        Self {
            preferred_width: Some(contract.compact.preferred_width),
            preferred_height: Some(contract.compact.preferred_height),
            compact_width: Some(contract.compact.preferred_width),
            compact_height: Some(contract.compact.preferred_height),
            expanded_width: Some(contract.expanded.preferred_width),
            expanded_height: Some(contract.expanded.preferred_height),
            aspect_ratio: contract.compact.aspect_ratio,
            contract: Some(contract),
        }
    }
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

/// Clamps any IslandGeometry authoritatively against the display work area and universal bounds.
pub fn clamp_geometry_to_display(
    geometry: &IslandGeometry,
    display: &DisplayInfo,
) -> IslandGeometry {
    let mut bounded_w = geometry.width.clamp(MIN_ISLAND_WIDTH, MAX_ISLAND_WIDTH);
    let mut bounded_h = geometry.height.clamp(MIN_ISLAND_HEIGHT, MAX_ISLAND_HEIGHT);

    let max_avail_w = display.work_area.width.saturating_sub(16);
    let max_avail_h = display.work_area.height.saturating_sub(16);
    if max_avail_w > 0 && bounded_w > max_avail_w {
        bounded_w = max_avail_w.clamp(MIN_ISLAND_WIDTH, MAX_ISLAND_WIDTH);
    }
    if max_avail_h > 0 && bounded_h > max_avail_h {
        bounded_h = max_avail_h.clamp(MIN_ISLAND_HEIGHT, MAX_ISLAND_HEIGHT);
    }

    let min_x = display.work_area.x;
    let max_x =
        (display.work_area.x + display.work_area.width as i32 - bounded_w as i32).max(min_x);
    let safe_x = geometry.x.clamp(min_x, max_x);

    let min_y = display.work_area.y;
    let max_y =
        (display.work_area.y + display.work_area.height as i32 - bounded_h as i32).max(min_y);
    let safe_y = geometry.y.clamp(min_y, max_y);

    IslandGeometry {
        x: safe_x,
        y: safe_y,
        width: bounded_w,
        height: bounded_h,
        anchor: geometry.anchor,
        display_id: display.id.clone(),
        scale_factor: display.scale_factor,
    }
}

/// Calculates bounded Island geometry for a given display, layout state, and widget preferences.
///
/// Ensures the Island:
/// 1. Clamps dimensions within universal [MIN, MAX] bounds.
/// 2. Respects per-widget sizing contract constraints and content policies.
/// 3. Never exceeds the display's `work_area` (taskbar/dock safe area).
/// 4. Centers horizontally correctly in both positive and negative coordinate spaces.
/// 5. Leaves safe top margin under menu bars / screen edges.
pub fn calculate_island_geometry(
    display: &DisplayInfo,
    layout_state: IslandLayoutState,
    widget_dims: Option<WidgetDimensions>,
    anchor: IslandAnchor,
) -> IslandGeometry {
    let pref = widget_dims.unwrap_or_default();
    let (target_w, target_h, idle_w, idle_h) = if let Some(ref contract) = pref.contract {
        let (cw, ch) = contract.clamp_compact(
            pref.compact_width.or(pref.preferred_width),
            pref.compact_height.or(pref.preferred_height),
        );
        match layout_state {
            IslandLayoutState::Idle => (cw, ch, cw, ch),
            IslandLayoutState::Hovering => {
                let hover_w = cw + (DEFAULT_HOVER_WIDTH.saturating_sub(DEFAULT_IDLE_WIDTH));
                let hover_h = ch + (DEFAULT_HOVER_HEIGHT.saturating_sub(DEFAULT_IDLE_HEIGHT));
                (hover_w, hover_h, cw, ch)
            }
            IslandLayoutState::DraggingOver => (DEFAULT_DROP_WIDTH, DEFAULT_DROP_HEIGHT, cw, ch),
            IslandLayoutState::Expanded => {
                let (ew, eh) = contract.clamp_expanded(
                    pref.expanded_width.or(pref.preferred_width),
                    pref.expanded_height.or(pref.preferred_height),
                );
                (ew, eh, cw, ch)
            }
            IslandLayoutState::Transitioning => (
                pref.preferred_width.unwrap_or(360),
                pref.preferred_height.unwrap_or(160),
                cw,
                ch,
            ),
        }
    } else {
        match layout_state {
            IslandLayoutState::Idle => {
                let w = pref
                    .compact_width
                    .or(pref.preferred_width)
                    .unwrap_or(DEFAULT_IDLE_WIDTH);
                let h = pref
                    .compact_height
                    .or(pref.preferred_height)
                    .unwrap_or(DEFAULT_IDLE_HEIGHT);
                (w, h, w, h)
            }
            IslandLayoutState::Hovering => {
                let base_w = pref
                    .compact_width
                    .or(pref.preferred_width)
                    .unwrap_or(DEFAULT_IDLE_WIDTH);
                let base_h = pref
                    .compact_height
                    .or(pref.preferred_height)
                    .unwrap_or(DEFAULT_IDLE_HEIGHT);
                let hover_w = if base_w == DEFAULT_IDLE_WIDTH {
                    DEFAULT_HOVER_WIDTH
                } else {
                    base_w + (DEFAULT_HOVER_WIDTH.saturating_sub(DEFAULT_IDLE_WIDTH))
                };
                let hover_h = if base_h == DEFAULT_IDLE_HEIGHT {
                    DEFAULT_HOVER_HEIGHT
                } else {
                    base_h + (DEFAULT_HOVER_HEIGHT.saturating_sub(DEFAULT_IDLE_HEIGHT))
                };
                (hover_w, hover_h, base_w, base_h)
            }
            IslandLayoutState::DraggingOver => (
                DEFAULT_DROP_WIDTH,
                DEFAULT_DROP_HEIGHT,
                DEFAULT_IDLE_WIDTH,
                DEFAULT_IDLE_HEIGHT,
            ),
            IslandLayoutState::Expanded => {
                let w = pref
                    .expanded_width
                    .or(pref.preferred_width)
                    .unwrap_or(DEFAULT_EXPANDED_WIDTH);
                let h = if let Some(ratio) = pref.aspect_ratio {
                    if ratio > 0.0 {
                        (w as f32 / ratio).round() as u32
                    } else {
                        pref.expanded_height
                            .or(pref.preferred_height)
                            .unwrap_or(DEFAULT_EXPANDED_HEIGHT)
                    }
                } else {
                    pref.expanded_height
                        .or(pref.preferred_height)
                        .unwrap_or(DEFAULT_EXPANDED_HEIGHT)
                };
                let idle_w = pref.compact_width.unwrap_or(DEFAULT_IDLE_WIDTH);
                let idle_h = pref.compact_height.unwrap_or(DEFAULT_IDLE_HEIGHT);
                (w, h, idle_w, idle_h)
            }
            IslandLayoutState::Transitioning => {
                let w = pref.preferred_width.unwrap_or(360);
                let h = pref.preferred_height.unwrap_or(160);
                (w, h, DEFAULT_IDLE_WIDTH, DEFAULT_IDLE_HEIGHT)
            }
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
    // When hovering, expand symmetrically in all directions (up, down, left, right)
    // around the idle visual center by offsetting Y upward by half of the height delta.
    let y_hover_offset = if layout_state == IslandLayoutState::Hovering {
        (bounded_h as i32 - idle_h as i32) / 2
    } else {
        0
    };

    let (x, y) = match anchor {
        IslandAnchor::TopCenter => {
            let offset_x = (display.work_area.width as i32 - bounded_w as i32) / 2;
            let x = display.work_area.x + offset_x;
            let y = display.work_area.y + DEFAULT_TOP_MARGIN - y_hover_offset;
            (x, y)
        }
        IslandAnchor::TopLeft => {
            let x_hover_offset = if layout_state == IslandLayoutState::Hovering {
                (bounded_w as i32 - idle_w as i32) / 2
            } else {
                0
            };
            let x = display.work_area.x + 8 - x_hover_offset;
            let y = display.work_area.y + DEFAULT_TOP_MARGIN - y_hover_offset;
            (x, y)
        }
        IslandAnchor::TopRight => {
            let x_hover_offset = if layout_state == IslandLayoutState::Hovering {
                (bounded_w as i32 - idle_w as i32) / 2
            } else {
                0
            };
            let x = display.work_area.x + (display.work_area.width as i32 - bounded_w as i32) - 8
                + x_hover_offset;
            let y = display.work_area.y + DEFAULT_TOP_MARGIN - y_hover_offset;
            (x, y)
        }
        IslandAnchor::Custom { offset_x, offset_y } => {
            let x_hover_offset = if layout_state == IslandLayoutState::Hovering {
                (bounded_w as i32 - idle_w as i32) / 2
            } else {
                0
            };
            let x = display.work_area.x + offset_x - x_hover_offset;
            let y = display.work_area.y + offset_y - y_hover_offset;
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
            ..Default::default()
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
            ..Default::default()
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
        assert_eq!(geo.width, DEFAULT_EXPANDED_WIDTH);
        assert_eq!(geo.height, DEFAULT_EXPANDED_HEIGHT);
        // 1920 + (1080 - 520)/2 = 1920 + 280 = 2200
        assert_eq!(geo.x, 2200);
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
                assert_eq!(exp_geo.width, DEFAULT_EXPANDED_WIDTH);
                assert_eq!(exp_geo.height, DEFAULT_EXPANDED_HEIGHT);
                assert_eq!(exp_geo.x, (w as i32 - DEFAULT_EXPANDED_WIDTH as i32) / 2);
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
        // (2560 - 520) / 2 = 1020
        assert_eq!(prim_geo.x, 1020);
        assert_eq!(prim_geo.y, DEFAULT_TOP_MARGIN);

        let sec_geo = calculate_island_geometry(
            &secondary,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        // 2560 + (1920 - 520) / 2 = 2560 + 700 = 3260
        assert_eq!(sec_geo.x, 3260);
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
        // In work area with menu bar: 25 + DEFAULT_TOP_MARGIN = 25 + 8 = 33
        assert_eq!(idle_geo.y, 25 + DEFAULT_TOP_MARGIN);
        assert_eq!(idle_geo.scale_factor, 2.0);

        let exp_geo = calculate_island_geometry(
            &retina,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        // (1440 - 520) / 2 = 460
        assert_eq!(exp_geo.x, 460);
        assert_eq!(exp_geo.y, 25 + DEFAULT_TOP_MARGIN);
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
        // 1920 + (1080 - 520) / 2 = 1920 + 280 = 2200
        assert_eq!(exp.x, 2200);
        assert_eq!(exp.y, DEFAULT_TOP_MARGIN);
    }

    #[test]
    fn test_hover_symmetrical_expansion_preserves_center() {
        let display = sample_primary_display();
        let idle = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        let hover = calculate_island_geometry(
            &display,
            IslandLayoutState::Hovering,
            None,
            IslandAnchor::TopCenter,
        );

        // Hover container expands symmetrically
        assert_eq!(idle.width, DEFAULT_IDLE_WIDTH); // 240
        assert_eq!(idle.height, DEFAULT_IDLE_HEIGHT); // 38
        assert_eq!(hover.width, DEFAULT_HOVER_WIDTH); // 280 (+40px)
        assert_eq!(hover.height, DEFAULT_HOVER_HEIGHT); // 44 (+6px)

        // Expansion is directional in all 4 axes:
        // Left expands by 20px, right expands by 20px:
        assert_eq!(hover.x, idle.x - 20);
        assert_eq!(
            hover.x + hover.width as i32,
            idle.x + idle.width as i32 + 20
        );

        // Top expands upward by 3px, bottom expands downward by 3px:
        assert_eq!(hover.y, idle.y - 3);
        assert_eq!(
            hover.y + hover.height as i32,
            idle.y + idle.height as i32 + 3
        );

        // Visual Center (X, Y) is mathematically identical:
        let idle_center_x = idle.x + (idle.width as i32) / 2;
        let idle_center_y = idle.y + (idle.height as i32) / 2;
        let hover_center_x = hover.x + (hover.width as i32) / 2;
        let hover_center_y = hover.y + (hover.height as i32) / 2;

        assert_eq!(idle_center_x, hover_center_x);
        assert_eq!(idle_center_y, hover_center_y);
    }

    #[test]
    fn test_single_instance_and_resume_reconciliation_geometry_is_idempotent() {
        let display = DisplayInfo {
            id: "primary".to_string(),
            name: "Primary Monitor".to_string(),
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

        let geo1 = calculate_island_geometry(
            &display,
            IslandLayoutState::Hovering,
            Some(WidgetDimensions {
                preferred_width: Some(280),
                preferred_height: Some(44),
                ..Default::default()
            }),
            IslandAnchor::TopCenter,
        );
        let geo2 = calculate_island_geometry(
            &display,
            IslandLayoutState::Hovering,
            Some(WidgetDimensions {
                preferred_width: Some(280),
                preferred_height: Some(44),
                ..Default::default()
            }),
            IslandAnchor::TopCenter,
        );

        assert_eq!(geo1.x, geo2.x);
        assert_eq!(geo1.y, geo2.y);
        assert_eq!(geo1.width, geo2.width);
        assert_eq!(geo1.height, geo2.height);
        assert_eq!(geo1.scale_factor, geo2.scale_factor);
    }

    #[test]
    fn test_phase1_scale_factors_100_125_150_200() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let display = DisplayInfo {
                id: format!("disp-scale-{}", scale),
                name: "Scaled Display".to_string(),
                is_primary: true,
                scale_factor: scale,
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
            assert_eq!(idle.scale_factor, scale);
            assert_eq!(idle.width, DEFAULT_IDLE_WIDTH);
            assert_eq!(idle.height, DEFAULT_IDLE_HEIGHT);
            assert_eq!(idle.x, (1920 - DEFAULT_IDLE_WIDTH as i32) / 2);
            assert_eq!(idle.y, DEFAULT_TOP_MARGIN);
        }
    }

    #[test]
    fn test_phase1_negative_coordinates_multimonitor() {
        // Left monitor placed at x: -2560..0, y: -1440..0 (negative X and Y)
        let left_top_display = DisplayInfo {
            id: "left-top".to_string(),
            name: "Left Top Monitor".to_string(),
            is_primary: false,
            scale_factor: 1.5,
            bounds: DisplayRect {
                x: -2560,
                y: -1440,
                width: 2560,
                height: 1440,
            },
            work_area: DisplayRect {
                x: -2560,
                y: -1440,
                width: 2560,
                height: 1400,
            },
        };

        let idle = calculate_island_geometry(
            &left_top_display,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        // Work area x is -2560, width is 2560. Centered: -2560 + (2560 - 240)/2 = -2560 + 1160 = -1400
        assert_eq!(idle.x, -1400);
        // Work area y is -1440. Top center with top margin: -1440 + 8 = -1432
        assert_eq!(idle.y, -1440 + DEFAULT_TOP_MARGIN);
        assert_eq!(idle.scale_factor, 1.5);
    }

    #[test]
    fn test_phase1_work_area_boundaries_taskbars() {
        // Test top taskbar (e.g. macOS menu bar or Windows top taskbar)
        let top_taskbar_disp = DisplayInfo {
            id: "top-tb".to_string(),
            name: "Top Taskbar".to_string(),
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
                y: 40, // 40px taskbar at top
                width: 1920,
                height: 1040,
            },
        };
        let geo_top = calculate_island_geometry(
            &top_taskbar_disp,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        assert_eq!(geo_top.y, 40 + DEFAULT_TOP_MARGIN);

        // Test left taskbar
        let left_taskbar_disp = DisplayInfo {
            id: "left-tb".to_string(),
            name: "Left Taskbar".to_string(),
            is_primary: true,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 60, // 60px taskbar at left
                y: 0,
                width: 1860,
                height: 1080,
            },
        };
        let geo_left = calculate_island_geometry(
            &left_taskbar_disp,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        // Centered within work area: 60 + (1860 - 240) / 2 = 60 + 810 = 870
        assert_eq!(geo_left.x, 870);
    }

    #[test]
    fn test_phase1_widget_sizing_contract_fixed() {
        let display = sample_primary_display();
        let contract = WidgetSizingContract::new(
            WidgetSizingConstraints {
                min_width: 200,
                preferred_width: 220,
                max_width: 260,
                min_height: 38,
                preferred_height: 38,
                max_height: 44,
                aspect_ratio: None,
            },
            WidgetSizingConstraints {
                min_width: 480,
                preferred_width: 520,
                max_width: 560,
                min_height: 320,
                preferred_height: 360,
                max_height: 420,
                aspect_ratio: None,
            },
            ContentPolicy::Fixed,
        );

        let dims = WidgetDimensions {
            preferred_width: Some(300), // Requesting 300, but policy is Fixed
            contract: Some(contract),
            ..Default::default()
        };

        let idle = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            Some(dims),
            IslandAnchor::TopCenter,
        );
        assert_eq!(idle.width, 220); // Fixed to preferred_width
        assert_eq!(idle.height, 38);

        let exp = calculate_island_geometry(
            &display,
            IslandLayoutState::Expanded,
            Some(dims),
            IslandAnchor::TopCenter,
        );
        assert_eq!(exp.width, 520); // Fixed to preferred_width
        assert_eq!(exp.height, 360);
    }

    #[test]
    fn test_phase1_widget_sizing_contract_bounded_expansion() {
        let display = sample_primary_display();
        let contract = WidgetSizingContract::new(
            WidgetSizingConstraints {
                min_width: 240,
                preferred_width: 280,
                max_width: 380,
                min_height: 38,
                preferred_height: 38,
                max_height: 44,
                aspect_ratio: None,
            },
            WidgetSizingConstraints {
                min_width: 460,
                preferred_width: 500,
                max_width: 540,
                min_height: 280,
                preferred_height: 340,
                max_height: 400,
                aspect_ratio: None,
            },
            ContentPolicy::BoundedExpansion,
        );

        // Compact content-fit expansion: long media title requires 340px
        let dims_long = WidgetDimensions {
            compact_width: Some(340),
            contract: Some(contract),
            ..Default::default()
        };
        let idle_long = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            Some(dims_long),
            IslandAnchor::TopCenter,
        );
        assert_eq!(idle_long.width, 340); // Expanded within [240, 380] bounds

        // Returning to compact default when content is short
        let dims_short = WidgetDimensions {
            compact_width: Some(250),
            contract: Some(contract),
            ..Default::default()
        };
        let idle_short = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            Some(dims_short),
            IslandAnchor::TopCenter,
        );
        assert_eq!(idle_short.width, 250);

        // Excessive expansion clamped to maxWidth
        let dims_oversize = WidgetDimensions {
            compact_width: Some(999),
            contract: Some(contract),
            ..Default::default()
        };
        let idle_oversize = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            Some(dims_oversize),
            IslandAnchor::TopCenter,
        );
        assert_eq!(idle_oversize.width, 380); // Clamped to maxWidth
    }

    #[test]
    fn test_phase1_native_clamp_geometry_to_display() {
        let display = sample_primary_display();
        let arbitrary_oversize = IslandGeometry {
            x: -500,
            y: -200,
            width: 4000,
            height: 3000,
            anchor: IslandAnchor::TopCenter,
            display_id: display.id.clone(),
            scale_factor: 1.0,
        };

        let clamped = clamp_geometry_to_display(&arbitrary_oversize, &display);
        assert!(clamped.width <= MAX_ISLAND_WIDTH);
        assert!(clamped.height <= MAX_ISLAND_HEIGHT);
        assert!(clamped.x >= display.work_area.x);
        assert!(clamped.y >= display.work_area.y);
        assert!(
            clamped.x + clamped.width as i32
                <= display.work_area.x + display.work_area.width as i32
        );
        assert!(
            clamped.y + clamped.height as i32
                <= display.work_area.y + display.work_area.height as i32
        );
    }
}
