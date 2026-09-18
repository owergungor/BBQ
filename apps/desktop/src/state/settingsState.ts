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

export const LOCAL_STORAGE_SETTINGS_KEY = "bbq_settings";

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

function loadCachedSettings(): BbqSettings | null {
  const storage = getLocalStorage();
  if (storage) {
    try {
      const raw = storage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return { ...defaultSettings, ...parsed };
        }
      }
    } catch {
      // Ignore parse failure
    }
  }
  return null;
}

const cachedSettings = loadCachedSettings();

export interface SettingsDomainState {
  settings: BbqSettings;
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
}

export const initialSettingsState: SettingsDomainState = {
  settings: cachedSettings || defaultSettings,
  isLoading: cachedSettings === null,
  isLoaded: cachedSettings !== null,
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

// Immediate token injection at module load time to guarantee zero flash
if (typeof document !== "undefined" && document.documentElement) {
  applyThemeAndMotionToDom(initialSettingsState.settings);
}

let initPromise: Promise<void> | null = null;

export function initSettingsState(force = false): Promise<void> {
  if (initPromise && !force) return initPromise;

  initPromise = (async () => {
    try {
      settingsStore.setState({ isLoading: true, error: null });
      const loaded = await bbqCommands.getSettings();
      if (loaded) {
        const current = settingsStore.getState().settings;
        const merged: BbqSettings = {
          ...defaultSettings,
          ...loaded,
          custom_accent_color:
            loaded.custom_accent_color || current.custom_accent_color || null,
        };

        settingsStore.setState({
          settings: merged,
          isLoading: false,
          isLoaded: true,
        });

        applyThemeAndMotionToDom(merged);

        const storage = getLocalStorage();
        if (storage) {
          try {
            storage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(merged));
          } catch {
            // Ignore storage failure
          }
        }
      } else {
        settingsStore.setState({ isLoading: false, isLoaded: true });
      }
    } catch (err) {
      settingsStore.setState({
        isLoading: false,
        isLoaded: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Subscribe to reactive updates from backend
    try {
      await subscribeToSettingsChanged((updatedSettings) => {
        const current = settingsStore.getState().settings;
        const merged: BbqSettings = {
          ...defaultSettings,
          ...updatedSettings,
          custom_accent_color:
            updatedSettings.custom_accent_color || current.custom_accent_color || null,
        };
        settingsStore.setState({ settings: merged });
        applyThemeAndMotionToDom(merged);
        const storage = getLocalStorage();
        if (storage) {
          try {
            storage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(merged));
          } catch {
            // Ignore
          }
        }
      });
    } catch {
      // Safe outside Tauri runtime
    }
  })();

  return initPromise;
}

// Auto-trigger initialization on module import if running in browser
if (typeof window !== "undefined") {
  initSettingsState();
}

function coerceSettingValue(key: keyof BbqSettings, value: string): unknown {
  switch (key) {
    case "reduced_motion":
    case "auto_expand_on_event":
    case "start_at_login":
    case "hotkey_enabled":
    case "clipboard_history_enabled":
    case "notifications_enabled":
    case "timer_sound_enabled":
    case "reminder_sound_enabled":
    case "first_run_completed":
    case "onboarding_completed":
      return value === "true";

    case "island_width":
    case "island_height":
    case "clipboard_max_entries":
    case "clipboard_retention_days": {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : defaultSettings[key];
    }

    case "target_display_id":
      return value.trim() === "" || value === "null" ? null : value;

    case "custom_accent_color":
      return value.trim() === "" || value === "null" ? null : value;

    case "disabled_widgets":
    case "compact_indicator_order":
      try {
        const arr = JSON.parse(value);
        return Array.isArray(arr) ? arr : defaultSettings[key];
      } catch {
        return defaultSettings[key];
      }

    case "theme":
      return value === "light" || value === "dark" ? value : "system";

    case "accent_color":
      return value;

    case "global_hotkey":
      return value;

    default:
      return value;
  }
}

export async function updateSetting(key: string, value: string): Promise<boolean> {
  if (initPromise) {
    try {
      await initPromise;
    } catch {
      // Continue
    }
  }

  try {
    const success = await bbqCommands.updateSetting(key, value);
    if (success) {
      const current = settingsStore.getState().settings;
      if (key in current) {
        const typedKey = key as keyof BbqSettings;
        const parsedValue = coerceSettingValue(typedKey, value);
        const nextSettings: BbqSettings = {
          ...current,
          [typedKey]: parsedValue,
        };

        // If switching to an accent preset, keep custom_accent_color intact
        if (typedKey === "accent_color" && value !== "custom" && !nextSettings.custom_accent_color) {
          nextSettings.custom_accent_color = current.custom_accent_color;
        }

        settingsStore.setState({ settings: nextSettings, error: null });
        applyThemeAndMotionToDom(nextSettings);

        const storage = getLocalStorage();
        if (storage) {
          try {
            storage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(nextSettings));
          } catch {
            // Ignore
          }
        }
      }
    }
    return success;
  } catch (err) {
    settingsStore.setState({
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function updateSettingsBatch(patch: Partial<BbqSettings>): Promise<boolean> {
  // Ensure we wait for any initial backend fetch to avoid overwriting stored settings with defaults!
  if (initPromise) {
    try {
      await initPromise;
    } catch {
      // Continue
    }
  }

  const current = settingsStore.getState().settings;
  const nextSettings: BbqSettings = { ...current, ...patch };

  // Preserve existing custom color if switching to a preset so user doesn't lose their custom hex
  if (patch.accent_color && patch.accent_color !== "custom" && !patch.custom_accent_color) {
    nextSettings.custom_accent_color = current.custom_accent_color;
  }

  try {
    const success = await bbqCommands.updateSettings(nextSettings);
    if (!success) {
      // Revert optimistic update on backend rejection
      settingsStore.setState({
        settings: current,
        error: "Settings rejected by system backend",
      });
      applyThemeAndMotionToDom(current);
      return false;
    }

    settingsStore.setState({ settings: nextSettings, error: null });
    applyThemeAndMotionToDom(nextSettings);

    const storage = getLocalStorage();
    if (storage) {
      try {
        storage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(nextSettings));
      } catch {
        // Ignore
      }
    }
    return true;
  } catch (err) {
    settingsStore.setState({
      settings: current,
      error: err instanceof Error ? err.message : String(err),
    });
    applyThemeAndMotionToDom(current);
    return false;
  }
}

export async function resetSettingsToDefaults(): Promise<boolean> {
  try {
    const defaults = await bbqCommands.resetSettingsToDefaults();
    if (defaults) {
      settingsStore.setState({ settings: defaults });
      applyThemeAndMotionToDom(defaults);
      const storage = getLocalStorage();
      if (storage) {
        try {
          storage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(defaults));
        } catch {
          // Ignore
        }
      }
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
