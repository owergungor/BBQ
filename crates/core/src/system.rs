use serde::{Deserialize, Serialize};

/// Normalized battery state
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct BatteryState {
    pub available: bool,
    pub percentage: Option<u8>,
    pub charging: bool,
    pub plugged_in: bool,
    pub power_source: Option<String>,
}

/// Normalized network state
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct NetworkState {
    pub connected: bool,
    pub interface_name: Option<String>,
    pub connection_type: Option<String>,
    pub signal_strength: Option<u8>,
}

/// Normalized system state
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SystemState {
    pub battery: BatteryState,
    pub network: NetworkState,
    pub muted: Option<bool>,
    pub volume: Option<f32>,
    pub uptime_seconds: Option<u64>,
    pub hostname: Option<String>,
    pub operating_system: String,
    pub platform: String,
}

impl Default for SystemState {
    fn default() -> Self {
        Self {
            battery: BatteryState::default(),
            network: NetworkState::default(),
            muted: None,
            volume: None,
            uptime_seconds: None,
            hostname: None,
            operating_system: std::env::consts::OS.to_string(),
            platform: std::env::consts::FAMILY.to_string(),
        }
    }
}

/// System capabilities supported by the current platform
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SystemCapabilities {
    pub has_battery: bool,
    pub can_read_network: bool,
    pub can_control_volume: bool,
    pub can_mute: bool,
}

impl Default for SystemCapabilities {
    fn default() -> Self {
        Self {
            has_battery: false,
            can_read_network: true,
            can_control_volume: false,
            can_mute: false,
        }
    }
}

/// Normalized system events emitted across platform and services
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum SystemEvent {
    StateChanged(SystemState),
    BatteryChanged(BatteryState),
    NetworkChanged(NetworkState),
    VolumeChanged {
        volume: Option<f32>,
        muted: Option<bool>,
    },
    Unavailable {
        reason: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_state_serialization() {
        let state = SystemState {
            battery: BatteryState {
                available: true,
                percentage: Some(85),
                charging: true,
                plugged_in: true,
                power_source: Some("AC".to_string()),
            },
            network: NetworkState {
                connected: true,
                interface_name: Some("Wi-Fi".to_string()),
                connection_type: Some("WiFi".to_string()),
                signal_strength: Some(4),
            },
            muted: Some(false),
            volume: Some(0.75),
            uptime_seconds: Some(3600),
            hostname: Some("bbq-box".to_string()),
            operating_system: "windows".to_string(),
            platform: "windows".to_string(),
        };

        let json = serde_json::to_string(&state).expect("Serialization must succeed");
        let deserialized: SystemState =
            serde_json::from_str(&json).expect("Deserialization must succeed");
        assert_eq!(state, deserialized);
    }

    #[test]
    fn test_unavailable_system_state_defaults() {
        let default_state = SystemState::default();
        assert!(!default_state.battery.available);
        assert_eq!(default_state.battery.percentage, None);
        assert!(!default_state.network.connected);
        assert_eq!(default_state.muted, None);
        assert_eq!(default_state.volume, None);
    }

    #[test]
    fn test_system_event_serde() {
        let event = SystemEvent::VolumeChanged {
            volume: Some(0.5),
            muted: Some(false),
        };
        let json = serde_json::to_string(&event).expect("Serialize event");
        let deserialized: SystemEvent = serde_json::from_str(&json).expect("Deserialize event");
        assert_eq!(event, deserialized);
    }
}
