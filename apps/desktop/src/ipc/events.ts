import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { IslandMode, MediaSession, PlaybackState, ClipboardEntry, FileEntry, BbqSettings } from "@bbq/types";

export async function subscribeToIslandMode(
  callback: (mode: IslandMode) => void
): Promise<UnlistenFn> {
  try {
    return await listen<IslandMode>("bbq://island_mode_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToMediaChanged(
  callback: (session: MediaSession | null) => void
): Promise<UnlistenFn> {
  try {
    return await listen<MediaSession | null>("bbq://media_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToMediaPlaybackState(
  callback: (state: PlaybackState) => void
): Promise<UnlistenFn> {
  try {
    return await listen<PlaybackState>("bbq://media_playback_state", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToClipboardChanged(
  callback: (entry: ClipboardEntry) => void
): Promise<UnlistenFn> {
  try {
    return await listen<ClipboardEntry>("bbq://clipboard_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToFileAdded(
  callback: (entry: FileEntry) => void
): Promise<UnlistenFn> {
  try {
    return await listen<FileEntry>("bbq://file_added", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToFileRemoved(
  callback: (id: string) => void
): Promise<UnlistenFn> {
  try {
    return await listen<string>("bbq://file_removed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToFileWorkspaceChanged(
  callback: (entries: FileEntry[]) => void
): Promise<UnlistenFn> {
  try {
    return await listen<FileEntry[]>("bbq://file_workspace_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToDisplayChanged(
  callback: (info: import("@bbq/types").DisplayChangedEvent) => void
): Promise<UnlistenFn> {
  try {
    return await listen<import("@bbq/types").DisplayChangedEvent>("bbq://display_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToSystemChanged(
  callback: (state: import("@bbq/types").SystemState) => void
): Promise<UnlistenFn> {
  try {
    return await listen<import("@bbq/types").SystemState>("bbq://system_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToTimerChanged(
  callback: (session: import("@bbq/types").TimerSession) => void
): Promise<UnlistenFn> {
  try {
    return await listen<import("@bbq/types").TimerSession>("bbq://timer_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToReminderChanged(
  callback: (reminder: import("@bbq/types").Reminder) => void
): Promise<UnlistenFn> {
  try {
    return await listen<import("@bbq/types").Reminder>("bbq://reminder_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToNotificationChanged(
  callback: (request: import("@bbq/types").NotificationRequest) => void
): Promise<UnlistenFn> {
  try {
    return await listen<import("@bbq/types").NotificationRequest>("bbq://notification_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToLauncherChanged(
  callback: (eventData: unknown) => void
): Promise<UnlistenFn> {
  try {
    return await listen("bbq://launcher_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToDropChanged(
  callback: (eventData: unknown) => void
): Promise<UnlistenFn> {
  try {
    return await listen("bbq://drop_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToHotkeyTriggered(
  callback: (data: { id: string; display_str: string }) => void
): Promise<UnlistenFn> {
  try {
    return await listen<{ id: string; display_str: string }>("bbq://hotkey_triggered", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToHotkeyConflict(
  callback: (data: { id: string; display_str: string; reason: string }) => void
): Promise<UnlistenFn> {
  try {
    return await listen<{ id: string; display_str: string; reason: string }>("bbq://hotkey_conflict", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToSettingsChanged(
  callback: (settings: BbqSettings) => void
): Promise<UnlistenFn> {
  try {
    return await listen<BbqSettings>("bbq://settings_changed", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToOpenSettings(
  callback: () => void
): Promise<UnlistenFn> {
  try {
    return await listen<void>("bbq://open_settings", () => {
      callback();
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToWindowBlur(
  callback: () => void
): Promise<UnlistenFn> {
  try {
    return await listen<void>("bbq://window_blur", () => {
      callback();
    });
  } catch {
    return () => {};
  }
}

export async function subscribeToShowIsland(
  callback: () => void
): Promise<UnlistenFn> {
  try {
    return await listen<void>("bbq://show_island", () => {
      callback();
    });
  } catch {
    return () => {};
  }
}

export interface DatabaseRecoveredPayload {
  recovered: boolean;
  backup_name: string;
  message: string;
}

export async function subscribeToDatabaseRecovered(
  callback: (payload: DatabaseRecoveredPayload) => void
): Promise<UnlistenFn> {
  try {
    return await listen<DatabaseRecoveredPayload>("bbq://db_recovered", (event) => {
      callback(event.payload);
    });
  } catch {
    return () => {};
  }
}
