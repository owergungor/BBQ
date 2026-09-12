use serde::{Deserialize, Serialize};

/// Island UI display modes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IslandMode {
    #[default]
    Idle,
    Active,
    Expanding,
    Expanded,
    Interacting,
    Collapsing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaTrackInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaPlaybackInfo {
    pub is_playing: bool,
    pub position_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayChangedEvent {
    pub display_count: usize,
    pub primary_display_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerStateEvent {
    pub battery_percent: Option<u8>,
    pub is_charging: bool,
}

/// Strongly typed BBQ application events dispatched across backend and to the UI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum BbqEvent {
    MediaTrackChanged(MediaTrackInfo),
    MediaPlaybackChanged(MediaPlaybackInfo),
    FileDropped {
        paths: Vec<String>,
    },
    FileAdded {
        entry: crate::file::FileEntry,
    },
    FileRemoved {
        id: String,
    },
    FileWorkspaceChanged {
        entries: Vec<crate::file::FileEntry>,
    },
    ClipboardChanged {
        entry: crate::clipboard::ClipboardEntry,
    },
    ClipboardCleared,
    ClipboardUnavailable {
        reason: String,
    },
    TimerFinished {
        timer_id: String,
        label: String,
    },
    TimerStarted(crate::timer::TimerSession),
    TimerPaused(crate::timer::TimerSession),
    TimerResumed(crate::timer::TimerSession),
    TimerCompleted(crate::timer::TimerSession),
    TimerReset(crate::timer::TimerSession),
    TimerPhaseChanged(crate::timer::TimerSession),
    TimerChanged(crate::timer::TimerSession),
    NotificationReceived {
        id: String,
        title: String,
        body: String,
    },
    NotificationRequested(crate::notification::NotificationRequest),
    NotificationDelivered(crate::notification::NotificationRequest),
    NotificationUnavailable(crate::notification::NotificationRequest),
    ReminderCreated(crate::reminder::Reminder),
    ReminderCancelled(crate::reminder::Reminder),
    ReminderFired(crate::reminder::Reminder),
    ReminderChanged(crate::reminder::Reminder),
    LauncherItemsChanged(Vec<crate::launcher::LauncherItem>),
    LauncherRecentChanged(Vec<crate::launcher::LauncherItem>),
    LauncherFavoritesChanged(Vec<crate::launcher::LauncherItem>),
    LauncherActionCompleted {
        item_id: String,
        action: crate::launcher::LauncherAction,
    },
    LauncherActionFailed {
        item_id: String,
        error: String,
    },
    DisplayChanged(DisplayChangedEvent),
    WindowFocusChanged {
        has_focus: bool,
    },
    NetworkChanged {
        is_connected: bool,
    },
    PowerStateChanged(PowerStateEvent),
    SystemStateChanged(crate::system::SystemState),
    BatteryChanged(crate::system::BatteryState),
    SystemNetworkChanged(crate::system::NetworkState),
    SystemVolumeChanged {
        volume: Option<f32>,
        muted: Option<bool>,
    },
    IslandModeChanged {
        mode: IslandMode,
    },
    DropBatchInspected(crate::drop::DropBatch),
    DropActionExecuted(crate::drop::DropActionResult),
    HotkeyTriggered {
        id: String,
        display_str: String,
    },
    HotkeyConflict {
        id: String,
        display_str: String,
        reason: String,
    },
}

impl BbqEvent {
    pub fn event_name(&self) -> &'static str {
        match self {
            BbqEvent::MediaTrackChanged(_) => "bbq://media_track_changed",
            BbqEvent::MediaPlaybackChanged(_) => "bbq://media_playback_changed",
            BbqEvent::FileDropped { .. } => "bbq://file_dropped",
            BbqEvent::FileAdded { .. } => "bbq://file_added",
            BbqEvent::FileRemoved { .. } => "bbq://file_removed",
            BbqEvent::FileWorkspaceChanged { .. } => "bbq://file_workspace_changed",
            BbqEvent::ClipboardChanged { .. } => "bbq://clipboard_changed",
            BbqEvent::ClipboardCleared => "bbq://clipboard_cleared",
            BbqEvent::ClipboardUnavailable { .. } => "bbq://clipboard_unavailable",
            BbqEvent::TimerFinished { .. } => "bbq://timer_finished",
            BbqEvent::TimerStarted(_)
            | BbqEvent::TimerPaused(_)
            | BbqEvent::TimerResumed(_)
            | BbqEvent::TimerCompleted(_)
            | BbqEvent::TimerReset(_)
            | BbqEvent::TimerPhaseChanged(_)
            | BbqEvent::TimerChanged(_) => "bbq://timer_changed",
            BbqEvent::NotificationReceived { .. }
            | BbqEvent::NotificationRequested(_)
            | BbqEvent::NotificationDelivered(_)
            | BbqEvent::NotificationUnavailable(_) => "bbq://notification_changed",
            BbqEvent::ReminderCreated(_)
            | BbqEvent::ReminderCancelled(_)
            | BbqEvent::ReminderFired(_)
            | BbqEvent::ReminderChanged(_) => "bbq://reminder_changed",
            BbqEvent::LauncherItemsChanged(_)
            | BbqEvent::LauncherRecentChanged(_)
            | BbqEvent::LauncherFavoritesChanged(_)
            | BbqEvent::LauncherActionCompleted { .. }
            | BbqEvent::LauncherActionFailed { .. } => "bbq://launcher_changed",
            BbqEvent::DisplayChanged(_) => "bbq://display_changed",
            BbqEvent::WindowFocusChanged { .. } => "bbq://window_focus_changed",
            BbqEvent::NetworkChanged { .. } => "bbq://network_changed",
            BbqEvent::PowerStateChanged(_) => "bbq://power_state_changed",
            BbqEvent::SystemStateChanged(_)
            | BbqEvent::BatteryChanged(_)
            | BbqEvent::SystemNetworkChanged(_)
            | BbqEvent::SystemVolumeChanged { .. } => "bbq://system_changed",
            BbqEvent::IslandModeChanged { .. } => "bbq://island_mode_changed",
            BbqEvent::DropBatchInspected(_) | BbqEvent::DropActionExecuted(_) => {
                "bbq://drop_changed"
            }
            BbqEvent::HotkeyTriggered { .. } => "bbq://hotkey_triggered",
            BbqEvent::HotkeyConflict { .. } => "bbq://hotkey_conflict",
        }
    }
}
