/**
 * BBQ v1.3 - Milestone 6: Productivity HUD Pure Model
 * Pure, deterministic logic and mathematics for Timer, Clipboard, and Drop Shelf.
 *
 * Strict Project Invariants:
 * - NO setInterval / setTimeout loops
 * - NO requestAnimationFrame loops
 * - Safe numeric handling (zero division, NaN, Infinity, negative values)
 * - Bounded collections (Clipboard max 30-50, Drop Shelf max 20)
 * - Privacy-first clipboard masking
 */

import type {
  TimerSession,
  PomodoroPhase,
  ClipboardEntry,
  DropTarget,
  DropTargetKind,
} from "@bbq/types";

// ============================================================================
// 1. TIMER MATHEMATICS & CALCULATIONS
// ============================================================================

export interface CalculatedTimerDisplay {
  remainingMs: number;
  progressPct: number;
  formattedTime: string;
  isCompleted: boolean;
  phaseLabel: string;
}

/**
 * Calculates display time in milliseconds from authoritative timestamps.
 * Strictly uses target_at - now for countdown/pomodoro, or accumulated + active for stopwatch.
 */
export function calculateRemainingMs(
  session: Pick<TimerSession, "mode" | "state" | "target_at" | "started_at" | "remaining_ms" | "duration_ms"> | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!session) return 0;

  if (session.mode === "Countdown" || session.mode === "Pomodoro") {
    if (session.state === "Running" && typeof session.target_at === "number" && !isNaN(session.target_at)) {
      return Math.max(0, session.target_at - nowMs);
    }
    const val = session.remaining_ms ?? session.duration_ms ?? 0;
    return Math.max(0, isNaN(val) ? 0 : val);
  } else {
    // Stopwatch
    if (session.state === "Running" && typeof session.started_at === "number" && !isNaN(session.started_at)) {
      const active = Math.max(0, nowMs - session.started_at);
      const accumulated = session.remaining_ms ?? 0;
      return Math.max(0, (isNaN(accumulated) ? 0 : accumulated) + active);
    }
    const val = session.remaining_ms ?? 0;
    return Math.max(0, isNaN(val) ? 0 : val);
  }
}

/**
 * Calculates progress percentage [0, 100].
 * Standard HUD representation: 100% when started down to 0% at completion.
 * Guards against duration <= 0, NaN, and Infinity.
 */
export function calculateTimerProgressPct(
  remainingMs: number,
  durationMs: number | null | undefined
): number {
  if (typeof durationMs !== "number" || isNaN(durationMs) || durationMs <= 0) {
    return 0;
  }
  if (typeof remainingMs !== "number" || isNaN(remainingMs) || remainingMs <= 0) {
    return 0;
  }
  if (remainingMs >= durationMs) {
    return 100;
  }
  const pct = (remainingMs / durationMs) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Calculates stroke-dashoffset for circular SVG gauge.
 * Progress goes from full ring (offset 0) to empty ring (offset circumference) as time counts down.
 */
export function calculateTimerDashOffset(
  progressPct: number,
  radius: number = 44
): { circumference: number; dashOffset: number } {
  const safeRadius = Math.max(1, isNaN(radius) ? 44 : radius);
  const circumference = 2 * Math.PI * safeRadius;
  const clampedPct = Math.min(100, Math.max(0, isNaN(progressPct) ? 0 : progressPct));
  const dashOffset = circumference * (1 - clampedPct / 100);
  return {
    circumference: Number(circumference.toFixed(2)),
    dashOffset: Number(dashOffset.toFixed(2)),
  };
}

/**
 * Formats milliseconds into clean mm:ss or hh:mm:ss.
 */
export function formatProductivityTime(ms: number): string {
  if (typeof ms !== "number" || isNaN(ms) || ms < 0) {
    return "00:00";
  }
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return hours + ":" + pad(minutes) + ":" + pad(seconds);
  }
  return pad(minutes) + ":" + pad(seconds);
}

/**
 * Normalizes pomodoro phase badge text and color.
 */
export function getPomodoroPhaseInfo(phase: PomodoroPhase | null | undefined): {
  label: string;
  color: string;
  iconName: "timer" | "coffee" | "palm";
} {
  switch (phase) {
    case "ShortBreak":
      return { label: "Short Break", color: "#10b981", iconName: "coffee" };
    case "LongBreak":
      return { label: "Long Break", color: "#3b82f6", iconName: "palm" };
    case "Work":
    default:
      return { label: "Focus Work", color: "#ef4444", iconName: "timer" };
  }
}

// ============================================================================
// 1.1 CUSTOM TIMER VALIDATION
// ============================================================================

export const MIN_CUSTOM_TIMER_MINUTES = 0.1; // 6 seconds
export const MAX_CUSTOM_TIMER_MINUTES = 1440; // 24 hours (matches MAX_TIMER_DURATION_MS)

export type CustomDurationResult =
  | { valid: true; durationMs: number; minutes: number }
  | { valid: false; reason: string };

/**
 * Validates and sanitizes custom timer duration input.
 * Strictly guards against:
 * - Empty / whitespace-only string
 * - NaN, Infinity, -Infinity
 * - Zero or negative duration
 * - Durations below MIN_CUSTOM_TIMER_MINUTES (0.1 min)
 * - Durations above MAX_CUSTOM_TIMER_MINUTES (1440 min / 24 hours)
 */
export function parseAndValidateCustomMinutes(
  input: string | number | null | undefined
): CustomDurationResult {
  if (input === null || input === undefined) {
    return { valid: false, reason: "Duration is required" };
  }

  const rawStr = typeof input === "string" ? input.trim() : String(input).trim();
  if (!rawStr) {
    return { valid: false, reason: "Duration is required" };
  }

  const mins = typeof input === "number" ? input : parseFloat(rawStr);

  if (!Number.isFinite(mins) || Number.isNaN(mins)) {
    return { valid: false, reason: "Duration must be a finite number" };
  }

  if (mins <= 0) {
    return { valid: false, reason: "Duration must be greater than zero" };
  }

  if (mins < MIN_CUSTOM_TIMER_MINUTES) {
    return {
      valid: false,
      reason: `Duration must be at least ${MIN_CUSTOM_TIMER_MINUTES} minutes (6 seconds)`,
    };
  }

  if (mins > MAX_CUSTOM_TIMER_MINUTES) {
    return {
      valid: false,
      reason: `Duration exceeds maximum limit of ${MAX_CUSTOM_TIMER_MINUTES} minutes (24 hours)`,
    };
  }

  const ms = Math.round(mins * 60 * 1000);
  if (ms <= 0 || ms > 24 * 60 * 60 * 1000) {
    return { valid: false, reason: "Invalid duration calculation" };
  }

  return { valid: true, durationMs: ms, minutes: mins };
}

/**
 * Formats milliseconds into clean MM:SS.SS (minutes:seconds.hundredths) for stopwatch display.
 */
export function formatStopwatchDisplay(ms: number): string {
  if (typeof ms !== "number" || isNaN(ms) || ms < 0) {
    return "00:00.00";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cs = String(hundredths).padStart(2, "0");

  return `${mm}:${ss}.${cs}`;
}

export interface CountdownValidationResult {
  valid: boolean;
  durationMs: number;
  minutes: number;
  seconds: number;
  reason?: string;
}

/**
 * Validates separate countdown minutes (0..1440) and seconds (0..59).
 * 0:0 cannot start.
 */
export function parseAndValidateCountdown(
  minutesInput: string | number | null | undefined,
  secondsInput: string | number | null | undefined
): CountdownValidationResult {
  const mRaw =
    minutesInput === null || minutesInput === undefined || String(minutesInput).trim() === ""
      ? 0
      : Number(minutesInput);
  const sRaw =
    secondsInput === null || secondsInput === undefined || String(secondsInput).trim() === ""
      ? 0
      : Number(secondsInput);

  if (
    !Number.isFinite(mRaw) ||
    Number.isNaN(mRaw) ||
    !Number.isFinite(sRaw) ||
    Number.isNaN(sRaw)
  ) {
    return {
      valid: false,
      durationMs: 0,
      minutes: 0,
      seconds: 0,
      reason: "Minutes and seconds must be numbers",
    };
  }

  const m = Math.floor(mRaw);
  const s = Math.floor(sRaw);

  if (m < 0 || m > 1440) {
    return {
      valid: false,
      durationMs: 0,
      minutes: m,
      seconds: s,
      reason: "Minutes must be between 0 and 1440",
    };
  }
  if (s < 0 || s > 59) {
    return {
      valid: false,
      durationMs: 0,
      minutes: m,
      seconds: s,
      reason: "Seconds must be between 0 and 59",
    };
  }
  if (m === 0 && s === 0) {
    return {
      valid: false,
      durationMs: 0,
      minutes: 0,
      seconds: 0,
      reason: "0:0 cannot start",
    };
  }

  const durationMs = (m * 60 + s) * 1000;
  if (durationMs > 1440 * 60 * 1000) {
    return {
      valid: false,
      durationMs: 0,
      minutes: m,
      seconds: s,
      reason: "Duration exceeds 24 hours",
    };
  }

  return { valid: true, durationMs, minutes: m, seconds: s };
}

export interface PomodoroValidationResult {
  valid: boolean;
  workMs: number;
  breakMs: number;
  reason?: string;
}

/**
 * Validates separate Pomodoro work (min, sec) and break (min, sec) inputs.
 * Minutes 0..1440, Seconds 0..59.
 * 0:0 cannot start for either phase.
 */
export function parseAndValidatePomodoro(
  workMin: string | number | null | undefined,
  workSec: string | number | null | undefined,
  breakMin: string | number | null | undefined,
  breakSec: string | number | null | undefined
): PomodoroValidationResult {
  const wmRaw =
    workMin === null || workMin === undefined || String(workMin).trim() === ""
      ? 0
      : Number(workMin);
  const wsRaw =
    workSec === null || workSec === undefined || String(workSec).trim() === ""
      ? 0
      : Number(workSec);
  const bmRaw =
    breakMin === null || breakMin === undefined || String(breakMin).trim() === ""
      ? 0
      : Number(breakMin);
  const bsRaw =
    breakSec === null || breakSec === undefined || String(breakSec).trim() === ""
      ? 0
      : Number(breakSec);

  if (
    ![wmRaw, wsRaw, bmRaw, bsRaw].every(
      (v) => Number.isFinite(v) && !Number.isNaN(v)
    )
  ) {
    return {
      valid: false,
      workMs: 0,
      breakMs: 0,
      reason: "Work and break times must be finite numbers",
    };
  }

  const wm = Math.floor(wmRaw);
  const ws = Math.floor(wsRaw);
  const bm = Math.floor(bmRaw);
  const bs = Math.floor(bsRaw);

  if (wm < 0 || wm > 1440 || bm < 0 || bm > 1440) {
    return {
      valid: false,
      workMs: 0,
      breakMs: 0,
      reason: "Minutes must be between 0 and 1440",
    };
  }
  if (ws < 0 || ws > 59 || bs < 0 || bs > 59) {
    return {
      valid: false,
      workMs: 0,
      breakMs: 0,
      reason: "Seconds must be between 0 and 59",
    };
  }

  const workMs = (wm * 60 + ws) * 1000;
  const breakMs = (bm * 60 + bs) * 1000;

  if (workMs === 0) {
    return {
      valid: false,
      workMs: 0,
      breakMs: 0,
      reason: "Work interval 0:0 cannot start",
    };
  }
  if (breakMs === 0) {
    return {
      valid: false,
      workMs: 0,
      breakMs: 0,
      reason: "Break interval 0:0 cannot start",
    };
  }

  return { valid: true, workMs, breakMs };
}

// ============================================================================
// 2. CLIPBOARD NORMALIZATION & PRIVACY
// ============================================================================

export const MAX_CLIPBOARD_HISTORY_ENTRIES = 30;

export interface NormalizedClipboardItem {
  id: string;
  contentType: "text" | "image" | "file_list" | "unknown";
  preview: string;
  rawContent: string | null;
  isSensitive: boolean;
  sizeBytes: number;
  copiedAt: number;
  timeAgo: string;
  iconName: "clipboard" | "file-text" | "file-image" | "files";
}

/**
 * Maps raw clipboard content type to normalized category and icon.
 */
export function mapClipboardType(typeStr: string | null | undefined): {
  type: "text" | "image" | "file_list" | "unknown";
  iconName: "clipboard" | "file-text" | "file-image" | "files";
} {
  const t = (typeStr ?? "").toLowerCase().trim();
  if (t === "text" || t.startsWith("text/")) {
    return { type: "text", iconName: "file-text" };
  }
  if (t === "image" || t.startsWith("image/")) {
    return { type: "image", iconName: "file-image" };
  }
  if (t === "file_list" || t === "files") {
    return { type: "file_list", iconName: "files" };
  }
  return { type: "unknown", iconName: "clipboard" };
}

/**
 * Generates relative time string (e.g. "Just now", "2m ago", "1h ago").
 */
export function formatTimeAgo(timestampMs: number, nowMs: number = Date.now()): string {
  if (typeof timestampMs !== "number" || isNaN(timestampMs) || timestampMs <= 0) {
    return "Recent";
  }
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m ago";
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return diffHours + "h ago";
  const diffDays = Math.floor(diffHours / 24);
  return diffDays + "d ago";
}

/**
 * Normalizes and sanitizes a raw ClipboardEntry.
 * Masks sensitive content preview with bullets if flagged as possible_sensitive.
 */
export function normalizeClipboardEntry(
  entry: ClipboardEntry,
  nowMs: number = Date.now()
): NormalizedClipboardItem {
  const { type, iconName } = mapClipboardType(entry.content_type);
  const isSensitive = Boolean(entry.possible_sensitive);

  let previewText = (entry.preview ?? "").trim();
  if (isSensitive) {
    previewText = "•••••••••••••••• (Sensitive)";
  } else if (!previewText && entry.content) {
    previewText = entry.content.slice(0, 100).trim();
  }

  return {
    id: entry.id,
    contentType: type,
    preview: previewText || "Empty clipboard content",
    rawContent: entry.content ?? null,
    isSensitive,
    sizeBytes: Math.max(0, entry.size_bytes || 0),
    copiedAt: entry.created_at || 0,
    timeAgo: formatTimeAgo(entry.created_at, nowMs),
    iconName,
  };
}

/**
 * Bounds the clipboard list to maximum allowed items (FIFO).
 */
export function boundClipboardEntries(
  entries: ClipboardEntry[] | null | undefined,
  maxLimit: number = MAX_CLIPBOARD_HISTORY_ENTRIES
): ClipboardEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const limit = Math.max(1, maxLimit);
  return entries.slice(0, limit);
}

// ============================================================================
// 3. DROP SHELF STAGING & FILE METADATA
// ============================================================================

export const MAX_DROP_SHELF_ITEMS = 20;

export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "code"
  | "folder"
  | "generic";

export interface NormalizedStagedFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  category: FileCategory;
  sizeBytes: number;
  formattedSize: string;
  iconName: "files" | "file-text" | "file-image" | "file-audio" | "file-video" | "file-archive" | "file-code";
  isDirectory: boolean;
}

/**
 * Categorizes a file extension into standard categories.
 */
export function classifyFileCategory(
  extension: string | null | undefined,
  kind?: DropTargetKind
): {
  category: FileCategory;
  iconName: "files" | "file-text" | "file-image" | "file-audio" | "file-video" | "file-archive" | "file-code";
} {
  if (kind === "directory") {
    return { category: "folder", iconName: "files" };
  }

  const ext = (extension ?? "").toLowerCase().replace(/^\./, "").trim();

  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext)) {
    return { category: "image", iconName: "file-image" };
  }
  if (["mp4", "mkv", "mov", "avi", "webm", "m4v"].includes(ext)) {
    return { category: "video", iconName: "file-video" };
  }
  if (["mp3", "wav", "flac", "ogg", "m4a", "aac"].includes(ext)) {
    return { category: "audio", iconName: "file-audio" };
  }
  if (["pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"].includes(ext)) {
    return { category: "document", iconName: "file-text" };
  }
  if (["zip", "tar", "gz", "7z", "rar", "bz2", "xz"].includes(ext)) {
    return { category: "archive", iconName: "file-archive" };
  }
  if (["rs", "ts", "tsx", "js", "jsx", "json", "html", "css", "py", "sh", "yaml", "toml", "c", "cpp", "h"].includes(ext)) {
    return { category: "code", iconName: "file-code" };
  }

  return { category: "generic", iconName: "file-text" };
}

/**
 * Formats byte size safely without NaN or infinite values.
 */
export function formatProductivityFileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const size = bytes / Math.pow(1024, i);
  return size.toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

/**
 * Normalizes a DropTarget into a clean UI presentation object.
 */
export function normalizeStagedFile(target: DropTarget): NormalizedStagedFile {
  const isDirectory = target.kind === "directory";
  const ext = target.extension ?? (target.name.includes(".") ? target.name.split(".").pop() ?? "" : "");
  const { category, iconName } = classifyFileCategory(ext, target.kind);

  return {
    id: target.id,
    name: target.name || "Unnamed item",
    path: target.path,
    extension: ext.toUpperCase(),
    category,
    sizeBytes: Math.max(0, target.size || 0),
    formattedSize: isDirectory ? "Folder" : formatProductivityFileSize(target.size),
    iconName,
    isDirectory,
  };
}

/**
 * Deduplicates and bounds staged items strictly to MAX_DROP_SHELF_ITEMS (20).
 * Prevents identical canonical paths from appearing multiple times.
 */
export function boundAndDeduplicateStagedItems(
  items: DropTarget[] | null | undefined,
  maxLimit: number = MAX_DROP_SHELF_ITEMS
): { items: DropTarget[]; wasLimited: boolean } {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], wasLimited: false };
  }

  const seenPaths = new Set<string>();
  const uniqueItems: DropTarget[] = [];

  for (const item of items) {
    const canonical = (item.path || "").trim().toLowerCase();
    if (canonical && !seenPaths.has(canonical)) {
      seenPaths.add(canonical);
      uniqueItems.push(item);
    }
  }

  const limit = Math.max(1, maxLimit);
  const wasLimited = uniqueItems.length > limit;
  return {
    items: uniqueItems.slice(0, limit),
    wasLimited,
  };
}
