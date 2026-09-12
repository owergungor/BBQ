import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LauncherItem } from "@bbq/types";
import {
  normalizeQuery,
  isFuzzySubsequence,
  calculateUsageBonus,
  calculateRecencyBonus,
  scoreItem,
  searchLauncherItems,
  getEmptyQuerySuggestions,
  MAX_QUERY_LENGTH,
  MAX_QUERY_TOKENS,
  MAX_SEARCH_RESULTS,
} from "../src/utils/launcherSearch.ts";

function createItem(
  id: string,
  title: string,
  subtitle: string | null = null,
  keywords: string[] = [],
  usage_count: number = 0,
  last_used_at: number | null = null,
  favorite: boolean = false
): LauncherItem {
  return {
    id,
    title,
    subtitle,
    icon: null,
    action: { type: "open_application", payload: { id } },
    source: "built_in",
    favorite,
    last_used_at,
    usage_count,
    keywords,
  };
}

describe("Smart Search - Normalization & Tokenization", () => {
  it("normalizes whitespace, lowercases, and trims queries", () => {
    const { normalized, tokens } = normalizeQuery("   Open   Timer   ");
    assert.equal(normalized, "open timer");
    assert.deepEqual(tokens, ["open", "timer"]);
  });

  it("handles empty and whitespace-only queries", () => {
    const empty = normalizeQuery("");
    assert.equal(empty.normalized, "");
    assert.deepEqual(empty.tokens, []);

    const spaces = normalizeQuery("     ");
    assert.equal(spaces.normalized, "");
    assert.deepEqual(spaces.tokens, []);
  });

  it("enforces MAX_QUERY_LENGTH = 128", () => {
    const long = "a".repeat(200);
    const { normalized } = normalizeQuery(long);
    assert.equal(normalized.length, MAX_QUERY_LENGTH);
  });

  it("enforces MAX_QUERY_TOKENS = 16", () => {
    const manyTokens = Array.from({ length: 30 }, (_, i) => `token${i}`).join(" ");
    const { tokens } = normalizeQuery(manyTokens);
    assert.equal(tokens.length, MAX_QUERY_TOKENS);
  });
});

describe("Smart Search - Fuzzy Subsequence", () => {
  it("matches sequential characters in correct order", () => {
    assert.equal(isFuzzySubsequence("tmr", "timer"), true);
    assert.equal(isFuzzySubsequence("clp", "clipboard"), true);
    assert.equal(isFuzzySubsequence("rmd", "reminders"), true);
  });

  it("rejects characters out of order or missing", () => {
    assert.equal(isFuzzySubsequence("rmt", "timer"), false);
    assert.equal(isFuzzySubsequence("xyz", "timer"), false);
  });
});

describe("Smart Search - Bounded Usage & Recency Bonuses", () => {
  it("bounds usage bonus to at most 100", () => {
    assert.equal(calculateUsageBonus(0), 0);
    assert.equal(calculateUsageBonus(1), 10);
    assert.equal(calculateUsageBonus(100), 100);
    assert.equal(calculateUsageBonus(10_000), 100);
    assert.equal(calculateUsageBonus(1_000_000), 100);
  });

  it("bounds recency bonus to at most 50 and decays within 24h", () => {
    const now = 1_000_000_000;
    assert.equal(calculateRecencyBonus(null, now), 0);
    assert.equal(calculateRecencyBonus(now, now), 50);

    // 12 hours ago (43200s) -> ~25
    const twelveHoursAgo = now - 43200 * 1000;
    const bonus12h = calculateRecencyBonus(twelveHoursAgo, now);
    assert.ok(bonus12h >= 24 && bonus12h <= 26);

    // 25 hours ago -> 0
    const olderThanOneDay = now - 90000 * 1000;
    assert.equal(calculateRecencyBonus(olderThanOneDay, now), 0);
  });
});

describe("Smart Search - Ranking Hierarchy Invariant", () => {
  const now = 1_000_000_000;

  it("ranks Exact > Prefix > Token > Keyword > Fuzzy > Subtitle", () => {
    const exact = createItem("1", "Timer");
    const prefix = createItem("2", "Timer Settings");
    const token = createItem("3", "Quick Timer Widget");
    const keyword = createItem("4", "Countdown Clock", null, ["timer"]);
    const fuzzy = createItem("5", "Trimeter Tool");
    const subtitle = createItem("6", "Stopwatch", "A simple timer tool");

    const items = [subtitle, fuzzy, keyword, token, prefix, exact];
    const results = searchLauncherItems("timer", items, new Set(), new Set(), now);

    assert.equal(results[0].id, "1", "Exact title should be 1st");
    assert.equal(results[1].id, "2", "Title prefix should be 2nd");
    assert.equal(results[2].id, "3", "Token match should be 3rd");
    assert.equal(results[3].id, "4", "Keyword match should be 4th");
    assert.equal(results[4].id, "5", "Fuzzy title match should be 5th");
    assert.equal(results[5].id, "6", "Subtitle match should be 6th");
  });

  it("guarantees bad fuzzy + huge usage NEVER overtakes exact or prefix match", () => {
    // Bad fuzzy with 1,000,000 uses and recent bonus
    const fuzzyHighUsage = createItem("fuzzy", "Task Optimizer", null, [], 1_000_000, now);
    // Exact match with zero usage
    const exactZeroUsage = createItem("exact", "Timer", null, [], 0, null);

    const items = [fuzzyHighUsage, exactZeroUsage];
    const results = searchLauncherItems("timer", items, new Set(), new Set(), now);

    assert.equal(results[0].id, "exact", "Exact match must rank above fuzzy despite huge usage");
  });
});

describe("Smart Search - Context Boosts, Deduplication & Suggestions", () => {
  const now = 1_000_000_000;

  it("applies favorite and recent boosts when base match is identical", () => {
    const itemNormal = createItem("1", "Terminal One", "Open terminal 1");
    const itemFav = createItem("2", "Terminal Two", "Open terminal 2");

    const results = searchLauncherItems("terminal", [itemNormal, itemFav], new Set(["2"]), new Set(), now);
    assert.equal(results[0].id, "2", "Favorite item should rank first due to boost");
  });

  it("deduplicates candidate items by id", () => {
    const itemA1 = createItem("dup-1", "Timer");
    const itemA2 = createItem("dup-1", "Timer");

    const results = searchLauncherItems("timer", [itemA1, itemA2], new Set(), new Set(), now);
    assert.equal(results.length, 1);
  });

  it("bounds search results to at most 20 items", () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      createItem(`item-${i}`, `Action ${i}`)
    );

    const results = searchLauncherItems("action", items, new Set(), new Set(), now);
    assert.equal(results.length, MAX_SEARCH_RESULTS);
  });

  it("ranks empty-query suggestions: Favorites > Recent > BuiltIns", () => {
    const favItem = createItem("fav", "Favorite App", null, [], 10, null, true);
    const recItem = createItem("rec", "Recent App", null, [], 2, now - 1000);
    const builtInItem = createItem("sys", "System Settings", null, [], 1);
    const defaultItem = createItem("def", "Default Action", null, [], 0);

    const items = [defaultItem, builtInItem, recItem, favItem];
    const suggestions = getEmptyQuerySuggestions(items, new Set(["fav"]), new Set(["rec"]));

    assert.equal(suggestions[0].id, "fav");
    assert.equal(suggestions[1].id, "rec");
    assert.equal(suggestions[2].id, "sys");
    assert.equal(suggestions[3].id, "def");
  });

  it("handles Turkish and Unicode characters properly", () => {
    const settingsItem = createItem("ayarlar", "Ayarlar", "Sistem yapılandırması", ["seçenekler", "tercihler"]);
    const results = searchLauncherItems("ayar", [settingsItem], new Set(), new Set(), now);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "ayarlar");
  });
});
