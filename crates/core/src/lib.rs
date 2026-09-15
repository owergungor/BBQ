#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

pub mod clipboard;
pub mod config;
pub mod drop;
pub mod error;
pub mod events;
pub mod file;
pub mod geometry;
pub mod launcher;
pub mod logging;
pub mod media;
pub mod notification;
pub mod reminder;
pub mod search;
pub mod settings;
pub mod system;
pub mod timer;

pub use settings::{
    is_valid_hex_color, validate_setting_entry, BbqSettings, ThemePreference,
    MAX_CLIPBOARD_MAX_ENTRIES, MAX_CLIPBOARD_RETENTION_DAYS, MAX_DISABLED_WIDGETS, MAX_HOTKEY_LEN,
    MIN_CLIPBOARD_MAX_ENTRIES, MIN_CLIPBOARD_RETENTION_DAYS,
};

pub use geometry::{
    calculate_island_geometry, DisplayCapabilities, DisplayGeometrySupport, DisplayInfo,
    DisplayRect, IslandAnchor, IslandGeometry, IslandLayoutState, WidgetDimensions,
    DEFAULT_DROP_HEIGHT, DEFAULT_DROP_WIDTH, DEFAULT_HOVER_HEIGHT, DEFAULT_HOVER_WIDTH,
    DEFAULT_IDLE_HEIGHT, DEFAULT_IDLE_WIDTH, DEFAULT_TOP_MARGIN, MAX_ISLAND_HEIGHT,
    MAX_ISLAND_WIDTH, MIN_ISLAND_HEIGHT, MIN_ISLAND_WIDTH,
};

pub use clipboard::{
    detect_possible_sensitive, generate_preview, ClipboardContentType, ClipboardEntry,
    ClipboardStatus, MAX_CLIPBOARD_TEXT_SIZE, MAX_PREVIEW_LENGTH,
};
pub use config::AppDirectories;
pub use drop::{
    classify_extension, format_drop_size, DropAction, DropActionResult, DropBatch, DropTarget,
    DropTargetKind, FileClassification, MAX_DROP_ITEMS,
};
pub use error::{BbqError, BbqResult};
pub use events::{BbqEvent, IslandMode};
pub use file::{format_size_bytes, guess_mime_type, FileEntry};
pub use launcher::{
    validate_launcher_url, BbqActionType, LauncherAction, LauncherCapabilities, LauncherItem,
    LauncherItemSource, SystemActionType, MAX_APP_ID_LEN, MAX_DISCOVERED_APPS, MAX_FAVORITE_ITEMS,
    MAX_PATH_LEN, MAX_RECENT_ITEMS, MAX_SUBTITLE_LEN, MAX_TITLE_LEN, MAX_URL_LEN,
};
pub use logging::{init_logging, redact_sensitive_string};
pub use media::{MediaCapabilities, MediaEvent, MediaSession, PlaybackState};
pub use notification::{
    NotificationCapabilities, NotificationCategory, NotificationRequest,
    MAX_NOTIFICATION_BODY_LENGTH, MAX_NOTIFICATION_TITLE_LENGTH,
};
pub use reminder::{Reminder, ReminderState, MAX_REMINDER_BODY_LENGTH, MAX_REMINDER_TITLE_LENGTH};
pub use search::{
    calculate_recency_bonus, calculate_usage_bonus, is_fuzzy_subsequence, rank_launcher_items,
    score_launcher_item, SearchContext, SearchMatchType, SearchMatchedField, SearchQuery,
    SearchResult, MAX_KEYWORDS, MAX_KEYWORD_LEN, MAX_QUERY_LEN, MAX_QUERY_TOKENS,
    MAX_SEARCH_RESULTS,
};
pub use system::{BatteryState, NetworkState, SystemCapabilities, SystemEvent, SystemState};
pub use timer::{
    PomodoroPhase, TimerMode, TimerSession, TimerState, POMODORO_LONG_BREAK_MS,
    POMODORO_SHORT_BREAK_MS, POMODORO_WORK_MS,
};
