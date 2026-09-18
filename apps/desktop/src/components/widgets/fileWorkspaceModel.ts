/**
 * fileWorkspaceModel.ts
 * Pure, side-effect-free domain functions for BBQ v1.3 Milestone 8 File Workspace Hub.
 */

import type { FileEntry } from "@bbq/types";
import type { IconName } from "../common/Icon.tsx";

export type FileCategory = "all" | "code" | "media" | "document" | "archive" | "other";

export interface WorkspaceStats {
  totalCount: number;
  missingCount: number;
  totalSizeBytes: number;
  formattedTotalSize: string;
}

export interface SequentialExecutionPlan {
  executable: FileEntry[];
  skippedMissing: number;
}

export const MAX_EXECUTION_BATCH_SIZE = 10;
export const MAX_WORKSPACE_ENTRIES = 100;

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "rs",
  "go",
  "py",
  "c",
  "cpp",
  "cc",
  "h",
  "hpp",
  "cs",
  "java",
  "kt",
  "swift",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "json",
  "yaml",
  "yml",
  "toml",
  "sql",
  "sh",
  "bash",
  "ps1",
  "bat",
  "cmd",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "wmv", "m4v"]);

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "md",
  "rtf",
  "csv",
  "tsv",
]);

const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "tgz", "7z", "rar", "bz2", "xz"]);

/**
 * Classifies a file extension into standard category and SVG icon name.
 */
export function classifyWorkspaceFile(extension: string | null | undefined): {
  category: FileCategory;
  iconName: IconName;
} {
  if (!extension || typeof extension !== "string") {
    return { category: "other", iconName: "files" };
  }

  const clean = extension.trim().toLowerCase().replace(/^\./, "");
  if (!clean) {
    return { category: "other", iconName: "files" };
  }

  if (CODE_EXTENSIONS.has(clean)) {
    return { category: "code", iconName: "file-code" };
  }

  if (IMAGE_EXTENSIONS.has(clean)) {
    return { category: "media", iconName: "file-image" };
  }

  if (AUDIO_EXTENSIONS.has(clean)) {
    return { category: "media", iconName: "file-audio" };
  }

  if (VIDEO_EXTENSIONS.has(clean)) {
    return { category: "media", iconName: "file-video" };
  }

  if (DOCUMENT_EXTENSIONS.has(clean)) {
    return { category: "document", iconName: "file-text" };
  }

  if (ARCHIVE_EXTENSIONS.has(clean)) {
    return { category: "archive", iconName: "file-archive" };
  }

  return { category: "other", iconName: "files" };
}

/**
 * Formats byte counts into human-readable strings with safe bounds.
 */
export function formatWorkspaceBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

/**
 * Filters workspace entries by category and search query.
 */
export function filterWorkspaceFiles(
  entries: FileEntry[] | null | undefined,
  category: FileCategory,
  query: string
): FileEntry[] {
  if (!entries || !Array.isArray(entries)) {
    return [];
  }

  const q = query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (!entry) return false;

    // Category filter
    if (category !== "all") {
      const entryCat = classifyWorkspaceFile(entry.extension).category;
      if (entryCat !== category) {
        return false;
      }
    }

    // Query filter (name and path)
    if (q) {
      const matchName = entry.name?.toLowerCase().includes(q);
      const matchPath = entry.path?.toLowerCase().includes(q);
      if (!matchName && !matchPath) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Deterministically sorts workspace entries by date, name, or size.
 */
export function sortWorkspaceFiles(
  entries: FileEntry[] | null | undefined,
  sortBy: "date" | "name" | "size"
): FileEntry[] {
  if (!entries || !Array.isArray(entries)) {
    return [];
  }

  const copy = [...entries];

  copy.sort((a, b) => {
    if (sortBy === "name") {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return a.id.localeCompare(b.id);
    }

    if (sortBy === "size") {
      const diff = (b.size_bytes || 0) - (a.size_bytes || 0);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    }

    // Default "date": newest first
    const timeA = a.created_at || a.modified_at || 0;
    const timeB = b.created_at || b.modified_at || 0;
    const diff = timeB - timeA;
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  return copy;
}

/**
 * Calculates aggregate statistics for workspace entries.
 */
export function calculateWorkspaceStats(
  entries: FileEntry[] | null | undefined
): WorkspaceStats {
  if (!entries || !Array.isArray(entries)) {
    return {
      totalCount: 0,
      missingCount: 0,
      totalSizeBytes: 0,
      formattedTotalSize: "0 B",
    };
  }

  let missingCount = 0;
  let totalSizeBytes = 0;

  for (const entry of entries) {
    if (entry.missing) {
      missingCount++;
    }
    if (typeof entry.size_bytes === "number" && Number.isFinite(entry.size_bytes) && entry.size_bytes > 0) {
      totalSizeBytes += entry.size_bytes;
    }
  }

  return {
    totalCount: entries.length,
    missingCount,
    totalSizeBytes,
    formattedTotalSize: formatWorkspaceBytes(totalSizeBytes),
  };
}

/**
 * Plans a sequential execution batch for Open All actions.
 * Enforces rate-limiting bound (default 10 items max) and skips missing files.
 */
export function planSequentialExecution(
  entries: FileEntry[] | null | undefined,
  maxBatch: number = MAX_EXECUTION_BATCH_SIZE
): SequentialExecutionPlan {
  if (!entries || !Array.isArray(entries)) {
    return { executable: [], skippedMissing: 0 };
  }

  const executable: FileEntry[] = [];
  let skippedMissing = 0;

  for (const entry of entries) {
    if (entry.missing) {
      skippedMissing++;
      continue;
    }

    if (executable.length < maxBatch) {
      executable.push(entry);
    }
  }

  return { executable, skippedMissing };
}
