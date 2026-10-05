/**
 * BBQ v1.3 - Milestone 7: Quick Launcher Pure Model
 * Pure, deterministic logic and search ranking for the Launcher HUD.
 *
 * Strict Project Invariants:
 * - NO setInterval / setTimeout loops
 * - NO requestAnimationFrame loops
 * - Zero emoji UI
 * - Bounded collections (max 20 search results, 2x2 Quick Actions)
 */

import type { LauncherItem, LauncherAction } from "@bbq/types";
import type { IconName } from "../common/Icon.tsx";

export const MAX_LAUNCHER_VISIBLE_ITEMS = 20;
export const QUICK_ACTIONS_LIMIT = 4;

/**
 * Maps a LauncherAction to a native SVG IconName.
 * Strictly avoids emojis.
 */
export function mapActionToIconName(action: LauncherAction | null | undefined): IconName {
  if (!action) return "launcher";

  switch (action.type) {
    case "open_application":
      return "launcher";
    case "open_file":
      return "file-text";
    case "open_folder":
      return "files";
    case "open_url":
      return "globe";
    case "system_action":
      return "power";
    case "bbq_action":
      return "sparkles";
    default:
      return "launcher";
  }
}

/**
 * Resolves a semantically meaningful SVG IconName for a launcher item.
 * Adheres strictly to Apple/macOS minimal iconography:
 * - File managers / directories -> "folder" / "files"
 * - Terminals / command line tools -> "terminal"
 * - System settings / preferences -> "settings"
 * - Application launcher grid -> "launcher"
 * - Clean semantic fallbacks for specific system and BBQ actions
 */
export function resolveLauncherItemIcon(item: LauncherItem | null | undefined): IconName {
  if (!item) return "launcher";

  // 1. Explicit icon set on item
  if (item.icon) {
    const rawIcon = item.icon.toLowerCase();
    switch (rawIcon) {
      case "folder":
      case "terminal":
      case "settings":
      case "files":
      case "file-text":
      case "home":
      case "globe":
      case "power":
      case "lock":
      case "launcher":
      case "clipboard":
      case "timer":
      case "reminders":
      case "media":
      case "stats":
      case "cpu":
      case "monitor":
        return rawIcon as IconName;
    }
  }

  const titleLower = (item.title || "").toLowerCase();
  const idLower = (item.id || "").toLowerCase();
  const subLower = (item.subtitle || "").toLowerCase();

  // 2. Terminal & Shell detection
  if (
    titleLower.includes("terminal") ||
    titleLower.includes("powershell") ||
    titleLower.includes("command prompt") ||
    titleLower.includes("bash") ||
    titleLower.includes("zsh") ||
    titleLower.includes("wezterm") ||
    titleLower.includes("alacritty") ||
    subLower.includes("terminal") ||
    subLower.includes("powershell") ||
    subLower.includes("command prompt") ||
    idLower.includes("terminal") ||
    idLower.includes("cmd") ||
    idLower.includes("powershell")
  ) {
    return "terminal";
  }

  // 3. File Manager / Directory detection
  if (
    titleLower.includes("file manager") ||
    titleLower.includes("files & workspace") ||
    titleLower.includes("downloads") ||
    titleLower.includes("explorer") ||
    titleLower.includes("finder") ||
    titleLower.includes("dosya") ||
    subLower.includes("folder") ||
    subLower.includes("directory") ||
    subLower.includes("explorer") ||
    idLower.includes("files") ||
    idLower.includes("downloads")
  ) {
    return "folder";
  }

  // 4. Home Directory
  if (titleLower.includes("home") || idLower.includes("home")) {
    return "home";
  }

  // 5. Settings / Preferences
  if (
    titleLower.includes("settings") ||
    titleLower.includes("preferences") ||
    titleLower.includes("ayarlar") ||
    idLower.includes("settings")
  ) {
    return "settings";
  }

  // 6. Action-specific semantics
  if (item.action) {
    if (item.action.type === "open_folder") {
      return "folder";
    }
    if (item.action.type === "bbq_action") {
      const act = item.action.payload.action;
      switch (act) {
        case "open_files":
          return "folder";
        case "open_settings":
          return "settings";
        case "open_clipboard":
          return "clipboard";
        case "open_timer":
          return "timer";
        case "open_reminders":
          return "reminders";
        case "open_system":
          return "stats";
        case "open_media":
          return "media";
      }
    }
    if (item.action.type === "system_action") {
      const act = item.action.payload.action;
      switch (act) {
        case "open_settings":
          return "settings";
        case "open_downloads":
        case "open_home":
          return "folder";
        case "lock_screen":
          return "lock";
        case "toggle_mute":
          return "volume-mute";
        case "show_desktop":
          return "monitor";
      }
    }
    return mapActionToIconName(item.action);
  }

  return "launcher";
}

export interface RankedLauncherItem {
  item: LauncherItem;
  score: number;
}

/**
 * Filters and ranks launcher items deterministically.
 * Scoring rules:
 * - Exact title match: 100
 * - Title starts with query: 80
 * - Title contains query (word boundary): 60
 * - Title contains query: 40
 * - Subtitle contains query: 20
 * - Usage count bonus: up to +10
 */
export function filterAndRankLauncherItems(
  items: LauncherItem[] | null | undefined,
  query: string | null | undefined,
  maxResults: number = MAX_LAUNCHER_VISIBLE_ITEMS
): LauncherItem[] {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  const cleanQuery = (query ?? "").trim().toLowerCase();
  if (!cleanQuery) {
    return items.slice(0, maxResults);
  }

  const ranked: RankedLauncherItem[] = [];

  for (const item of items) {
    const title = (item.title ?? "").toLowerCase();
    const subtitle = (item.subtitle ?? "").toLowerCase();

    let score = 0;

    if (title === cleanQuery) {
      score = 100;
    } else if (title.startsWith(cleanQuery)) {
      score = 80;
    } else if (title.includes(" " + cleanQuery)) {
      score = 60;
    } else if (title.includes(cleanQuery)) {
      score = 40;
    } else if (subtitle.includes(cleanQuery)) {
      score = 20;
    }

    if (score > 0) {
      // Add bounded usage count bonus
      const usageBonus = Math.min(10, Math.floor((item.usage_count ?? 0) / 2));
      ranked.push({ item, score: score + usageBonus });
    }
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.item.title.localeCompare(b.item.title);
  });

  return ranked.slice(0, maxResults).map((r) => r.item);
}

/**
 * Derives top quick actions for the 2x2 grid when the search query is blank.
 * Order of preference:
 * 1. User favorites
 * 2. Recent items
 * 3. General top items
 */
export function getTopQuickActions(
  items: LauncherItem[] | null | undefined,
  favorites: LauncherItem[] | null | undefined,
  recent: LauncherItem[] | null | undefined,
  limit: number = QUICK_ACTIONS_LIMIT
): LauncherItem[] {
  const result: LauncherItem[] = [];
  const seenIds = new Set<string>();

  // 1. Add favorites
  if (favorites) {
    for (const f of favorites) {
      if (f && !seenIds.has(f.id)) {
        seenIds.add(f.id);
        result.push(f);
        if (result.length >= limit) return result;
      }
    }
  }

  // 2. Add recent items
  if (recent) {
    for (const r of recent) {
      if (r && !seenIds.has(r.id)) {
        seenIds.add(r.id);
        result.push(r);
        if (result.length >= limit) return result;
      }
    }
  }

  // 3. Add default items
  if (items) {
    for (const item of items) {
      if (item && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        result.push(item);
        if (result.length >= limit) return result;
      }
    }
  }

  return result.slice(0, limit);
}

/**
 * Safely clamps keyboard selection index within valid bounds.
 */
export function clampSelectedIndex(index: number, totalCount: number): number {
  if (totalCount <= 0 || isNaN(totalCount)) return 0;
  if (isNaN(index) || index < 0) return 0;
  return Math.min(index, totalCount - 1);
}
