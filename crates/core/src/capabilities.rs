use serde::{Deserialize, Serialize};

/// Truthful status of an operating system or platform capability
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CapabilityStatus {
    /// Fully supported and integrated with active native OS event loops
    Supported,
    /// Supported for on-demand queries/actions, but lacks native OS background push events
    Passive,
    /// Explicitly unsupported or blocked by platform/OS design or security constraints
    Unavailable,
    /// Subject to compositor policy; cannot be guaranteed by standard client APIs
    CompositorDependent,
    /// Requires user-granted OS entitlements or permissions (e.g. macOS Automation)
    PermissionRequired,
}

/// Comprehensive, truthful platform capability matrix exposed to frontend
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub platform: String,
    pub global_hotkey: CapabilityStatus,
    pub clipboard_live_events: CapabilityStatus,
    pub clipboard_history: CapabilityStatus,
    pub media_control: CapabilityStatus,
    pub media_events: CapabilityStatus,
    pub notifications: CapabilityStatus,
    pub display_change_events: CapabilityStatus,
    pub window_absolute_positioning: CapabilityStatus,
}

impl PlatformCapabilities {
    /// Detects truthful platform capabilities according to the target operating system
    pub fn detect() -> Self {
        #[cfg(windows)]
        {
            Self::windows()
        }

        #[cfg(target_os = "macos")]
        {
            Self::macos()
        }

        #[cfg(target_os = "linux")]
        {
            Self::linux()
        }

        #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
        {
            Self::mock()
        }
    }

    /// Windows capability profile: full event-driven desktop integration
    pub fn windows() -> Self {
        Self {
            platform: "windows".to_string(),
            global_hotkey: CapabilityStatus::Supported,
            clipboard_live_events: CapabilityStatus::Supported,
            clipboard_history: CapabilityStatus::Supported,
            media_control: CapabilityStatus::Supported,
            media_events: CapabilityStatus::Supported,
            notifications: CapabilityStatus::Supported,
            display_change_events: CapabilityStatus::Supported,
            window_absolute_positioning: CapabilityStatus::Supported,
        }
    }

    /// macOS capability profile: CLI wrappers, passive clipboard, AppleScript automation
    pub fn macos() -> Self {
        Self {
            platform: "macos".to_string(),
            global_hotkey: CapabilityStatus::Unavailable,
            clipboard_live_events: CapabilityStatus::Passive,
            clipboard_history: CapabilityStatus::Supported,
            media_control: CapabilityStatus::PermissionRequired,
            media_events: CapabilityStatus::Unavailable,
            notifications: CapabilityStatus::Supported,
            display_change_events: CapabilityStatus::Unavailable,
            window_absolute_positioning: CapabilityStatus::Supported,
        }
    }

    /// Linux capability profile: differentiates X11 vs Wayland
    pub fn linux() -> Self {
        let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok()
            || std::env::var("XDG_SESSION_TYPE")
                .map(|s| s.eq_ignore_ascii_case("wayland"))
                .unwrap_or(false);

        if is_wayland {
            Self {
                platform: "linux_wayland".to_string(),
                global_hotkey: CapabilityStatus::Unavailable,
                clipboard_live_events: CapabilityStatus::Passive,
                clipboard_history: CapabilityStatus::Supported,
                media_control: CapabilityStatus::Supported,
                media_events: CapabilityStatus::Passive,
                notifications: CapabilityStatus::Supported,
                display_change_events: CapabilityStatus::Unavailable,
                window_absolute_positioning: CapabilityStatus::CompositorDependent,
            }
        } else {
            Self {
                platform: "linux_x11".to_string(),
                global_hotkey: CapabilityStatus::Unavailable,
                clipboard_live_events: CapabilityStatus::Passive,
                clipboard_history: CapabilityStatus::Supported,
                media_control: CapabilityStatus::Supported,
                media_events: CapabilityStatus::Passive,
                notifications: CapabilityStatus::Supported,
                display_change_events: CapabilityStatus::Unavailable,
                window_absolute_positioning: CapabilityStatus::Supported,
            }
        }
    }

    /// Mock / test capability profile
    pub fn mock() -> Self {
        Self {
            platform: "mock".to_string(),
            global_hotkey: CapabilityStatus::Supported,
            clipboard_live_events: CapabilityStatus::Supported,
            clipboard_history: CapabilityStatus::Supported,
            media_control: CapabilityStatus::Supported,
            media_events: CapabilityStatus::Supported,
            notifications: CapabilityStatus::Supported,
            display_change_events: CapabilityStatus::Supported,
            window_absolute_positioning: CapabilityStatus::Supported,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_windows_capabilities_are_supported() {
        let caps = PlatformCapabilities::windows();
        assert_eq!(caps.platform, "windows");
        assert_eq!(caps.global_hotkey, CapabilityStatus::Supported);
        assert_eq!(caps.clipboard_live_events, CapabilityStatus::Supported);
        assert_eq!(
            caps.window_absolute_positioning,
            CapabilityStatus::Supported
        );
    }

    #[test]
    fn test_macos_capabilities_truthful_states() {
        let caps = PlatformCapabilities::macos();
        assert_eq!(caps.platform, "macos");
        assert_eq!(caps.global_hotkey, CapabilityStatus::Unavailable);
        assert_eq!(caps.clipboard_live_events, CapabilityStatus::Passive);
        assert_eq!(caps.media_control, CapabilityStatus::PermissionRequired);
    }

    #[test]
    fn test_linux_wayland_positioning_is_compositor_dependent() {
        // Force wayland env
        std::env::set_var("WAYLAND_DISPLAY", "wayland-0");
        let caps = PlatformCapabilities::linux();
        assert_eq!(caps.platform, "linux_wayland");
        assert_eq!(
            caps.window_absolute_positioning,
            CapabilityStatus::CompositorDependent
        );
        assert_eq!(caps.global_hotkey, CapabilityStatus::Unavailable);
        std::env::remove_var("WAYLAND_DISPLAY");
    }

    #[test]
    fn test_serde_roundtrip_capabilities() {
        let caps = PlatformCapabilities::windows();
        let json = serde_json::to_string(&caps).expect("Failed to serialize");
        let deserialized: PlatformCapabilities =
            serde_json::from_str(&json).expect("Failed to deserialize");
        assert_eq!(caps, deserialized);
    }
}
