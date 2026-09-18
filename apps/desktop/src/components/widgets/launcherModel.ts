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
