use serde::{Deserialize, Serialize};

/// Strongly typed playback state of a media session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackState {
    Playing,
    Paused,
    Stopped,
    #[default]
    Unknown,
}

/// Supported playback and control capabilities reported by the media player
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct MediaCapabilities {
    pub can_play: bool,
    pub can_pause: bool,
    pub can_go_next: bool,
    pub can_go_previous: bool,
    pub can_seek: bool,
    pub can_change_volume: bool,
}

/// Normalized, platform-agnostic representation of an active media session
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct MediaSession {
    pub id: String,
    pub state: PlaybackState,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_art: Option<String>,
    pub duration_ms: Option<u64>,
    pub position_ms: Option<u64>,
    pub last_updated_time: Option<u64>,
    pub volume: Option<f32>,
    pub source: Option<String>,
    pub capabilities: MediaCapabilities,
}

/// Discrete events emitted when meaningful media state changes occur
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum MediaEvent {
    SessionChanged(Option<MediaSession>),
    PlaybackChanged {
        session_id: String,
        state: PlaybackState,
    },
    MetadataChanged {
        session_id: String,
        title: Option<String>,
        artist: Option<String>,
        album: Option<String>,
        album_art: Option<String>,
        duration_ms: Option<u64>,
    },
    PositionChanged {
        session_id: String,
        position_ms: u64,
    },
    CapabilitiesChanged {
        session_id: String,
        capabilities: MediaCapabilities,
    },
    SessionClosed {
        session_id: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_playback_state_serde() {
        let json = serde_json::to_string(&PlaybackState::Playing).unwrap();
        assert_eq!(json, "\"playing\"");
        let parsed: PlaybackState = serde_json::from_str("\"paused\"").unwrap();
        assert_eq!(parsed, PlaybackState::Paused);
        let unknown: PlaybackState = serde_json::from_str("\"unknown\"").unwrap();
        assert_eq!(unknown, PlaybackState::Unknown);
    }

    #[test]
    fn test_media_capabilities_default() {
        let caps = MediaCapabilities::default();
        assert!(!caps.can_play);
        assert!(!caps.can_pause);
        assert!(!caps.can_go_next);
        assert!(!caps.can_go_previous);
        assert!(!caps.can_seek);
        assert!(!caps.can_change_volume);
    }

    #[test]
    fn test_media_session_normalization() {
        let session = MediaSession {
            id: "spotify-session-1".to_string(),
            state: PlaybackState::Playing,
            title: Some("Test Song".to_string()),
            artist: Some("Test Artist".to_string()),
            album: None,
            album_art: None,
            duration_ms: Some(180_000),
            position_ms: Some(30_000),
            last_updated_time: Some(1700000000),
            volume: Some(0.8),
            source: Some("Spotify".to_string()),
            capabilities: MediaCapabilities {
                can_play: true,
                can_pause: true,
                can_go_next: true,
                can_go_previous: false,
                can_seek: true,
                can_change_volume: false,
            },
        };

        let json = serde_json::to_string(&session).unwrap();
        let deserialized: MediaSession = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, session);
    }

    #[test]
    fn test_media_event_serde_roundtrip() {
        let event = MediaEvent::PlaybackChanged {
            session_id: "test".to_string(),
            state: PlaybackState::Paused,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"PlaybackChanged\""));
        let deserialized: MediaEvent = serde_json::from_str(&json).unwrap();
        match deserialized {
            MediaEvent::PlaybackChanged { session_id, state } => {
                assert_eq!(session_id, "test");
                assert_eq!(state, PlaybackState::Paused);
            }
            _ => panic!("Deserialized wrong event variant"),
        }
    }

    #[test]
    fn test_malformed_or_partial_session() {
        // Minimal JSON with only ID and state should deserialize cleanly with defaults
        let minimal_json = r#"{"id": "min_player", "state": "playing", "capabilities": {}}"#;
        let session: MediaSession = serde_json::from_str(minimal_json).unwrap();
        assert_eq!(session.id, "min_player");
        assert_eq!(session.state, PlaybackState::Playing);
        assert_eq!(session.title, None);
        assert_eq!(session.artist, None);
        assert_eq!(session.album, None);
        assert!(!session.capabilities.can_play);
    }
}
