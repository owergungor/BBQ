/**
 * errorState.ts
 * Centralized, App-Owned Error Handling and Presentation for BBQ Desktop.
 *
 * Requirements:
 * - App-owned visual error presentation matching BBQ design system
 * - Categorized internal error mappings with plain-English user messages
 * - Sensitive info redaction (strips URLs with credentials, file paths, stack traces, tokens)
 * - Safe diagnostic logging without privacy violations
 * - Intelligent deduplication with pruning (prevents cascades without permanent suppression)
 * - Safe recovery action support where applicable
 * - Zero external telemetry, zero polling, zero continuous loops
 */

import { createDomainStore } from "./createStore.ts";

export type ErrorCategory =
  | "settings"
  | "filesystem"
  | "clipboard"
  | "media"
  | "hotkey"
  | "timer"
  | "reminder"
  | "launcher"
  | "system"
  | "general";

export interface AppError {
  id: string;
  fingerprint: string;
  category: ErrorCategory;
  title: string;
  message: string;
  actionRequired: boolean;
  recoveryLabel?: string;
  onRecover?: () => void | Promise<void>;
  timestamp: number;
}

export interface ReportErrorOptions {
  category?: ErrorCategory;
  customTitle?: string;
  customMessage?: string;
  actionRequired?: boolean;
  recoveryLabel?: string;
  onRecover?: () => void | Promise<void>;
}

export interface ErrorStoreState {
  activeError: AppError | null;
}

// In-memory deduplication cache: fingerprint -> timestamp
const deduplicationCache = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 3000;
const MAX_DEDUPLICATION_ENTRIES = 50;

/**
 * Prunes expired or excess cache entries to avoid unbounded memory retention.
 */
function pruneDeduplicationCache(now: number): void {
  for (const [key, ts] of deduplicationCache.entries()) {
    if (now - ts >= DEDUPLICATION_WINDOW_MS) {
      deduplicationCache.delete(key);
    }
  }

  if (deduplicationCache.size > MAX_DEDUPLICATION_ENTRIES) {
    const oldestKey = deduplicationCache.keys().next().value;
    if (oldestKey !== undefined) {
      deduplicationCache.delete(oldestKey);
    }
  }
}

/**
 * Redacts sensitive tokens, credentials, embedded URLs, paths, stack traces, and backend internals.
 */
export function redactSensitiveDetails(text: string): string {
  if (!text) return "";

  return text
    // Redact URLs containing embedded credentials (e.g. https://user:pass@example.com)
    .replace(/(https?|ftp|postgres|sqlite):\/\/[^\s/@:]+:[^\s/@:]+@/gi, "$1://[credentials redacted]@")
    // Redact absolute Windows file paths (C:\... or C:/... or UNC \\server\share\...)
    .replace(/(?<![a-zA-Z])[a-zA-Z]:[\\/][^\s:;,)"']+/g, "[file path]")
    .replace(/\\\\[^\s:;,)"']+[\\/][^\s:;,)"']+/g, "[file path]")
    // Redact Unix/macOS user, system, or temp file paths
    .replace(/\/(?:Users|home|private|tmp|var|usr|etc|root)\/[^\s:;,)"']+/g, "[file path]")
    // Redact stack traces
    .replace(/^\s*at\s+.*$/gm, "")
    // Redact potential bearer tokens, hex hashes, or secret keys
    .replace(/(?:bearer\s+[a-zA-Z0-9_\-\.]+)/gi, "[token redacted]")
    .replace(/(?:key|secret|password|token)[=:]\s*['"]?[^\s,'"]+['"]?/gi, "[credential redacted]")
    // Normalize excessive whitespace
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/**
 * Maps arbitrary runtime / backend failures to safe, understandable user guidance.
 */
export function sanitizeErrorForUser(
  raw: unknown,
  category: ErrorCategory = "general"
): { title: string; message: string; actionRequired: boolean } {
  const rawString =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
      ? raw
      : "Unknown error occurred";

  const lower = rawString.toLowerCase();

  switch (category) {
    case "settings":
      if (lower.includes("lock") || lower.includes("busy")) {
        return {
          title: "Settings Temporarily Busy",
          message: "The preferences database is currently busy. Your existing preferences remain safe.",
          actionRequired: true,
        };
      }
      return {
        title: "Preferences Update Failed",
        message: "Unable to save your settings. Your previous configuration remains active.",
        actionRequired: false,
      };

    case "hotkey":
      if (lower.includes("already") || lower.includes("register") || lower.includes("conflict")) {
        return {
          title: "Shortcut Conflict",
          message: "The selected keyboard shortcut is already reserved by the operating system or another app.",
          actionRequired: true,
        };
      }
      return {
        title: "Shortcut Registration Error",
        message: "Unable to register the requested global shortcut with the system.",
        actionRequired: true,
      };

    case "filesystem":
      if (lower.includes("50mb") || lower.includes("size") || lower.includes("limit")) {
        return {
          title: "File Size Limit Exceeded",
          message: "The selected file exceeds the 50 MB workspace limit.",
          actionRequired: false,
        };
      }
      if (lower.includes("not found") || lower.includes("no such")) {
        return {
          title: "File Not Found",
          message: "The requested file or folder no longer exists at its recorded location.",
          actionRequired: false,
        };
      }
      return {
        title: "File Operation Failed",
        message: "Unable to complete the requested file operation. The file may be in use by another program.",
        actionRequired: false,
      };

    case "clipboard":
      if (lower.includes("permission") || lower.includes("denied") || lower.includes("access")) {
        return {
          title: "Clipboard Access Restricted",
          message: "System clipboard access was denied. Check operating system permissions for BBQ.",
          actionRequired: true,
        };
      }
      return {
        title: "Clipboard Action Failed",
        message: "Unable to access the system clipboard buffer.",
        actionRequired: false,
      };

    case "launcher":
      return {
        title: "Application Launch Failed",
        message: "The selected program could not be started. The application path may have moved.",
        actionRequired: false,
      };

    case "timer":
      return {
        title: "Timer Action Failed",
        message: "The requested timer operation could not be scheduled.",
        actionRequired: false,
      };

    case "reminder":
      if (lower.includes("past") || lower.includes("overdue")) {
        return {
          title: "Invalid Reminder Time",
          message: "Reminders cannot be scheduled for a time that has already passed.",
          actionRequired: true,
        };
      }
      return {
        title: "Reminder Action Failed",
        message: "Unable to schedule or update the reminder.",
        actionRequired: false,
      };

    default:
      return {
        title: "Operation Failed",
        message: "An unexpected condition occurred. The application remains running safely.",
        actionRequired: false,
      };
  }
}

const initialErrorStoreState: ErrorStoreState = {
  activeError: null,
};

export const errorStore = createDomainStore<ErrorStoreState>(initialErrorStoreState);

export const useErrorState = errorStore.useStore;

export function reportAppError(err: unknown, options: ReportErrorOptions = {}): AppError | null {
  const category: ErrorCategory = options.category ?? "general";
  const mapped = sanitizeErrorForUser(err, category);

  const title = options.customTitle ? redactSensitiveDetails(options.customTitle) : mapped.title;
  const message = options.customMessage ? redactSensitiveDetails(options.customMessage) : mapped.message;
  const actionRequired = options.actionRequired ?? mapped.actionRequired;

  // Deduplication key
  const fingerprint = `${category}:${title}`;
  const now = Date.now();
  pruneDeduplicationCache(now);

  const lastSeen = deduplicationCache.get(fingerprint);
  if (lastSeen && now - lastSeen < DEDUPLICATION_WINDOW_MS) {
    // Deduplicated: Ignore repeated cascade
    return null;
  }

  deduplicationCache.set(fingerprint, now);

  // Safe dev diagnostic log without leaking sensitive contents
  if (typeof console !== "undefined" && console.warn) {
    const sanitizedLog = redactSensitiveDetails(
      err instanceof Error ? err.message : String(err)
    );
    console.warn(`[BBQ Error - ${category}] ${title}: ${sanitizedLog}`);
  }

  const appError: AppError = {
    id: `err-${now}-${Math.random().toString(36).substring(2, 7)}`,
    fingerprint,
    category,
    title,
    message,
    actionRequired,
    recoveryLabel: options.recoveryLabel,
    onRecover: options.onRecover,
    timestamp: now,
  };

  errorStore.setState({ activeError: appError });
  return appError;
}

export function dismissAppError(id?: string): void {
  const current = errorStore.getState().activeError;
  if (!current) return;
  if (!id || current.id === id) {
    // Clear deduplication fingerprint on explicit dismissal so a subsequent attempt is not suppressed
    if (current.fingerprint) {
      deduplicationCache.delete(current.fingerprint);
    }
    errorStore.setState({ activeError: null });
  }
}

export function clearAllAppErrors(): void {
  deduplicationCache.clear();
  errorStore.setState({ activeError: null });
}
