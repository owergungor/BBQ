use crate::launcher::{LauncherItem, LauncherItemSource};
use serde::{Deserialize, Serialize};

/// Maximum permitted query string length (characters)
pub const MAX_QUERY_LEN: usize = 128;

/// Maximum number of tokens parsed from a search query
pub const MAX_QUERY_TOKENS: usize = 16;

/// Maximum number of search results returned to frontend/consumers
pub const MAX_SEARCH_RESULTS: usize = 20;

/// Maximum keywords permitted per launcher item
pub const MAX_KEYWORDS: usize = 20;

/// Maximum characters per individual keyword
pub const MAX_KEYWORD_LEN: usize = 64;

/// Base score constants ensuring the strict invariant:
/// Exact > Prefix > Token > Keyword > Fuzzy > Subtitle
pub const SCORE_EXACT_TITLE: i64 = 1000;
pub const SCORE_PREFIX_TITLE: i64 = 700;
pub const SCORE_TOKEN_TITLE: i64 = 500;
pub const SCORE_KEYWORD_MATCH: i64 = 400;
pub const SCORE_FUZZY_TITLE: i64 = 300;
pub const SCORE_EXACT_SUBTITLE: i64 = 200;
pub const SCORE_PREFIX_SUBTITLE: i64 = 150;
pub const SCORE_TOKEN_SUBTITLE: i64 = 120;
pub const SCORE_FUZZY_SUBTITLE: i64 = 100;

/// Contextual bonus constants
pub const BONUS_FAVORITE: i64 = 120;
pub const BONUS_RECENT: i64 = 80;
pub const MAX_USAGE_BONUS: i64 = 100;
pub const MAX_RECENCY_BONUS: i64 = 50;

/// Classification of the match quality tier
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchMatchType {
    BuiltIn = 1,
    Favorite = 2,
    Recent = 3,
    Fuzzy = 4,
    Token = 5,
    Keyword = 6,
    Prefix = 7,
    Exact = 8,
}

/// Identifies which field produced a match
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchMatchedField {
    Title,
    Subtitle,
    Identifier,
    Keyword,
}

/// Normalized search query representation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchQuery {
    pub raw: String,
    pub normalized: String,
    pub tokens: Vec<String>,
}

impl SearchQuery {
    /// Creates and normalizes a SearchQuery.
    /// Clamps input to MAX_QUERY_LEN and limits tokens to MAX_QUERY_TOKENS.
    /// Performs Unicode-safe lowercase conversion and whitespace collapsing.
    pub fn new(raw: &str) -> Self {
        let trimmed = raw.trim();
        // Take at most MAX_QUERY_LEN chars safely across Unicode boundaries
        let bounded_raw: String = trimmed.chars().take(MAX_QUERY_LEN).collect();

        // Normalize lowercase
        let lower = bounded_raw.to_lowercase();

        // Collapse whitespace & split tokens by whitespace and common punctuation
        let mut tokens = Vec::new();
        for segment in lower
            .split(|c: char| c.is_whitespace() || c == '_' || c == '-' || c == '/' || c == '\\')
        {
            let clean = segment.trim();
            if !clean.is_empty() && tokens.len() < MAX_QUERY_TOKENS {
                tokens.push(clean.to_string());
            }
        }

        let normalized = tokens.join(" ");

        Self {
            raw: bounded_raw,
            normalized,
            tokens,
        }
    }

    /// Returns true if the query has no tokens.
    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }
}

/// Scored search result item
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchResult {
    pub item_id: String,
    pub score: i64,
    pub match_type: SearchMatchType,
    pub matched_fields: Vec<SearchMatchedField>,
}

/// Environmental context provided to ranking for deterministic scoring
#[derive(Debug, Clone)]
pub struct SearchContext {
    pub query: SearchQuery,
    pub now: u64,
    pub recent_ids: Vec<String>,
    pub favorite_ids: Vec<String>,
}

impl SearchContext {
    pub fn new(
        query: SearchQuery,
        now: u64,
        recent_ids: Vec<String>,
        favorite_ids: Vec<String>,
    ) -> Self {
        Self {
            query,
            now,
            recent_ids,
            favorite_ids,
        }
    }
}

/// Determines if all characters in needle appear in haystack in sequential order.
pub fn is_fuzzy_subsequence(needle: &str, haystack: &str) -> bool {
    let mut needle_chars = needle.chars();
    let mut current_needle = match needle_chars.next() {
        Some(c) => c,
        None => return true,
    };

    for h in haystack.chars() {
        if h == current_needle {
            match needle_chars.next() {
                Some(next) => current_needle = next,
                None => return true,
            }
        }
    }

    false
}

/// Calculates a bounded usage bonus using a sublinear square root curve.
/// Even for usage_count = 1,000,000, the bonus strictly caps at MAX_USAGE_BONUS (100).
pub fn calculate_usage_bonus(usage_count: u32) -> i64 {
    if usage_count == 0 {
        return 0;
    }
    let scaled = (usage_count as f64).sqrt() * 10.0;
    (scaled as i64).clamp(0, MAX_USAGE_BONUS)
}

/// Calculates a bounded recency bonus for items used within the last 24 hours.
pub fn calculate_recency_bonus(last_used_at: Option<u64>, now: u64) -> i64 {
    match last_used_at {
        Some(ts) if ts <= now => {
            let diff_ms = now - ts;
            const ONE_DAY_MS: u64 = 24 * 60 * 60 * 1000;
            if diff_ms < ONE_DAY_MS {
                let factor = 1.0 - (diff_ms as f64 / ONE_DAY_MS as f64);
                ((factor * MAX_RECENCY_BONUS as f64) as i64).clamp(0, MAX_RECENCY_BONUS)
            } else {
                0
            }
        }
        _ => 0,
    }
}

/// Evaluates and scores an individual LauncherItem against a SearchContext.
/// Returns Some(SearchResult) if candidate matches, or None if no match.
pub fn score_launcher_item(
    query: &SearchQuery,
    item: &LauncherItem,
    context: &SearchContext,
) -> Option<SearchResult> {
    if query.is_empty() {
        return None;
    }

    let q_str = &query.normalized;
    let title_lower = item.title.to_lowercase();
    let subtitle_lower = item.subtitle.as_deref().map(|s| s.to_lowercase());

    let mut base_score = 0i64;
    let mut match_type = SearchMatchType::BuiltIn;
    let mut matched_fields = Vec::new();

    // 1. Exact Title Match
    if title_lower == *q_str {
        base_score = SCORE_EXACT_TITLE;
        match_type = SearchMatchType::Exact;
        matched_fields.push(SearchMatchedField::Title);
    }
    // 2. Title Prefix Match
    else if title_lower.starts_with(q_str) {
        base_score = SCORE_PREFIX_TITLE;
        match_type = SearchMatchType::Prefix;
        matched_fields.push(SearchMatchedField::Title);
    }
    // 3. Title Token Match (all query tokens present in title)
    else if query.tokens.iter().all(|t| title_lower.contains(t)) {
        base_score = SCORE_TOKEN_TITLE;
        match_type = SearchMatchType::Token;
        matched_fields.push(SearchMatchedField::Title);
    }
    // 4. Keyword Match
    else if item.keywords.iter().any(|kw| {
        let kw_lower = kw.to_lowercase();
        kw_lower == *q_str
            || kw_lower.starts_with(q_str)
            || query.tokens.iter().all(|t| kw_lower.contains(t))
    }) {
        base_score = SCORE_KEYWORD_MATCH;
        match_type = SearchMatchType::Keyword;
        matched_fields.push(SearchMatchedField::Keyword);
    }
    // 5. Fuzzy Title Match
    else if is_fuzzy_subsequence(q_str, &title_lower) {
        base_score = SCORE_FUZZY_TITLE;
        match_type = SearchMatchType::Fuzzy;
        matched_fields.push(SearchMatchedField::Title);
    }
    // 6. Subtitle Matches
    else if let Some(ref sub) = subtitle_lower {
        if sub == q_str {
            base_score = SCORE_EXACT_SUBTITLE;
            match_type = SearchMatchType::Exact;
            matched_fields.push(SearchMatchedField::Subtitle);
        } else if sub.starts_with(q_str) {
            base_score = SCORE_PREFIX_SUBTITLE;
            match_type = SearchMatchType::Prefix;
            matched_fields.push(SearchMatchedField::Subtitle);
        } else if query.tokens.iter().all(|t| sub.contains(t)) {
            base_score = SCORE_TOKEN_SUBTITLE;
            match_type = SearchMatchType::Token;
            matched_fields.push(SearchMatchedField::Subtitle);
        }
    }

    if base_score == 0 {
        return None;
    }

    // Contextual boosts
    let is_favorite = item.favorite || context.favorite_ids.contains(&item.id);
    let is_recent =
        item.source == LauncherItemSource::Recent || context.recent_ids.contains(&item.id);

    let mut total_score = base_score;
    if is_favorite {
        total_score += BONUS_FAVORITE;
    }
    if is_recent {
        total_score += BONUS_RECENT;
    }

    total_score += calculate_usage_bonus(item.usage_count);
    total_score += calculate_recency_bonus(item.last_used_at, context.now);

    Some(SearchResult {
        item_id: item.id.clone(),
        score: total_score,
        match_type,
        matched_fields,
    })
}

/// Deterministically ranks a collection of candidate items given a SearchContext.
/// Applies stable tie-breaking and deduplication, returning at most MAX_SEARCH_RESULTS items.
pub fn rank_launcher_items(
    candidates: &[LauncherItem],
    context: &SearchContext,
) -> Vec<LauncherItem> {
    if context.query.is_empty() {
        return rank_empty_query_suggestions(candidates, context);
    }

    // 1. Deduplicate candidates by item.id, keeping highest usage_count / favorite
    let mut unique_map: std::collections::HashMap<String, LauncherItem> =
        std::collections::HashMap::new();
    for item in candidates {
        match unique_map.get_mut(&item.id) {
            Some(existing) => {
                existing.favorite = existing.favorite || item.favorite;
                if item.usage_count > existing.usage_count {
                    existing.usage_count = item.usage_count;
                }
                if item.last_used_at > existing.last_used_at {
                    existing.last_used_at = item.last_used_at;
                }
            }
            None => {
                unique_map.insert(item.id.clone(), item.clone());
            }
        }
    }

    // 2. Score items
    let mut scored: Vec<(LauncherItem, SearchResult)> = Vec::new();
    for item in unique_map.into_values() {
        if let Some(res) = score_launcher_item(&context.query, &item, context) {
            scored.push((item, res));
        }
    }

    // 3. Deterministic Stable Sort
    // Tie-breaker order:
    // 1. score DESC
    // 2. match quality tier DESC
    // 3. favorite DESC
    // 4. usage_count DESC
    // 5. last_used_at DESC
    // 6. item_id ASC
    scored.sort_by(|(item_a, res_a), (item_b, res_b)| {
        res_b
            .score
            .cmp(&res_a.score)
            .then_with(|| res_b.match_type.cmp(&res_a.match_type))
            .then_with(|| item_b.favorite.cmp(&item_a.favorite))
            .then_with(|| item_b.usage_count.cmp(&item_a.usage_count))
            .then_with(|| item_b.last_used_at.cmp(&item_a.last_used_at))
            .then_with(|| item_a.id.cmp(&item_b.id))
    });

    // 4. Bounded top-N results
    scored
        .into_iter()
        .take(MAX_SEARCH_RESULTS)
        .map(|(item, _)| item)
        .collect()
}

/// Generates context-aware deterministic suggestions when the query is empty:
/// 1. Favorites (ordered by usage & recency)
/// 2. Recent items (ordered by last_used_at)
/// 3. Frequently used built-ins (ordered by usage_count)
/// 4. Default built-ins (alphabetical / registration order)
pub fn rank_empty_query_suggestions(
    candidates: &[LauncherItem],
    context: &SearchContext,
) -> Vec<LauncherItem> {
    let mut unique_map: std::collections::HashMap<String, LauncherItem> =
        std::collections::HashMap::new();
    for item in candidates {
        let mut cloned = item.clone();
        if context.favorite_ids.contains(&cloned.id) {
            cloned.favorite = true;
        }
        match unique_map.get_mut(&cloned.id) {
            Some(existing) => {
                existing.favorite = existing.favorite || cloned.favorite;
                if cloned.usage_count > existing.usage_count {
                    existing.usage_count = cloned.usage_count;
                }
                if cloned.last_used_at > existing.last_used_at {
                    existing.last_used_at = cloned.last_used_at;
                }
            }
            None => {
                unique_map.insert(cloned.id.clone(), cloned);
            }
        }
    }

    let mut items: Vec<LauncherItem> = unique_map.into_values().collect();

    items.sort_by(|a, b| {
        let a_fav = a.favorite || context.favorite_ids.contains(&a.id);
        let b_fav = b.favorite || context.favorite_ids.contains(&b.id);

        let a_recent = a.source == LauncherItemSource::Recent || context.recent_ids.contains(&a.id);
        let b_recent = b.source == LauncherItemSource::Recent || context.recent_ids.contains(&b.id);

        // 1. Favorites first
        b_fav
            .cmp(&a_fav)
            // 2. Recent items second
            .then_with(|| b_recent.cmp(&a_recent))
            // 3. Usage count
            .then_with(|| b.usage_count.cmp(&a.usage_count))
            // 4. Last used timestamp
            .then_with(|| b.last_used_at.cmp(&a.last_used_at))
            // 5. Stable tie breaker: item_id ASC
            .then_with(|| a.id.cmp(&b.id))
    });

    items.into_iter().take(MAX_SEARCH_RESULTS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::launcher::{BbqActionType, LauncherAction};

    fn make_test_item(
        id: &str,
        title: &str,
        subtitle: Option<&str>,
        keywords: Vec<&str>,
        usage: u32,
    ) -> LauncherItem {
        LauncherItem {
            id: id.to_string(),
            title: title.to_string(),
            subtitle: subtitle.map(|s| s.to_string()),
            icon: None,
            action: LauncherAction::BbqAction(BbqActionType::OpenTimer),
            source: LauncherItemSource::BuiltIn,
            favorite: false,
            last_used_at: None,
            usage_count: usage,
            keywords: keywords.into_iter().map(|k| k.to_string()).collect(),
        }
    }

    #[test]
    fn test_search_query_normalization_and_truncation() {
        let q = SearchQuery::new("   Open   Timer  /  Pomodoro   ");
        assert_eq!(q.normalized, "open timer pomodoro");
        assert_eq!(q.tokens, vec!["open", "timer", "pomodoro"]);

        // Maximum length truncation
        let long_string = "a".repeat(200);
        let q_long = SearchQuery::new(&long_string);
        assert_eq!(q_long.raw.len(), MAX_QUERY_LEN);

        // Turkish character normalization
        let q_tr = SearchQuery::new("  Ayarlar  ");
        assert_eq!(q_tr.normalized, "ayarlar");
    }

    #[test]
    fn test_tokenization_bounds() {
        let many_tokens = "t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14 t15 t16 t17 t18";
        let q = SearchQuery::new(many_tokens);
        assert_eq!(q.tokens.len(), MAX_QUERY_TOKENS);
    }

    #[test]
    fn test_fuzzy_subsequence() {
        assert!(is_fuzzy_subsequence("tmr", "timer"));
        assert!(is_fuzzy_subsequence("set", "settings"));
        assert!(!is_fuzzy_subsequence("xyz", "timer"));
        assert!(is_fuzzy_subsequence("", "any"));
    }

    #[test]
    fn test_scoring_hierarchy_invariant() {
        let context =
            SearchContext::new(SearchQuery::new("timer"), 100_000, Vec::new(), Vec::new());

        let exact = make_test_item("item-exact", "Timer", None, vec![], 0);
        let prefix = make_test_item("item-prefix", "Timer Settings", None, vec![], 0);
        let token = make_test_item("item-token", "Start Quick Timer", None, vec![], 0);
        let keyword = make_test_item("item-keyword", "Stopwatch", None, vec!["timer"], 0);
        let fuzzy = make_test_item("item-fuzzy", "Total Time Recorder", None, vec![], 0);

        let s_exact = score_launcher_item(&context.query, &exact, &context)
            .unwrap()
            .score;
        let s_prefix = score_launcher_item(&context.query, &prefix, &context)
            .unwrap()
            .score;
        let s_token = score_launcher_item(&context.query, &token, &context)
            .unwrap()
            .score;
        let s_keyword = score_launcher_item(&context.query, &keyword, &context)
            .unwrap()
            .score;
        let s_fuzzy = score_launcher_item(&context.query, &fuzzy, &context)
            .unwrap()
            .score;

        assert!(
            s_exact > s_prefix,
            "Exact ({}) must be > Prefix ({})",
            s_exact,
            s_prefix
        );
        assert!(
            s_prefix > s_token,
            "Prefix ({}) must be > Token ({})",
            s_prefix,
            s_token
        );
        assert!(
            s_token > s_keyword,
            "Token ({}) must be > Keyword ({})",
            s_token,
            s_keyword
        );
        assert!(
            s_keyword > s_fuzzy,
            "Keyword ({}) must be > Fuzzy ({})",
            s_keyword,
            s_fuzzy
        );
    }

    #[test]
    fn test_bad_fuzzy_with_huge_usage_cannot_overtake_exact_match() {
        let context =
            SearchContext::new(SearchQuery::new("timer"), 100_000, Vec::new(), Vec::new());

        // Exact match with 0 usage
        let exact = make_test_item("item-exact", "Timer", None, vec![], 0);
        let s_exact = score_launcher_item(&context.query, &exact, &context)
            .unwrap()
            .score;

        // Fuzzy match with 1,000,000 usage count
        let fuzzy_huge =
            make_test_item("item-fuzzy", "Total Time Recorder", None, vec![], 1_000_000);
        let s_fuzzy = score_launcher_item(&context.query, &fuzzy_huge, &context)
            .unwrap()
            .score;

        // Bounded usage bonus is capped at 100, fuzzy is 300 -> 400 total.
        // Exact is 1000. 1000 > 400!
        assert!(
            s_exact > s_fuzzy,
            "Exact (0 usage: {}) MUST strictly defeat fuzzy (1M usage: {})",
            s_exact,
            s_fuzzy
        );
    }

    #[test]
    fn test_bounded_usage_bonus() {
        assert_eq!(calculate_usage_bonus(0), 0);
        assert_eq!(calculate_usage_bonus(1), 10);
        assert_eq!(calculate_usage_bonus(25), 50);
        assert_eq!(calculate_usage_bonus(100), 100);
        // Any huge number stays bounded at 100
        assert_eq!(calculate_usage_bonus(500), 100);
        assert_eq!(calculate_usage_bonus(1_000_000), 100);
    }

    #[test]
    fn test_deterministic_tie_breaking() {
        let context = SearchContext::new(SearchQuery::new("app"), 100_000, Vec::new(), Vec::new());

        let item_b = make_test_item("app_b", "App", None, vec![], 0);
        let item_a = make_test_item("app_a", "App", None, vec![], 0);

        let ranked = rank_launcher_items(&[item_b, item_a], &context);
        assert_eq!(ranked.len(), 2);
        // By stable tie-breaker item_id ASC: app_a comes before app_b
        assert_eq!(ranked[0].id, "app_a");
        assert_eq!(ranked[1].id, "app_b");
    }

    #[test]
    fn test_empty_query_suggestions_ordering() {
        let context = SearchContext::new(
            SearchQuery::new(""),
            100_000,
            vec!["recent_item".to_string()],
            vec!["fav_item".to_string()],
        );

        let item1 = make_test_item("builtin_item", "Builtin", None, vec![], 5);
        let mut item2 = make_test_item("fav_item", "Favorite", None, vec![], 2);
        item2.favorite = true;
        let mut item3 = make_test_item("recent_item", "Recent", None, vec![], 10);
        item3.source = LauncherItemSource::Recent;

        let suggestions = rank_launcher_items(&[item1, item2, item3], &context);
        assert_eq!(suggestions.len(), 3);
        // Favorite first, Recent second, Builtin third
        assert_eq!(suggestions[0].id, "fav_item");
        assert_eq!(suggestions[1].id, "recent_item");
        assert_eq!(suggestions[2].id, "builtin_item");
    }

    #[test]
    fn test_max_search_results_bound() {
        let context = SearchContext::new(SearchQuery::new("item"), 100_000, Vec::new(), Vec::new());

        let mut items = Vec::new();
        for i in 0..50 {
            items.push(make_test_item(
                &format!("item_{:02}", i),
                &format!("Item {:02}", i),
                None,
                vec![],
                0,
            ));
        }

        let ranked = rank_launcher_items(&items, &context);
        assert_eq!(ranked.len(), MAX_SEARCH_RESULTS);
    }
}
