import { invoke } from "@tauri-apps/api/core";
import type {
  IslandMode,
  DisplayInfo,
  IslandLayoutState,
  IslandAnchor,
  WidgetDimensions,
  IslandGeometry,
  BbqSettings,
  MediaSession,
  ClipboardEntry,
  ClipboardStatus,
  FileEntry,
  SystemState,
  SystemCapabilities,
  TimerSession,
  TimerMode,
  NotificationCapabilities,
  Reminder,
  LauncherCapabilities,
  LauncherItem,
  DropAction,
  DropActionResult,
  DropBatch,
  HotkeyDefinition,
  HotkeyCapabilities,
  PlatformCapabilities,
} from "@bbq/types";

export interface ServiceStatus {
  name: string;
  state: "inactive" | "sleeping" | "active" | "failed";
  message: string | null;
}

export const bbqCommands = {
  getIslandState: async (): Promise<IslandMode> => {
    try {
      return await invoke<IslandMode>("get_island_state");
    } catch {
      return "IDLE";
    }
  },

  setIslandMode: async (mode: IslandMode): Promise<void> => {
    try {
      await invoke("set_island_mode", { mode });
    } catch (err) {
      console.error("Failed to set island mode:", err);
    }
  },

  getDisplays: async (): Promise<DisplayInfo[]> => {
    try {
      return await invoke<DisplayInfo[]>("get_displays");
    } catch (err) {
      console.warn("bbqCommands.getDisplays failed, falling back to empty list:", err);
      return [];
    }
  },

  getPrimaryDisplay: async (): Promise<DisplayInfo | null> => {
    try {
      return await invoke<DisplayInfo>("get_primary_display");
    } catch (err) {
      console.error("Failed to get primary display:", err);
      return null;
    }
  },

  getActiveDisplay: async (): Promise<DisplayInfo | null> => {
    try {
      return await invoke<DisplayInfo>("get_active_display");
    } catch (err) {
      console.error("Failed to get active display:", err);
      return null;
    }
  },

  calculateIslandGeometry: async (
    layoutState: IslandLayoutState,
    widgetDims?: WidgetDimensions,
    anchor?: IslandAnchor,
    displayId?: string
  ): Promise<IslandGeometry | null> => {
    try {
      return await invoke<IslandGeometry>("calculate_island_geometry", {
        layoutState,
        widgetDims: widgetDims ?? null,
        anchor: anchor ?? null,
        displayId: displayId ?? null,
      });
    } catch (err) {
      console.error("Failed to calculate island geometry:", err);
      return null;
    }
  },

  applyIslandGeometry: async (geometry: IslandGeometry): Promise<void> => {
    try {
      await invoke("apply_island_geometry", { geometry });
    } catch (err) {
      console.error("Failed to apply island geometry:", err);
    }
  },

  getSettings: async (): Promise<BbqSettings | null> => {
    try {
      return await invoke<BbqSettings>("get_settings");
    } catch {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = localStorage.getItem("bbq_settings");
        if (saved) {
          try {
            return JSON.parse(saved);
          } catch {}
        }
      }
      return null;
    }
  },

  updateSetting: async (key: string, value: string): Promise<boolean> => {
    try {
      await invoke("update_setting", { key, value });
      return true;
    } catch (err) {
      console.warn(`Failed to update setting '${key}':`, err);
      return false;
    }
  },

  updateSettings: async (settings: BbqSettings): Promise<boolean> => {
    try {
      await invoke("update_settings", { settings });
      return true;
    } catch (err) {
      console.warn("Failed to update settings batch:", err);
      return false;
    }
  },

  resetSettingsToDefaults: async (): Promise<BbqSettings | null> => {
    try {
      return await invoke<BbqSettings>("reset_settings_to_defaults");
    } catch (err) {
      console.error("Failed to reset settings to defaults:", err);
      return null;
    }
  },

  getServiceStatuses: async (): Promise<ServiceStatus[]> => {
    try {
      return await invoke<ServiceStatus[]>("get_service_statuses");
    } catch (err) {
      console.warn("bbqCommands.getServiceStatuses failed, falling back to empty list:", err);
      return [];
    }
  },

  mediaGetCurrentSession: async (): Promise<MediaSession | null> => {
    try {
      return await invoke<MediaSession | null>("media_get_current_session");
    } catch {
      return null;
    }
  },

  mediaPlay: async (): Promise<boolean> => {
    try {
      await invoke("media_play");
      return true;
    } catch (err) {
      console.error("Failed to play media:", err);
      return false;
    }
  },

  mediaPause: async (): Promise<boolean> => {
    try {
      await invoke("media_pause");
      return true;
    } catch (err) {
      console.error("Failed to pause media:", err);
      return false;
    }
  },

  mediaTogglePlayPause: async (): Promise<boolean> => {
    try {
      await invoke("media_toggle_play_pause");
      return true;
    } catch (err) {
      console.error("Failed to toggle play/pause:", err);
      return false;
    }
  },

  mediaNext: async (): Promise<boolean> => {
    try {
      await invoke("media_next");
      return true;
    } catch (err) {
      console.error("Failed to next media:", err);
      return false;
    }
  },

  mediaPrevious: async (): Promise<boolean> => {
    try {
      await invoke("media_previous");
      return true;
    } catch (err) {
      console.error("Failed to previous media:", err);
      return false;
    }
  },

  mediaSeek: async (positionMs: number): Promise<boolean> => {
    try {
      await invoke("media_seek", { positionMs: Math.max(0, Math.floor(positionMs)) });
      return true;
    } catch (err) {
      console.error("Failed to seek media:", err);
      return false;
    }
  },

  clipboardGetHistory: async (): Promise<ClipboardEntry[]> => {
    try {
      return await invoke<ClipboardEntry[]>("clipboard_get_history");
    } catch (err) {
      console.warn("bbqCommands.clipboardGetHistory failed, falling back to empty history:", err);
      return [];
    }
  },

  clipboardClearHistory: async (): Promise<void> => {
    try {
      await invoke("clipboard_clear_history");
    } catch (err) {
      console.error("Failed to clear clipboard history:", err);
    }
  },

  clipboardDeleteEntry: async (id: string): Promise<void> => {
    try {
      await invoke("clipboard_delete_entry", { id });
    } catch (err) {
      console.error("Failed to delete clipboard entry:", err);
    }
  },

  clipboardSetHistoryEnabled: async (enabled: boolean): Promise<void> => {
    try {
      await invoke("clipboard_set_history_enabled", { enabled });
    } catch (err) {
      console.error("Failed to set clipboard history enabled:", err);
    }
  },

  clipboardGetStatus: async (): Promise<ClipboardStatus | null> => {
    try {
      return await invoke<ClipboardStatus>("clipboard_get_status");
    } catch (err) {
      console.warn("bbqCommands.clipboardGetStatus failed, falling back to null:", err);
      return null;
    }
  },

  clipboardWriteText: async (text: string): Promise<boolean> => {
    try {
      await invoke("clipboard_write_text", { text });
      return true;
    } catch (err) {
      console.warn("Failed to write to clipboard via native IPC:", err);
      return false;
    }
  },

  fileGetWorkspace: async (): Promise<FileEntry[]> => {
    try {
      return await invoke<FileEntry[]>("file_get_workspace");
    } catch (err) {
      console.error("Failed to get file workspace:", err);
      return [];
    }
  },

  fileAdd: async (path: string, source?: string): Promise<FileEntry | null> => {
    try {
      return await invoke<FileEntry>("file_add", { path, source });
    } catch (err) {
      console.error("Failed to add file:", err);
      return null;
    }
  },

  fileOpen: async (id: string): Promise<boolean> => {
    try {
      await invoke("file_open", { id });
      return true;
    } catch (err) {
      console.error("Failed to open file:", err);
      return false;
    }
  },

  fileReveal: async (id: string): Promise<boolean> => {
    try {
      await invoke("file_reveal", { id });
      return true;
    } catch (err) {
      console.error("Failed to reveal file:", err);
      return false;
    }
  },

  fileRemove: async (id: string): Promise<boolean> => {
    try {
      await invoke("file_remove", { id });
      return true;
    } catch (err) {
      console.error("Failed to remove file:", err);
      return false;
    }
  },

  fileClearWorkspace: async (): Promise<boolean> => {
    try {
      await invoke("file_clear_workspace");
      return true;
    } catch (err) {
      console.error("Failed to clear file workspace:", err);
      return false;
    }
  },

  systemGetState: async (): Promise<SystemState | null> => {
    try {
      return await invoke<SystemState>("system_get_state");
    } catch (err) {
      console.error("Failed to get system state:", err);
      return null;
    }
  },

  systemGetCapabilities: async (): Promise<SystemCapabilities | null> => {
    try {
      return await invoke<SystemCapabilities>("system_get_capabilities");
    } catch (err) {
      console.error("Failed to get system capabilities:", err);
      return null;
    }
  },

  systemSetVolume: async (volume: number): Promise<void> => {
    try {
      await invoke("system_set_volume", { volume });
    } catch (err) {
      console.error("Failed to set system volume:", err);
    }
  },

  systemSetMuted: async (muted: boolean): Promise<void> => {
    try {
      await invoke("system_set_muted", { muted });
    } catch (err) {
      console.error("Failed to set system mute state:", err);
    }
  },

  systemToggleMuted: async (): Promise<void> => {
    try {
      await invoke("system_toggle_muted");
    } catch (err) {
      console.error("Failed to toggle system mute state:", err);
    }
  },

  timerGetState: async (): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_get_state");
    } catch (err) {
      console.error("Failed to get timer state:", err);
      return null;
    }
  },

  timerStartCountdown: async (durationMs: number): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_start_countdown", { durationMs });
    } catch (err) {
      console.error("Failed to start countdown timer:", err);
      return null;
    }
  },

  timerStartStopwatch: async (): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_start_stopwatch");
    } catch (err) {
      console.error("Failed to start stopwatch:", err);
      return null;
    }
  },

  timerStartPomodoro: async (): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_start_pomodoro");
    } catch (err) {
      console.error("Failed to start pomodoro:", err);
      return null;
    }
  },

  timerPause: async (): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_pause");
    } catch (err) {
      console.error("Failed to pause timer:", err);
      return null;
    }
  },

  timerResume: async (): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_resume");
    } catch (err) {
      console.error("Failed to resume timer:", err);
      return null;
    }
  },

  timerReset: async (): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_reset");
    } catch (err) {
      console.error("Failed to reset timer:", err);
      return null;
    }
  },

  timerCancel: async (): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_cancel");
    } catch (err) {
      console.error("Failed to cancel timer:", err);
      return null;
    }
  },

  timerSetMode: async (
    mode: TimerMode,
    durationMs?: number
  ): Promise<TimerSession | null> => {
    try {
      return await invoke<TimerSession>("timer_set_mode", {
        mode,
        durationMs: durationMs ?? null,
      });
    } catch (err) {
      console.error("Failed to set timer mode:", err);
      return null;
    }
  },

  notificationGetCapabilities: async (): Promise<NotificationCapabilities | null> => {
    try {
      return await invoke<NotificationCapabilities>("notification_get_capabilities");
    } catch (err) {
      console.error("Failed to get notification capabilities:", err);
      return null;
    }
  },

  reminderList: async (): Promise<Reminder[]> => {
    try {
      return await invoke<Reminder[]>("reminder_list");
    } catch (err) {
      console.error("Failed to list reminders:", err);
      return [];
    }
  },

  reminderCreate: async (
    title: string,
    body?: string | null,
    dueAt?: number
  ): Promise<Reminder | null> => {
    try {
      return await invoke<Reminder>("reminder_create", {
        title,
        body: body ?? null,
        dueAt: dueAt ?? Date.now() + 600000,
      });
    } catch (err) {
      console.error("Failed to create reminder:", err);
      return null;
    }
  },

  reminderCancel: async (id: string): Promise<Reminder | null> => {
    try {
      return await invoke<Reminder>("reminder_cancel", { id });
    } catch (err) {
      console.error("Failed to cancel reminder:", err);
      return null;
    }
  },

  reminderGet: async (id: string): Promise<Reminder | null> => {
    try {
      return await invoke<Reminder | null>("reminder_get", { id });
    } catch (err) {
      console.error("Failed to get reminder:", err);
      return null;
    }
  },

  reminderClearFired: async (): Promise<void> => {
    try {
      await invoke("reminder_clear_fired");
    } catch (err) {
      console.error("Failed to clear fired reminders:", err);
    }
  },

  launcherGetCapabilities: async (): Promise<LauncherCapabilities> => {
    try {
      return await invoke<LauncherCapabilities>("launcher_get_capabilities");
    } catch (err) {
      console.error("Failed to get launcher capabilities:", err);
      return {
        open_application: false,
        open_file: false,
        open_folder: false,
        open_url: false,
        system_actions: false,
      };
    }
  },

  launcherList: async (): Promise<LauncherItem[]> => {
    try {
      return await invoke<LauncherItem[]>("launcher_list");
    } catch {
      return [
        {
          id: "action-pomodoro",
          title: "Start Pomodoro Timer",
          subtitle: "25 minutes focus session",
          icon: "timer",
          action: { type: "bbq_action", payload: { action: "open_timer" } },
          source: "built_in",
          usage_count: 12,
          favorite: true,
          last_used_at: null,
        },
        {
          id: "action-clipboard",
          title: "Clipboard History",
          subtitle: "Browse recent text clippings",
          icon: "clipboard",
          action: { type: "bbq_action", payload: { action: "open_clipboard" } },
          source: "built_in",
          usage_count: 8,
          favorite: true,
          last_used_at: null,
        },
        {
          id: "action-system",
          title: "System Performance",
          subtitle: "Battery, network & volume",
          icon: "settings",
          action: { type: "bbq_action", payload: { action: "open_system" } },
          source: "built_in",
          usage_count: 3,
          favorite: false,
          last_used_at: null,
        },
      ];
    }
  },

  launcherSearch: async (query: string): Promise<LauncherItem[]> => {
    try {
      return await invoke<LauncherItem[]>("launcher_search", { query });
    } catch {
      const all = await bbqCommands.launcherList();
      const q = query.toLowerCase().trim();
      if (!q) return all;
      return all.filter(
        (i) => i.title.toLowerCase().includes(q) || (i.subtitle && i.subtitle.toLowerCase().includes(q))
      );
    }
  },

  launcherLaunch: async (itemId: string): Promise<void> => {
    await invoke("launcher_launch", { itemId });
  },

  launcherAddFavorite: async (itemId: string): Promise<void> => {
    try {
      await invoke("launcher_add_favorite", { itemId });
    } catch (err) {
      console.error("Failed to add favorite:", err);
    }
  },

  launcherRemoveFavorite: async (itemId: string): Promise<void> => {
    try {
      await invoke("launcher_remove_favorite", { itemId });
    } catch (err) {
      console.error("Failed to remove favorite:", err);
    }
  },

  launcherListFavorites: async (): Promise<LauncherItem[]> => {
    try {
      return await invoke<LauncherItem[]>("launcher_list_favorites");
    } catch (err) {
      console.error("Failed to list favorites:", err);
      return [];
    }
  },

  launcherListRecent: async (): Promise<LauncherItem[]> => {
    try {
      return await invoke<LauncherItem[]>("launcher_list_recent");
    } catch (err) {
      console.error("Failed to list recent launcher items:", err);
      return [];
    }
  },

  launcherClearRecent: async (): Promise<boolean> => {
    try {
      await invoke("launcher_clear_recent");
      return true;
    } catch (err) {
      console.error("Failed to clear recent launcher items:", err);
      return false;
    }
  },

  dropInspect: async (paths: string[]): Promise<DropBatch | null> => {
    try {
      return await invoke<DropBatch>("drop_inspect", { paths });
    } catch (err) {
      console.error("Failed to inspect dropped paths:", err);
      return null;
    }
  },

  dropGetActions: async (batchId: string): Promise<DropAction[]> => {
    try {
      return await invoke<DropAction[]>("drop_get_actions", { batchId });
    } catch (err) {
      console.error("Failed to get drop actions:", err);
      return [];
    }
  },

  dropExecute: async (
    batchId: string,
    action: DropAction,
    targetId?: string
  ): Promise<DropActionResult | null> => {
    try {
      return await invoke<DropActionResult>("drop_execute", {
        batchId,
        action,
        targetId: targetId ?? null,
      });
    } catch (err) {
      console.error("Failed to execute drop action:", err);
      return null;
    }
  },

  dropClear: async (): Promise<void> => {
    try {
      await invoke("drop_clear");
    } catch (err) {
      console.error("Failed to clear drop batch:", err);
    }
  },

  hotkeyGetDefinition: async (): Promise<HotkeyDefinition | null> => {
    try {
      return await invoke<HotkeyDefinition>("hotkey_get_definition");
    } catch (err) {
      console.error("Failed to get hotkey definition:", err);
      return null;
    }
  },

  hotkeyUpdateDefinition: async (definition: HotkeyDefinition): Promise<boolean> => {
    try {
      await invoke("hotkey_update_definition", { definition });
      return true;
    } catch (err) {
      console.error("Failed to update hotkey definition:", err);
      return false;
    }
  },

  hotkeyGetCapabilities: async (): Promise<HotkeyCapabilities | null> => {
    try {
      return await invoke<HotkeyCapabilities>("hotkey_get_capabilities");
    } catch (err) {
      console.error("Failed to get hotkey capabilities:", err);
      return null;
    }
  },

  getPlatformCapabilities: async (): Promise<PlatformCapabilities | null> => {
    try {
      return await invoke<PlatformCapabilities>("get_platform_capabilities");
    } catch (err) {
      console.error("Failed to get platform capabilities:", err);
      return null;
    }
  },
};
