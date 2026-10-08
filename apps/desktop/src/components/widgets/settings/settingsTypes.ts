import type { ThemePreference, AccentColor, PlatformCapabilities } from "@bbq/types";
import type { WidgetDefinition } from "../../../island/widgetRegistry.ts";

export type SettingsTab =
  | "appearance"
  | "island"
  | "hotkey"
  | "privacy"
  | "notifications"
  | "widgets"
  | "about";

export const POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: "top-center", label: "Top Center" },
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-center", label: "Bottom Center" },
  { value: "bottom-right", label: "Bottom Right" },
];

export interface AppearanceSettingsTabProps {
  theme: ThemePreference;
  accentColor: string;
  customAccentColor: string | null;
  reducedMotion: boolean;
  startAtLogin: boolean;
  onThemeChange: (theme: ThemePreference) => Promise<void>;
  onAccentColorChange: (accentColor: AccentColor) => Promise<void>;
  onCustomAccentChange: (hex: string) => Promise<void>;
  onToggle: (key: string, value: any) => Promise<void>;
}

export interface IslandSettingsTabProps {
  draftWidth: number;
  draftHeight: number;
  draftTransparency: number;
  islandPosition: string;
  alwaysOnTop: boolean;
  autoExpandOnEvent: boolean;
  onDraftWidthChange: (val: number) => void;
  onDraftHeightChange: (val: number) => void;
  onDraftTransparencyChange: (val: number) => void;
  onCommitWidth: () => Promise<void>;
  onCommitHeight: () => Promise<void>;
  onCommitTransparency: (val: number) => Promise<void>;
  onToggle: (key: string, value: any) => Promise<void>;
}

export interface HotkeySettingsTabProps {
  globalHotkey: string;
  hotkeyEnabled: boolean;
  draftHotkey: string;
  isRecordingHotkey: boolean;
  hotkeyError: string | null;
  conflictError: string | null;
  hotkeySupported: boolean;
  capabilities: PlatformCapabilities | null;
  hotkeyInputRef: React.RefObject<HTMLInputElement | null>;
  onDraftHotkeyChange: (val: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSaveHotkey: () => Promise<void>;
  onCancelHotkey: () => void;
  onHotkeyKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onToggle: (key: string, value: any) => Promise<void>;
}

export interface PrivacySettingsTabProps {
  clipboardHistoryEnabled: boolean;
  draftClipboardMax: number;
  draftRetention: number;
  clipboardLiveSupported: boolean;
  capabilities: PlatformCapabilities | null;
  onDraftClipboardMaxChange: (val: number) => void;
  onDraftRetentionChange: (val: number) => void;
  onCommitClipboardMax: () => Promise<void>;
  onCommitRetention: () => Promise<void>;
  onToggle: (key: string, value: any) => Promise<void>;
}

export interface NotificationsSettingsTabProps {
  notificationsEnabled: boolean;
  timerSoundEnabled: boolean;
  reminderSoundEnabled: boolean;
  onToggle: (key: string, value: any) => Promise<void>;
}

export interface WidgetsSettingsTabProps {
  allRegisteredWidgets: WidgetDefinition[];
  currentIndicatorOrder: string[];
  disabledWidgets: string[];
  onToggleWidget: (widgetId: string) => Promise<void>;
  onMoveIndicator: (index: number, direction: "up" | "down") => Promise<void>;
  onResetIndicatorOrder: () => Promise<void>;
}

export interface AboutSettingsTabProps {
  capabilities: PlatformCapabilities | null;
  onCopyDiagnostics: () => Promise<void>;
  onReplayTour: () => Promise<void>;
}
