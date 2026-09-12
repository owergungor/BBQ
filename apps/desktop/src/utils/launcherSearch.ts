import type { LauncherItem } from "@bbq/types";

export const MAX_QUERY_LENGTH = 128;
export const MAX_QUERY_TOKENS = 16;
export const MAX_SEARCH_RESULTS = 20;

export type MatchTier = 6 | 5 | 4 | 3 | 2 | 1;
// 6: Exact Title
// 5: Title Prefix
// 4: Token Title
// 3: Keyword
// 2: Fuzzy Title
// 1: Subtitle

export interface ScoredItem {
  item: LauncherItem;
  score: number;
  tier: MatchTier;
}

export function normalizeQuery(raw: string): { normalized: string; tokens: string[] } {
  const bounded = raw.length > MAX_QUERY_LENGTH ? raw.slice(0, MAX_QUERY_LENGTH) : raw;
  const normalized = bounded.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return { normalized: "", tokens: [] };
  }
  const tokens = normalized.split(" ").filter((t) => t.length > 0).slice(0, MAX_QUERY_TOKENS);
  return { normalized, tokens };
}

export function isFuzzySubsequence(query: string, target: string): boolean {
  if (!query) return true;
  const qChars = Array.from(query);
  let qIdx = 0;
  for (const ch of target) {
    if (ch === qChars[qIdx]) {
      qIdx++;
      if (qIdx === qChars.length) return true;
    }
  }
  return false;
}

export function calculateUsageBonus(usageCount: number): number {
  if (usageCount <= 0) return 0;
  const bonus = Math.floor(Math.sqrt(usageCount) * 10);
  return Math.min(100, bonus);
}

export function calculateRecencyBonus(lastUsedAt: number | null, now: number): number {
  if (!lastUsedAt || lastUsedAt <= 0 || lastUsedAt > now) return 0;
  const elapsedSecs = Math.floor((now - lastUsedAt) / 1000);
  const oneDaySecs = 86400;
  if (elapsedSecs >= oneDaySecs) return 0;
  const decay = Math.floor((elapsedSecs * 50) / oneDaySecs);
  return Math.max(0, 50 - decay);
}

export function scoreItem(
  item: LauncherItem,
  normalizedQuery: string,
  tokens: string[],
  now: number,
  isFavorite: boolean,
  isRecent: boolean
): ScoredItem | null {
  const titleLower = item.title.toLowerCase();
  const subtitleLower = item.subtitle ? item.subtitle.toLowerCase() : "";
  const keywords = (item.keywords || []).map((k) => k.toLowerCase());

  let baseScore = 0;
  let tier: MatchTier | null = null;

  // 1. Exact Title (+1000)
  if (titleLower === normalizedQuery) {
    baseScore = 1000;
    tier = 6;
  }
  // 2. Title Prefix (+700)
  else if (titleLower.startsWith(normalizedQuery)) {
    baseScore = 700;
    tier = 5;
  }
  // 3. Token Title (+500)
  else if (
    tokens.length > 0 &&
    tokens.every((token) => titleLower.includes(token))
  ) {
    baseScore = 500;
    tier = 4;
  }
  // 4. Keyword match (+450 exact, +400 prefix)
  else if (
    keywords.some((k) => k === normalizedQuery) ||
    (tokens.length > 0 && tokens.every((t) => keywords.some((k) => k.includes(t))))
  ) {
    baseScore = 450;
    tier = 3;
  } else if (keywords.some((k) => k.startsWith(normalizedQuery))) {
    baseScore = 400;
    tier = 3;
  }
  // 5. Fuzzy Title (+300)
  else if (isFuzzySubsequence(normalizedQuery, titleLower)) {
    baseScore = 300;
    tier = 2;
  }
  // 6. Subtitle match (+200 exact, +150 prefix, +100 token)
  else if (subtitleLower) {
    if (subtitleLower === normalizedQuery) {
      baseScore = 200;
      tier = 1;
    } else if (subtitleLower.startsWith(normalizedQuery)) {
      baseScore = 150;
      tier = 1;
    } else if (tokens.length > 0 && tokens.every((t) => subtitleLower.includes(t))) {
      baseScore = 100;
      tier = 1;
    }
  }

  if (tier === null) {
    return null;
  }

  let totalScore = baseScore;
  if (isFavorite) {
    totalScore += 120;
  }
  if (isRecent) {
    totalScore += 80;
  }
  totalScore += calculateUsageBonus(item.usage_count);
  totalScore += calculateRecencyBonus(item.last_used_at, now);

  return {
    item: {
      ...item,
      favorite: isFavorite,
    },
    score: totalScore,
    tier,
  };
}

export function searchLauncherItems(
  rawQuery: string,
  allItems: LauncherItem[],
  favoriteIds: Set<string>,
  recentIds: Set<string>,
  now: number = Date.now(),
  maxResults: number = MAX_SEARCH_RESULTS
): LauncherItem[] {
  const { normalized, tokens } = normalizeQuery(rawQuery);

  if (!normalized) {
    return getEmptyQuerySuggestions(allItems, favoriteIds, recentIds, maxResults);
  }

  // Deduplicate candidates by ID
  const seenIds = new Set<string>();
  const candidates: LauncherItem[] = [];
  for (const item of allItems) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      candidates.push(item);
    }
  }

  const scoredList: ScoredItem[] = [];
  for (const item of candidates) {
    const isFav = favoriteIds.has(item.id) || item.favorite;
    const isRec = recentIds.has(item.id);
    const scored = scoreItem(item, normalized, tokens, now, isFav, isRec);
    if (scored) {
      scoredList.push(scored);
    }
  }

  // Deterministic sorting
  scoredList.sort((a, b) => {
    // 1. Score DESC
    if (b.score !== a.score) return b.score - a.score;
    // 2. Match Tier DESC
    if (b.tier !== a.tier) return b.tier - a.tier;
    // 3. Favorite DESC
    const favA = a.item.favorite ? 1 : 0;
    const favB = b.item.favorite ? 1 : 0;
    if (favB !== favA) return favB - favA;
    // 4. Usage count DESC
    if (b.item.usage_count !== a.item.usage_count) {
      return b.item.usage_count - a.item.usage_count;
    }
    // 5. Last used at DESC
    const lastA = a.item.last_used_at ?? 0;
    const lastB = b.item.last_used_at ?? 0;
    if (lastB !== lastA) return lastB - lastA;
    // 6. Item ID ASC
    return a.item.id.localeCompare(b.item.id);
  });

  return scoredList.slice(0, maxResults).map((s) => s.item);
}

export function getEmptyQuerySuggestions(
  allItems: LauncherItem[],
  favoriteIds: Set<string>,
  recentIds: Set<string>,
  maxResults: number = MAX_SEARCH_RESULTS
): LauncherItem[] {
  const seen = new Set<string>();
  const results: LauncherItem[] = [];

  const add = (item: LauncherItem, isFav: boolean) => {
    if (!seen.has(item.id) && results.length < maxResults) {
      seen.add(item.id);
      results.push({ ...item, favorite: isFav });
    }
  };

  // 1. Favorites
  const favItems = allItems
    .filter((i) => favoriteIds.has(i.id) || i.favorite)
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  for (const item of favItems) {
    add(item, true);
  }

  // 2. Recent
  const recentItems = allItems
    .filter((i) => recentIds.has(i.id))
    .sort((a, b) => (b.last_used_at || 0) - (a.last_used_at || 0));
  for (const item of recentItems) {
    add(item, favoriteIds.has(item.id) || item.favorite);
  }

  // 3. Frequently used built-ins
  const frequentBuiltIns = allItems
    .filter((i) => i.source === "built_in" && i.usage_count > 0)
    .sort((a, b) => b.usage_count - a.usage_count);
  for (const item of frequentBuiltIns) {
    add(item, favoriteIds.has(item.id) || item.favorite);
  }

  // 4. Default quick actions
  const otherBuiltIns = allItems
    .filter((i) => i.source === "built_in")
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const item of otherBuiltIns) {
    add(item, favoriteIds.has(item.id) || item.favorite);
  }

  // 5. Any remaining items
  for (const item of allItems) {
    add(item, favoriteIds.has(item.id) || item.favorite);
  }

  return results;
}
