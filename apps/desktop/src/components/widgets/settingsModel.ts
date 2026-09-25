/**
 * settingsModel.ts
 * Pure, side-effect-free domain functions for BBQ v1.3 Milestone 8 Settings & Personalization HUD.
 */
import type { CapabilityStatus, PlatformCapabilities } from "@bbq/types";
import { widgetRegistry } from "../../island/widgetRegistry.ts";

export const ACTIVE_HUD_WIDGET_IDS: readonly string[] = [
  "drop",
  "files",
  "clipboard",
  "media",
  "system",
  "launcher",
  "timer",
  "reminder",
  "settings",
];

export const MIN_ISLAND_WIDTH = 180;
export const MAX_ISLAND_WIDTH = 640;
export const DEFAULT_ISLAND_WIDTH = 240;

export const MIN_ISLAND_HEIGHT = 36;
export const MAX_ISLAND_HEIGHT = 520;
export const DEFAULT_ISLAND_HEIGHT = 38;

export const MIN_CLIPBOARD_CAPACITY = 10;
export const MAX_CLIPBOARD_CAPACITY = 100;
export const DEFAULT_CLIPBOARD_CAPACITY = 100;

export const MIN_CLIPBOARD_RETENTION_DAYS = 1;
export const MAX_CLIPBOARD_RETENTION_DAYS = 90;
export const DEFAULT_CLIPBOARD_RETENTION_DAYS = 30;

export interface WcagContrastResult {
  ratio: number;
  normalTextAa: boolean; // >= 4.5
  largeTextAa: boolean; // >= 3.0
  uiComponentAa: boolean; // >= 3.0
  normalTextAaa: boolean; // >= 7.0
}

export interface HotkeyValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Clamps numeric dimension with strict safety against NaN, Infinity, negative values.
 */
export function clampDimension(
  val: number | null | undefined,
  min: number,
  max: number,
  defaultVal: number
): number {
  if (val === null || val === undefined || typeof val !== "number" || !Number.isFinite(val)) {
    return defaultVal;
  }
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * Validates and clamps island width to [180, 640].
 */
export function clampIslandWidth(val: number | null | undefined): number {
  return clampDimension(val, MIN_ISLAND_WIDTH, MAX_ISLAND_WIDTH, DEFAULT_ISLAND_WIDTH);
}

/**
 * Validates and clamps island height to [36, 520].
 */
export function clampIslandHeight(val: number | null | undefined): number {
  return clampDimension(val, MIN_ISLAND_HEIGHT, MAX_ISLAND_HEIGHT, DEFAULT_ISLAND_HEIGHT);
}

/**
 * Validates and clamps clipboard capacity to [10, 100] matching Rust MAX_CLIPBOARD_MAX_ENTRIES.
 */
export function clampClipboardCapacity(val: number | null | undefined): number {
  return clampDimension(
    val,
    MIN_CLIPBOARD_CAPACITY,
    MAX_CLIPBOARD_CAPACITY,
    DEFAULT_CLIPBOARD_CAPACITY
  );
}

/**
 * Validates and clamps clipboard retention to [1, 90] days.
 */
export function clampClipboardRetention(val: number | null | undefined): number {
  return clampDimension(
    val,
    MIN_CLIPBOARD_RETENTION_DAYS,
    MAX_CLIPBOARD_RETENTION_DAYS,
    DEFAULT_CLIPBOARD_RETENTION_DAYS
  );
}

/**
 * Validates and normalizes a HEX color string (#RGB or #RRGGBB).
 */
export function validateHexColor(hex: string | null | undefined): {
  valid: boolean;
  normalized: string;
} {
  if (!hex || typeof hex !== "string") {
    return { valid: false, normalized: "#007aff" };
  }
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    return { valid: false, normalized: "#007aff" };
  }
  if (clean.length === 3) {
    const r = clean[0] + clean[0];
    const g = clean[1] + clean[1];
    const b = clean[2] + clean[2];
    return { valid: true, normalized: `#${r.toLowerCase()}${g.toLowerCase()}${b.toLowerCase()}` };
  }
  if (clean.length === 6) {
    return { valid: true, normalized: `#${clean.toLowerCase()}` };
  }
  return { valid: false, normalized: "#007aff" };
}

/**
 * Computes W3C relative luminance from sRGB channel [0, 255].
 */
function sRgbToLinear(c: number): number {
  const norm = Math.max(0, Math.min(255, c)) / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

export function parseHexRgb(hex: string): [number, number, number] {
  const { normalized } = validateHexColor(hex);
  const clean = normalized.slice(1);
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b];
}

export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex);
  const rLin = sRgbToLinear(r);
  const gLin = sRgbToLinear(g);
  const bLin = sRgbToLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Computes exact W3C WCAG 2.1 contrast ratio and AA/AAA compliance flags.
 */
export function computeWcagContrast(
  fgHex: string | null | undefined,
  bgHex: string | null | undefined
): WcagContrastResult {
  const fg = validateHexColor(fgHex).normalized;
  const bg = validateHexColor(bgHex).normalized;

  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);

  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  // W3C formula: (L1 + 0.05) / (L2 + 0.05)
  const rawRatio = (brighter + 0.05) / (darker + 0.05);
  // Round to 2 decimal places deterministically
  const ratio = Math.round(rawRatio * 100) / 100;

  return {
    ratio,
    normalTextAa: ratio >= 4.5,
    largeTextAa: ratio >= 3.0,
    uiComponentAa: ratio >= 3.0,
    normalTextAaa: ratio >= 7.0,
  };
}

const MODIFIER_ORDER: Record<string, number> = {
  ctrl: 1,
  alt: 2,
  shift: 3,
  super: 4,
  meta: 4,
  cmd: 4,
};

const CANONICAL_MODIFIERS: Record<string, string> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  super: "Super",
  meta: "Meta",
  cmd: "Cmd",
  command: "Cmd",
};

/**
 * Validates and normalizes a global hotkey sequence string.
 * Enforces modifier ordering, case normalization, and rejects invalid/duplicate modifiers.
 */
export function validateHotkeyInput(input: string | null | undefined): HotkeyValidationResult {
  if (!input || typeof input !== "string") {
    return { valid: false, normalized: "", error: "Hotkey input cannot be empty" };
  }

  const raw = input.trim();
  if (!raw) {
    return { valid: false, normalized: "", error: "Hotkey input cannot be empty" };
  }

  const parts = raw.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || raw.endsWith("+")) {
    return { valid: false, normalized: "", error: "Incomplete hotkey sequence" };
  }

  const modifiers: string[] = [];
  const keys: string[] = [];
  const seenModifiers = new Set<string>();

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (CANONICAL_MODIFIERS[lower]) {
      const canonical = CANONICAL_MODIFIERS[lower];
      if (seenModifiers.has(canonical.toLowerCase())) {
        return {
          valid: false,
          normalized: "",
          error: `Duplicate modifier detected: ${canonical}`,
        };
      }
      seenModifiers.add(canonical.toLowerCase());
      modifiers.push(canonical);
    } else {
      keys.push(part);
    }
  }

  if (modifiers.length === 0 && keys.length === 0) {
    return { valid: false, normalized: "", error: "Invalid hotkey sequence" };
  }

  if (keys.length === 0) {
    return {
      valid: false,
      normalized: "",
      error: "Hotkey sequence must include at least one non-modifier key",
    };
  }

  if (keys.length > 1) {
    return {
      valid: false,
      normalized: "",
      error: "Hotkey sequence cannot contain multiple non-modifier keys",
    };
  }

  const rawKey = keys[0];
  let canonicalKey = rawKey;

  // Single alphabetic key -> uppercase (e.g. 'p' -> 'P')
  if (rawKey.length === 1 && /[a-zA-Z]/.test(rawKey)) {
    canonicalKey = rawKey.toUpperCase();
  } else if (/^f[1-9][0-2]?$/i.test(rawKey)) {
    canonicalKey = rawKey.toUpperCase();
  } else {
    // Standard names: Space, Enter, Escape, Backspace, Tab, etc.
    const lower = rawKey.toLowerCase();
    if (lower === "space") canonicalKey = "Space";
    else if (lower === "enter" || lower === "return") canonicalKey = "Enter";
    else if (lower === "esc" || lower === "escape") canonicalKey = "Escape";
    else if (lower === "tab") canonicalKey = "Tab";
    else if (lower === "backspace") canonicalKey = "Backspace";
    else if (lower === "delete" || lower === "del") canonicalKey = "Delete";
  }

  // Sort modifiers by standard hierarchy: Ctrl -> Alt -> Shift -> Meta/Super
  modifiers.sort((a, b) => {
    const orderA = MODIFIER_ORDER[a.toLowerCase()] ?? 99;
    const orderB = MODIFIER_ORDER[b.toLowerCase()] ?? 99;
    return orderA - orderB;
  });

  const normalized = [...modifiers, canonicalKey].join("+");
  return { valid: true, normalized };
}

/**
 * Sanitizes and deduplicates the compact status indicator ordering.
 */
export function sanitizeIndicatorOrder(
  order: string[] | null | undefined,
  availableIds: string[]
): string[] {
  const availableSet = new Set(availableIds);
  const result: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(order)) {
    for (const id of order) {
      if (typeof id === "string" && availableSet.has(id) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }

  for (const id of availableIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}

/**
 * Maps capability status to human-readable label and UI color.
 */
export function formatCapabilityStatus(status: CapabilityStatus): {
  label: string;
  color: string;
} {
  switch (status) {
    case "supported":
      return { label: "Supported", color: "var(--bbq-success, #10b981)" };
    case "passive":
      return { label: "Passive / On-Demand", color: "var(--bbq-warning, #f59e0b)" };
    case "permissionRequired":
      return { label: "Permission Required", color: "var(--bbq-warning, #f59e0b)" };
    case "compositorDependent":
      return { label: "Compositor Dependent", color: "var(--bbq-info, #3b82f6)" };
    case "unavailable":
    default:
      return { label: "Unavailable", color: "var(--bbq-text-muted, #9ca3af)" };
  }
}

/**
 * Checks if the global hotkey capability is supported.
 */
export function isHotkeySupported(capabilities: PlatformCapabilities | null): boolean {
  if (!capabilities) return true;
  return capabilities.globalHotkey === "supported";
}

/**
 * Checks if clipboard live push events are active.
 */
export function isClipboardLiveSupported(capabilities: PlatformCapabilities | null): boolean {
  if (!capabilities) return true;
  return capabilities.clipboardLiveEvents === "supported";
}

export interface SanitizedDiagnostics {
  app: {
    name: string;
    version: string;
    buildMode: string;
  };
  platform: {
    os: string;
    arch: string;
    displayCount?: number;
    scaleFactor?: number;
  };
  capabilities: Record<string, string>;
  settingsSummary: {
    theme: string;
    accentColor: string;
    islandDimensions: string;
    clipboardEnabled: boolean;
    clipboardMaxEntries: number;
    clipboardRetentionDays: number;
    compactModeAuto: boolean;
    alwaysOnTop: boolean;
    pinned: boolean;
    onboardingCompleted: boolean;
    activeWidgetsCount: number;
  };
  storage: {
    schemaVersion: number;
    type: string;
    mode: string;
  };
  exportedAt: string;
}

/**
 * Generates deterministic, strictly sanitized diagnostic metadata for support / issue reporting.
 * PRIVACY GUARANTEE:
 * Must NOT contain clipboard contents, file paths, usernames, home directories, URLs, secrets, tokens,
 * personal document names, or arbitrary environment variables.
 */
export function generateSanitizedDiagnostics(
  settings: {
    theme?: string;
    accent_color?: string;
    island_width?: number;
    island_height?: number;
    clipboard_enabled?: boolean;
    clipboard_max_entries?: number;
    clipboard_retention_days?: number;
    compact_mode_auto?: boolean;
    always_on_top?: boolean;
    pinned?: boolean;
    onboarding_completed?: boolean;
    disabled_widgets?: string[];
    disabled_widget_ids?: string[];
    scale_factor?: number;
  },
  capabilities: PlatformCapabilities | null,
  extra?: {
    appVersion?: string;
    displayCount?: number;
    buildMode?: string;
    timestamp?: string;
    activeWidgetsCount?: number;
  }
): SanitizedDiagnostics {
  const os = capabilities?.platform ?? (
    typeof navigator !== "undefined" && navigator.userAgent.includes("Win")
      ? "windows"
      : typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
      ? "macos"
      : "linux"
  );

  const rawCaps: Record<string, string> = capabilities
    ? {
        globalHotkey: capabilities.globalHotkey,
        clipboardLiveEvents: capabilities.clipboardLiveEvents,
        clipboardHistory: capabilities.clipboardHistory,
        mediaControl: capabilities.mediaControl,
        mediaEvents: capabilities.mediaEvents,
        notifications: capabilities.notifications,
        displayChangeEvents: capabilities.displayChangeEvents,
        windowAbsolutePositioning: capabilities.windowAbsolutePositioning,
      }
    : {
        platform: os,
        status: "unloaded",
      };

  const rawDisabled =
    (settings.disabled_widgets as unknown[] | undefined) ??
    (settings.disabled_widget_ids as unknown[] | undefined) ??
    [];
  const disabledSet = new Set(Array.isArray(rawDisabled) ? (rawDisabled as string[]) : []);

  // Truthfully derive active HUD widgets: query registered non-declared widgets if available,
  // otherwise fallback to canonical 9 HUD widget IDs.
  const registeredActive = widgetRegistry
    .getAll()
    .filter((w) => !w.isDeclaredOnly && w.lifecycle !== "unavailable");

  const canonicalActiveIds =
    registeredActive.length > 0
      ? registeredActive.map((w) => w.id)
      : ACTIVE_HUD_WIDGET_IDS;

  const activeCount =
    typeof extra?.activeWidgetsCount === "number"
      ? extra.activeWidgetsCount
      : canonicalActiveIds.filter((id) => !disabledSet.has(id)).length;

  return {
    app: {
      name: "BBQ Desktop",
      version: extra?.appVersion ?? "2.0.0",
      buildMode: extra?.buildMode ?? "production",
    },
    platform: {
      os,
      arch:
        typeof globalThis !== "undefined" && "process" in globalThis
          ? ((globalThis as unknown as { process?: { arch?: string } }).process?.arch ?? "x86_64")
          : "x86_64",
      displayCount: extra?.displayCount ?? 1,
      scaleFactor: settings.scale_factor ?? 1.0,
    },
    capabilities: rawCaps,
    settingsSummary: {
      theme: settings.theme ?? "system",
      accentColor: settings.accent_color ?? "system",
      islandDimensions: `${settings.island_width ?? DEFAULT_ISLAND_WIDTH}x${settings.island_height ?? DEFAULT_ISLAND_HEIGHT}`,
      clipboardEnabled: Boolean(settings.clipboard_enabled),
      clipboardMaxEntries: settings.clipboard_max_entries ?? DEFAULT_CLIPBOARD_CAPACITY,
      clipboardRetentionDays: settings.clipboard_retention_days ?? DEFAULT_CLIPBOARD_RETENTION_DAYS,
      compactModeAuto: Boolean(settings.compact_mode_auto),
      alwaysOnTop: Boolean(settings.always_on_top),
      pinned: Boolean(settings.pinned),
      onboardingCompleted: Boolean(settings.onboarding_completed),
      activeWidgetsCount: activeCount,
    },
    storage: {
      schemaVersion: 1,
      type: "SQLite 3",
      mode: "WAL",
    },
    exportedAt: extra?.timestamp ?? "2026-01-01T00:00:00.000Z",
  };
}
