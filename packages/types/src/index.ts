/**
 * BBQ Core Shared Domain Types
 * Matches the Rust backend models in crates/core
 */

export type IslandMode =
  | 'IDLE'
  | 'ACTIVE'
  | 'EXPANDING'
  | 'EXPANDED'
  | 'INTERACTING'
  | 'COLLAPSING';

export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: string;
  name: string;
  isPrimary: boolean;
  scaleFactor: number;
  bounds: DisplayRect;
  workArea: DisplayRect;
}

export type IslandLayoutState =
  | 'idle'
  | 'hovering'
  | 'expanded'
  | 'draggingOver'
  | 'transitioning';

export type IslandAnchor =
  | 'topCenter'
  | 'topLeft'
  | 'topRight'
  | { custom: { offset_x: number; offset_y: number } };

export interface WidgetDimensions {
  preferredWidth?: number;
  preferredHeight?: number;
}

export interface IslandGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: IslandAnchor;
  displayId: string;
  scaleFactor: number;
}

export interface DisplayChangedEvent {
  display_count: number;
  primary_display_id: string;
}

export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'unknown';

export interface MediaCapabilities {
  canPlay: boolean;
  canPause: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  canSeek: boolean;
  canChangeVolume: boolean;
}

export interface MediaSession {
  id: string;
  state: PlaybackState;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArt: string | null;
  durationMs: number | null;
  positionMs: number | null;
  volume: number | null;
  source: string | null;
  capabilities: MediaCapabilities;
}

export interface MediaState {
  currentSession: MediaSession | null;
}

export type TimerMode = 'Countdown' | 'Stopwatch' | 'Pomodoro';

export type TimerState = 'Idle' | 'Running' | 'Paused' | 'Completed';

export type PomodoroPhase = 'Work' | 'ShortBreak' | 'LongBreak';

export interface TimerSession {
  id: string;
  mode: TimerMode;
  state: TimerState;
  started_at: number | null;
  paused_at: number | null;
  target_at: number | null;
  duration_ms: number | null;
  remaining_ms: number | null;
  pomodoro_phase: PomodoroPhase | null;
  completed_cycles: number;
}

export type ClipboardContentType = 'text' | 'image' | 'file_list' | 'unknown';

export interface ClipboardEntry {
  id: string;
  content_type: ClipboardContentType;
  preview: string;
  content: string | null;
  created_at: number;
  size_bytes: number;
  source: string | null;
  possible_sensitive: boolean;
}

export interface ClipboardStatus {
  enabled: boolean;
  total_entries: number;
  max_entries: number;
}

export interface ClipboardItemPreview {
  id: string;
  preview: string;
  timestamp: number;
  format: 'text' | 'image' | 'file';
}

export interface BatteryState {
  available: boolean;
  percentage: number | null;
  charging: boolean;
  plugged_in: boolean;
  power_source: string | null;
}

export interface NetworkState {
  connected: boolean;
  interface_name: string | null;
  connection_type: string | null;
  signal_strength: number | null;
}

export interface SystemState {
  battery: BatteryState;
  network: NetworkState;
  muted: boolean | null;
  volume: number | null;
  uptime_seconds: number | null;
  hostname: string | null;
  operating_system: string;
  platform: string;
}

export interface SystemCapabilities {
  has_battery: boolean;
  can_read_network: boolean;
  can_control_volume: boolean;
  can_mute: boolean;
}

export interface SystemStatus {
  batteryPercent: number | null;
  isCharging: boolean;
  isOnline: boolean;
  idleSeconds: number;
}

export type ThemePreference = 'system' | 'dark' | 'light';
export type AccentPreset =
  | 'blue'
  | 'red'
  | 'green'
  | 'orange'
  | 'yellow'
  | 'pink'
  | 'purple'
  | 'indigo'
  | 'teal'
  | 'mint'
  | 'cyan';

export type AccentColor =
  | AccentPreset
  | 'custom'
  | (string & {});

export interface BbqSettings {
  theme: ThemePreference;
  accent_color?: AccentColor;
  custom_accent_color?: string | null;
  reduced_motion: boolean;
  island_width: number;
  island_height: number;
  target_display_id: string | null;
  auto_expand_on_event: boolean;
  start_at_login: boolean;
  global_hotkey: string;
  hotkey_enabled: boolean;
  clipboard_history_enabled: boolean;
  clipboard_retention_days: number;
  clipboard_max_entries: number;
  notifications_enabled: boolean;
  timer_sound_enabled: boolean;
  reminder_sound_enabled: boolean;
  disabled_widgets: string[];
  compact_indicator_order: string[];
  first_run_completed: boolean;
  onboarding_completed: boolean;
}

export interface FileEntry {
  id: string;
  name: string;
  path: string;
  extension: string | null;
  mime_type: string | null;
  size_bytes: number;
  modified_at: number | null;
  created_at: number;
  source: string | null;
  missing: boolean;
}

export type NotificationCategory =
  | 'Timer'
  | 'Pomodoro'
  | 'Reminder'
  | 'System'
  | 'General';

export interface NotificationRequest {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
}

export interface NotificationCapabilities {
  available: boolean;
}

export type ReminderState =
  | 'Scheduled'
  | 'Fired'
  | 'Cancelled';

export interface Reminder {
  id: string;
  title: string;
  body: string | null;
  due_at: number;
  state: ReminderState;
  created_at: number;
}

export type BbqEventName =
  | 'bbq://media_changed'
  | 'bbq://clipboard_changed'
  | 'bbq://file_added'
  | 'bbq://file_removed'
  | 'bbq://file_workspace_changed'
  | 'bbq://display_changed'
  | 'bbq://window_focus_changed'
  | 'bbq://system_changed'
  | 'bbq://timer_changed'
  | 'bbq://notification_changed'
  | 'bbq://reminder_changed'
  | 'bbq://island_mode_changed'
  | 'bbq://launcher_changed'
  | 'bbq://drop_changed';

export type SystemActionType =
  | 'open_settings'
  | 'toggle_mute'
  | 'open_downloads'
  | 'open_home'
  | 'show_desktop'
  | 'lock_screen';

export type BbqActionType =
  | 'open_settings'
  | 'open_clipboard'
  | 'open_reminders'
  | 'open_timer'
  | 'open_system'
  | 'open_media'
  | 'open_files';

export type LauncherAction =
  | { type: 'open_application'; payload: { id: string } }
  | { type: 'open_file'; payload: { path: string } }
  | { type: 'open_folder'; payload: { path: string } }
  | { type: 'open_url'; payload: { url: string } }
  | { type: 'system_action'; payload: { action: SystemActionType } }
  | { type: 'bbq_action'; payload: { action: BbqActionType } };

export type LauncherItemSource =
  | 'built_in'
  | 'recent'
  | 'favorite'
  | 'user_configured';

export interface LauncherItem {
  id: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  action: LauncherAction;
  source: LauncherItemSource;
  favorite: boolean;
  last_used_at: number | null;
  usage_count: number;
  keywords?: string[];
}

export interface LauncherCapabilities {
  open_application: boolean;
  open_file: boolean;
  open_folder: boolean;
  open_url: boolean;
  system_actions: boolean;
}

export type DropTargetKind = 'file' | 'directory' | 'unknown';

export type FileClassification =
  | 'image'
  | 'document'
  | 'archive'
  | 'code'
  | 'audio'
  | 'video'
  | 'unknown';

export interface DropTarget {
  id: string;
  path: string;
  kind: DropTargetKind;
  name: string;
  size: number;
  modified_at: number | null;
  extension: string | null;
  classification: FileClassification;
}

export interface DropBatch {
  id: string;
  items: DropTarget[];
  count: number;
  created_at: number;
}

export type DropAction = 'open' | 'reveal' | 'copy_path' | 'add_to_workspace';

export interface DropActionResult {
  success_count: number;
  failure_count: number;
  message: string;
}

export const MAX_DROP_ITEMS = 50;

export interface HotkeyDefinition {
  id: string;
  key: string;
  modifiers: string[];
  display_str: string;
}

export interface HotkeyCapabilities {
  can_register: boolean;
  can_unregister: boolean;
  can_detect_conflicts: boolean;
}

export interface HotkeyTriggeredPayload {
  id: string;
  display_str: string;
}

export interface HotkeyConflictPayload {
  id: string;
  display_str: string;
  reason: string;
}
