import { createDomainStore } from "./createStore.ts";
import type { BbqSettings } from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToSettingsChanged } from "../ipc/events.ts";

export type AccentPreset =
  | "blue"
  | "red"
  | "green"
  | "orange"
  | "yellow"
  | "pink"
  | "purple"
  | "indigo"
  | "teal"
  | "mint"
  | "cyan";

export interface SystemAccentColorDef {
  light: string;
  dark: string;
  label: string;
}

export const SYSTEM_ACCENT_COLORS: Record<AccentPreset, SystemAccentColorDef> = {
  blue: { light: "#007AFF", dark: "#0A84FF", label: "Blue" },
  red: { light: "#FF3B30", dark: "#FF453A", label: "Red" },
  green: { light: "#34C759", dark: "#30D158", label: "Green" },
  orange: { light: "#FF9500", dark: "#FF9F0A", label: "Orange" },
  yellow: { light: "#FFCC00", dark: "#FFD60A", label: "Yellow" },
  pink: { light: "#FF2D55", dark: "#FF375F", label: "Pink" },
  purple: { light: "#5856D6", dark: "#BF5AF2", label: "Purple" },
  indigo: { light: "#5856D6", dark: "#5E5CE6", label: "Indigo" },
  teal: { light: "#30B0C7", dark: "#40C8E0", label: "Teal" },
  mint: { light: "#00C7BE", dark: "#63E6E2", label: "Mint" },
  cyan: { light: "#32ADE6", dark: "#64D2FF", label: "Cyan" },
};

export interface AccentTokenPalette {
  accent: string;
  hover: string;
  glow: string;
  subtle: string;
}

export function computeAccentTokens(hex: string, isLight = false): AccentTokenPalette {
  const clean = hex.trim().replace("#", "");
  let r = 10;
  let g = 132;
  let b = 255;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) || 0;
    g = parseInt(clean[1] + clean[1], 16) || 0;
    b = parseInt(clean[2] + clean[2], 16) || 0;
  } else if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16) || 0;
    g = parseInt(clean.slice(2, 4), 16) || 0;
    b = parseInt(clean.slice(4, 6), 16) || 0;
  }

  let hover: string;
  if (isLight) {
    const hr = Math.max(0, Math.round(r * 0.88));
    const hg = Math.max(0, Math.round(g * 0.88));
    const hb = Math.max(0, Math.round(b * 0.88));
    hover = `rgb(${hr}, ${hg}, ${hb})`;
  } else {
    const hr = Math.min(255, Math.round(r + (255 - r) * 0.15));
    const hg = Math.min(255, Math.round(g + (255 - g) * 0.15));
    const hb = Math.min(255, Math.round(b + (255 - b) * 0.15));
    hover = `rgb(${hr}, ${hg}, ${hb})`;
  }

  const hexFormat = `#${clean.length === 6 ? clean : `${clean}${clean}`.slice(0, 6)}`;
  return {
    accent: hexFormat,
    hover,
    glow: `rgba(${r}, ${g}, ${b}, 0.35)`,
    subtle: `rgba(${r}, ${g}, ${b}, 0.15)`,
  };
}

export const deriveCustomPalette = (hex: string, isLight = false): AccentTokenPalette =>
  computeAccentTokens(hex, isLight);

export const ACCENT_PALETTES: Record<AccentPreset, AccentTokenPalette> = Object.fromEntries(
  Object.keys(SYSTEM_ACCENT_COLORS).map((key) => {
    const preset = key as AccentPreset;
    return [preset, computeAccentTokens(SYSTEM_ACCENT_COLORS[preset].dark, false)];
  })
) as Record<AccentPreset, AccentTokenPalette>;

export const defaultSettings: BbqSettings = {
  theme: "system",
  accent_color: "blue",
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

export function isEffectiveLight(theme: BbqSettings["theme"]): boolean {
  if (theme === "light") return true;
  if (theme === "dark") return false;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  }
  return false;
}

export function getAccentPalette(
  accent: string,
  theme: BbqSettings["theme"],
  customHex?: string | null
): AccentTokenPalette {
  const isLight = isEffectiveLight(theme);
  const clean = (accent || "blue").trim().toLowerCase();

  if (clean in SYSTEM_ACCENT_COLORS) {
    const def = SYSTEM_ACCENT_COLORS[clean as AccentPreset];
    const hex = isLight ? def.light : def.dark;
    return computeAccentTokens(hex, isLight);
  }

  if (clean === "custom" || clean.startsWith("#")) {
    const hex = clean.startsWith("#") ? clean : customHex || "#0A84FF";
    return computeAccentTokens(hex, isLight);
  }

  // Fallback to blue
  const blueDef = SYSTEM_ACCENT_COLORS.blue;
  const hex = isLight ? blueDef.light : blueDef.dark;
  return computeAccentTokens(hex, isLight);
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

    const accentVal = (settings.accent_color || "blue").trim();
    const accentLower = accentVal.toLowerCase();

    let effectiveAccent = "blue";
    if (accentLower in SYSTEM_ACCENT_COLORS) {
      effectiveAccent = accentLower;
    } else if (accentLower === "custom" || accentLower.startsWith("#")) {
      effectiveAccent = "custom";
    }

    document.documentElement.setAttribute("data-accent", effectiveAccent);

    const palette = getAccentPalette(
      settings.accent_color || "blue",
      settings.theme,
      settings.custom_accent_color
    );

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
