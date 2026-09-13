import { createDomainStore } from "./createStore.ts";
import type { BbqSettings } from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToSettingsChanged } from "../ipc/events.ts";

export const defaultSettings: BbqSettings = {
  theme: "system",
  reduced_motion: false,
  island_width: 240,
  island_height: 38,
  target_display_id: null,
  auto_expand_on_event: true,
  start_at_login: false,
  global_hotkey: "Ctrl+Space",
  hotkey_enabled: true,
  clipboard_history_enabled: false,
  clipboard_retention_days: 30,
  clipboard_max_entries: 100,
  notifications_enabled: true,
  timer_sound_enabled: true,
  reminder_sound_enabled: true,
  disabled_widgets: [],
  compact_indicator_order: [],
  first_run_completed: false,
  onboarding_completed: false,
};

export interface SettingsDomainState {
  settings: BbqSettings;
  isLoading: boolean;
  error: string | null;
}

export const initialSettingsState: SettingsDomainState = {
  settings: defaultSettings,
  isLoading: false,
  error: null,
};

export const settingsStore = createDomainStore<SettingsDomainState>(initialSettingsState);

export const useSettingsState = settingsStore.useStore;

/**
 * Directly injects theme and reduced-motion dataset attributes on document.documentElement
 * ensuring zero-JS CSS variable theming and hardware-accelerated transitions.
 */
export function applyThemeAndMotionToDom(settings: BbqSettings): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", settings.theme);
    document.documentElement.setAttribute(
      "data-reduced-motion",
      settings.reduced_motion ? "true" : "false"
    );
  }
}

let isInitialized = false;

export async function initSettingsState(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  try {
    settingsStore.setState({ isLoading: true, error: null });
    const loaded = await bbqCommands.getSettings();
    if (loaded) {
      settingsStore.setState({ settings: loaded, isLoading: false });
      applyThemeAndMotionToDom(loaded);
    } else {
      settingsStore.setState({ isLoading: false });
    }
  } catch (err) {
    settingsStore.setState({
      isLoading: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Subscribe to reactive updates from backend
  await subscribeToSettingsChanged((updatedSettings) => {
    settingsStore.setState({ settings: updatedSettings });
    applyThemeAndMotionToDom(updatedSettings);
  });
}

export async function updateSetting(key: string, value: string): Promise<boolean> {
  try {
    const success = await bbqCommands.updateSetting(key, value);
    return success;
  } catch (err) {
    settingsStore.setState({
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function updateSettingsBatch(patch: Partial<BbqSettings>): Promise<boolean> {
  const current = settingsStore.getState().settings;
  const nextSettings: BbqSettings = { ...current, ...patch };
  settingsStore.setState({ settings: nextSettings });
  applyThemeAndMotionToDom(nextSettings);
  try {
    const success = await bbqCommands.updateSettings(nextSettings);
    return success;
  } catch (err) {
    settingsStore.setState({
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function resetSettingsToDefaults(): Promise<boolean> {
  try {
    const defaults = await bbqCommands.resetSettingsToDefaults();
    if (defaults) {
      settingsStore.setState({ settings: defaults });
      applyThemeAndMotionToDom(defaults);
      return true;
    }
    return false;
  } catch (err) {
    settingsStore.setState({
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
