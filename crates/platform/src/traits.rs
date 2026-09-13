use async_trait::async_trait;
use bbq_core::BbqResult;
use serde::{Deserialize, Serialize};

pub use bbq_core::{
    DisplayCapabilities, DisplayGeometrySupport, DisplayInfo, DisplayRect, IslandGeometry,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlatformDisplayEvent {
    DisplaysChanged(Vec<DisplayInfo>),
    ActiveDisplayChanged(DisplayInfo),
}

pub type DisplayEventSink = std::sync::Arc<dyn Fn(PlatformDisplayEvent) + Send + Sync>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardPreview {
    pub id: String,
    pub text_preview: Option<String>,
    pub format: String,
    pub timestamp: u64,
}

pub use bbq_core::{ClipboardContentType, ClipboardEntry, ClipboardStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlatformClipboardEvent {
    Changed(ClipboardEntry),
    Cleared,
    Unavailable(String),
}

pub type ClipboardEventSink = std::sync::Arc<dyn Fn(PlatformClipboardEvent) + Send + Sync>;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MediaSessionInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPowerInfo {
    pub battery_percent: Option<u8>,
    pub is_charging: bool,
    pub is_on_battery: bool,
}

#[async_trait]
pub trait PlatformWindow: Send + Sync {
    async fn set_position(&self, x: i32, y: i32) -> BbqResult<()>;
    async fn set_size(&self, width: u32, height: u32) -> BbqResult<()>;
    async fn set_always_on_top(&self, enabled: bool) -> BbqResult<()>;
    async fn set_visible(&self, visible: bool) -> BbqResult<()>;
    async fn set_interactive(&self, interactive: bool) -> BbqResult<()>;
}

#[async_trait]
pub trait PlatformDisplay: Send + Sync {
    async fn get_displays(&self) -> BbqResult<Vec<DisplayInfo>>;
    async fn get_primary_display(&self) -> BbqResult<DisplayInfo>;
    async fn get_active_display(&self) -> BbqResult<DisplayInfo>;
    fn capabilities(&self) -> DisplayCapabilities {
        DisplayCapabilities::default()
    }
    fn subscribe(&self, _sink: DisplayEventSink) -> BbqResult<()> {
        Ok(())
    }
}

#[async_trait]
pub trait PlatformClipboard: Send + Sync {
    async fn initialize(&self) -> BbqResult<()>;
    async fn current(&self) -> BbqResult<Option<ClipboardEntry>>;
    async fn subscribe(&self, sink: ClipboardEventSink) -> BbqResult<()>;
    async fn set_text(&self, text: &str) -> BbqResult<()>;
    async fn clear(&self) -> BbqResult<()>;

    async fn get_latest_item(&self) -> BbqResult<Option<ClipboardPreview>> {
        let entry = self.current().await?;
        Ok(entry.map(|e| ClipboardPreview {
            id: e.id,
            text_preview: Some(e.preview),
            format: e.content_type.to_string(),
            timestamp: e.created_at as u64,
        }))
    }

    async fn write_text(&self, text: &str) -> BbqResult<()> {
        self.set_text(text).await
    }
}

pub use bbq_core::{MediaCapabilities, MediaEvent, MediaSession, PlaybackState};
use std::sync::Arc;

pub type MediaEventSink = Arc<dyn Fn(MediaEvent) + Send + Sync>;

#[async_trait]
pub trait PlatformMedia: Send + Sync {
    async fn initialize(&self) -> BbqResult<()>;
    async fn current_session(&self) -> BbqResult<Option<MediaSession>>;
    async fn subscribe(&self, sink: MediaEventSink) -> BbqResult<()>;

    async fn play(&self) -> BbqResult<()>;
    async fn pause(&self) -> BbqResult<()>;
    async fn toggle_play_pause(&self) -> BbqResult<()>;
    async fn next(&self) -> BbqResult<()>;
    async fn previous(&self) -> BbqResult<()>;
    async fn seek(&self, position_ms: u64) -> BbqResult<()>;
}

pub use crate::launcher::PlatformLauncher;
pub use crate::notification::PlatformNotification;

pub use bbq_core::{BatteryState, NetworkState, SystemCapabilities, SystemEvent, SystemState};

pub type SystemEventSink = std::sync::Arc<dyn Fn(SystemEvent) + Send + Sync>;

#[async_trait]
pub trait PlatformSystem: Send + Sync {
    async fn initialize(&self) -> BbqResult<()>;
    async fn current_state(&self) -> BbqResult<SystemState>;
    async fn capabilities(&self) -> BbqResult<SystemCapabilities>;
    async fn subscribe(&self, sink: SystemEventSink) -> BbqResult<()>;
    async fn set_volume(&self, volume: f32) -> BbqResult<()>;
    async fn set_muted(&self, muted: bool) -> BbqResult<()>;
    async fn toggle_muted(&self) -> BbqResult<()>;

    async fn get_idle_seconds(&self) -> BbqResult<u64> {
        Ok(0)
    }

    async fn get_power_info(&self) -> BbqResult<SystemPowerInfo> {
        let state = self.current_state().await?;
        Ok(SystemPowerInfo {
            battery_percent: state.battery.percentage,
            is_charging: state.battery.charging,
            is_on_battery: !state.battery.plugged_in,
        })
    }
}

#[async_trait]
pub trait PlatformNetwork: Send + Sync {
    async fn is_connected(&self) -> BbqResult<bool>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadataInfo {
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub size_bytes: u64,
    pub modified_at: Option<i64>,
    pub is_directory: bool,
}

#[async_trait]
pub trait PlatformFile: Send + Sync {
    async fn validate_path(&self, path: &str) -> BbqResult<FileMetadataInfo>;
    async fn open(&self, path: &str) -> BbqResult<()>;
    async fn reveal(&self, path: &str) -> BbqResult<()>;
}

pub use crate::hotkey::{HotkeyCapabilities, HotkeyDefinition, HotkeyEventSink, PlatformHotkey};

#[async_trait]
pub trait PlatformAutostart: Send + Sync {
    async fn is_supported(&self) -> bool;
    async fn is_enabled(&self) -> BbqResult<bool>;
    async fn set_enabled(&self, enabled: bool) -> BbqResult<()>;
}

/// Unified platform provider bundle
pub trait PlatformProvider: Send + Sync {
    fn window(&self) -> std::sync::Arc<dyn PlatformWindow>;
    fn display(&self) -> std::sync::Arc<dyn PlatformDisplay>;
    fn clipboard(&self) -> std::sync::Arc<dyn PlatformClipboard>;
    fn file(&self) -> std::sync::Arc<dyn PlatformFile>;
    fn media(&self) -> std::sync::Arc<dyn PlatformMedia>;
    fn notification(&self) -> std::sync::Arc<dyn PlatformNotification>;
    fn launcher(&self) -> std::sync::Arc<dyn PlatformLauncher>;
    fn system(&self) -> std::sync::Arc<dyn PlatformSystem>;
    fn network(&self) -> std::sync::Arc<dyn PlatformNetwork>;
    fn hotkey(&self) -> std::sync::Arc<dyn PlatformHotkey>;
    fn autostart(&self) -> std::sync::Arc<dyn PlatformAutostart>;
}
