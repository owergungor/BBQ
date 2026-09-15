import { createDomainStore } from "./createStore.ts";
import type { BbqSettings } from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToSettingsChanged } from "../ipc/events.ts";

export type AccentPreset = "orange" | "blue" | "purple" | "green" | "red" | "pink" | "cyan";

export const ACCENT_PALETTES: Record<
  AccentPreset,
  { accent: string; hover: string; glow: string; subtle: string }
> = {
  orange: {
    accent: "#ff6b35",
    hover: "#ff7d4d",
    glow: "rgba(255, 107, 53, 0.35)",
    subtle: "rgba(255, 107, 53, 0.15)",
  },
  blue: {
    accent: "#3b82f6",
    hover: "#60a5fa",
    glow: "rgba(59, 130, 246, 0.35)",
    subtle: "rgba(59, 130, 246, 0.15)",
  },
  purple: {
    accent: "#a855f7",
    hover: "#c084fc",
    glow: "rgba(168, 85, 247, 0.35)",
    subtle: "rgba(168, 85, 247, 0.15)",
  },
  green: {
    accent: "#10b981",
    hover: "#34d399",
    glow: "rgba(16, 185, 129, 0.35)",
    subtle: "rgba(16, 185, 129, 0.15)",
  },
  red: {
    accent: "#ef4444",
    hover: "#f87171",
    glow: "rgba(239, 68, 68, 0.35)",
    subtle: "rgba(239, 68, 68, 0.15)",
  },
  pink: {
    accent: "#ec4899",
    hover: "#f472b6",
    glow: "rgba(236, 72, 153, 0.35)",
    subtle: "rgba(236, 72, 153, 0.15)",
  },
  cyan: {
    accent: "#06b6d4",
    hover: "#22d3ee",
    glow: "rgba(6, 182, 212, 0.35)",
    subtle: "rgba(6, 182, 212, 0.15)",
  },
};

export const defaultSettings: BbqSettings = {
  theme: "system",
  accent_color: "orange",
  custom_accent_color: null,
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

export function deriveCustomPalette(hex: string): {
  accent: string;
  hover: string;
  glow: string;
  subtle: string;
} {
  const clean = hex.trim().replace("#", "");
  let r = 255, g = 107, b = 53;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) || 255;
    g = parseInt(clean[1] + clean[1], 16) || 107;
    b = parseInt(clean[2] + clean[2], 16) || 53;
  } else if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16) || 255;
    g = parseInt(clean.slice(2, 4), 16) || 107;
    b = parseInt(clean.slice(4, 6), 16) || 53;
  }
  const hoverR = Math.min(255, Math.round(r + (255 - r) * 0.15));
  const hoverG = Math.min(255, Math.round(g + (255 - g) * 0.15));
  const hoverB = Math.min(255, Math.round(b + (255 - b) * 0.15));

  const hexFormat = `#${clean.length === 6 ? clean : `${clean}${clean}`.slice(0, 6)}`;
  return {
    accent: hexFormat,
    hover: `rgb(${hoverR}, ${hoverG}, ${hoverB})`,
    glow: `rgba(${r}, ${g}, ${b}, 0.35)`,
    subtle: `rgba(${r}, ${g}, ${b}, 0.15)`,
  };
}

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
 * Directly injects theme, accent color, and reduced-motion dataset attributes on document.documentElement
 * ensuring zero-JS CSS variable theming and hardware-accelerated transitions.
 */
export function applyThemeAndMotionToDom(settings: BbqSettings): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", settings.theme);
    document.documentElement.setAttribute(
      "data-reduced-motion",
      settings.reduced_motion ? "true" : "false"
    );

    const accentVal = (settings.accent_color || "orange").trim();
    const accentLower = accentVal.toLowerCase();
    let palette: { accent: string; hover: string; glow: string; subtle: string };

    if (accentLower in ACCENT_PALETTES) {
      palette = ACCENT_PALETTES[accentLower as AccentPreset];
      document.documentElement.setAttribute("data-accent", accentLower);
    } else if (accentLower === "custom" && settings.custom_accent_color) {
      palette = deriveCustomPalette(settings.custom_accent_color);
      document.documentElement.setAttribute("data-accent", "custom");
    } else if (accentLower.startsWith("#")) {
      palette = deriveCustomPalette(accentLower);
      document.documentElement.setAttribute("data-accent", "custom");
    } else {
      palette = ACCENT_PALETTES.orange;
      document.documentElement.setAttribute("data-accent", "orange");
    }

    if (document.documentElement.style?.setProperty) {
      document.documentElement.style.setProperty("--bbq-accent", palette.accent);
      document.documentElement.style.setProperty("--bbq-accent-hover", palette.hover);
      document.documentElement.style.setProperty("--bbq-accent-glow", palette.glow);
      document.documentElement.style.setProperty("--bbq-accent-subtle", palette.subtle);
      document.documentElement.style.setProperty("--accent", palette.accent);
      document.documentElement.style.setProperty("--accent-glow", palette.glow);
      document.documentElement.style.setProperty("--accent-hover", palette.hover);
      document.documentElement.style.setProperty("--accent-subtle", palette.subtle);

      if (settings.island_width) {
        document.documentElement.style.setProperty(
          "--bbq-compact-width",
          `${settings.island_width}px`
        );
      }
      if (settings.island_height) {
        document.documentElement.style.setProperty(
          "--bbq-compact-height",
          `${settings.island_height}px`
        );
      }
    }
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
