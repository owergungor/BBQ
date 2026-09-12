use bbq_core::search::{rank_launcher_items, SearchContext, SearchQuery};
use bbq_core::LauncherItem;

/// Platform-independent, stateless Smart Search Engine
#[derive(Debug)]
pub struct SearchEngine;

impl SearchEngine {
    /// Ranks candidate launcher items against a search query using deterministic
    /// token, keyword, and fuzzy scoring with bounded context boosts.
    pub fn search(
        query_str: &str,
        candidates: &[LauncherItem],
        now: u64,
        favorite_ids: &[String],
        recent_ids: &[String],
    ) -> Vec<LauncherItem> {
        let query = SearchQuery::new(query_str);
        let context = SearchContext::new(query, now, recent_ids.to_vec(), favorite_ids.to_vec());
        rank_launcher_items(candidates, &context)
    }

    /// Generates context-aware ranked suggestions when query is empty:
    /// 1. Favorites
    /// 2. Recent items
    /// 3. Frequently used built-ins
    /// 4. Default quick actions
    pub fn get_suggestions(
        candidates: &[LauncherItem],
        now: u64,
        favorite_ids: &[String],
        recent_ids: &[String],
    ) -> Vec<LauncherItem> {
        Self::search("", candidates, now, favorite_ids, recent_ids)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_core::{BbqActionType, LauncherAction, LauncherItemSource};

    fn make_item(id: &str, title: &str, keywords: Vec<&str>, usage: u32) -> LauncherItem {
        LauncherItem {
            id: id.to_string(),
            title: title.to_string(),
            subtitle: None,
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
    fn test_search_engine_basic_flow() {
        let items = vec![
            make_item("timer", "Timer", vec!["pomodoro", "countdown"], 5),
            make_item("clip", "Clipboard", vec!["history", "copy"], 1),
            make_item("sys", "System Status", vec!["volume", "battery"], 0),
        ];

        // Search by keyword "pomodoro"
        let res = SearchEngine::search("pomodoro", &items, 100_000, &[], &[]);
        assert_eq!(res.len(), 1);
        assert_eq!(res[0].id, "timer");

        // Search by prefix "clip"
        let res_clip = SearchEngine::search("clip", &items, 100_000, &[], &[]);
        assert_eq!(res_clip.len(), 1);
        assert_eq!(res_clip[0].id, "clip");

        // Empty query gives suggestions
        let suggestions = SearchEngine::get_suggestions(&items, 100_000, &[], &[]);
        assert_eq!(suggestions.len(), 3);
        // timer has highest usage (5), comes first
        assert_eq!(suggestions[0].id, "timer");
    }

    #[test]
    fn test_search_engine_suggestions_priority() {
        let mut item_fav = make_item("fav", "Favorite Tool", vec![], 0);
        item_fav.favorite = true;
        let mut item_rec = make_item("rec", "Recent Tool", vec![], 0);
        item_rec.last_used_at = Some(99_000);
        let item_builtin = make_item("built", "Built-in Tool", vec![], 10);

        let items = vec![item_builtin, item_rec, item_fav];
        let fav_ids = vec!["fav".to_string()];
        let rec_ids = vec!["rec".to_string()];

        let suggestions = SearchEngine::get_suggestions(&items, 100_000, &fav_ids, &rec_ids);
        assert_eq!(
            suggestions[0].id, "fav",
            "Favorites must come first in suggestions"
        );
        assert_eq!(
            suggestions[1].id, "rec",
            "Recent items must come second in suggestions"
        );
        assert_eq!(
            suggestions[2].id, "built",
            "Frequent built-ins must come third"
        );
    }

    #[test]
    fn test_search_engine_bounded_results() {
        let items: Vec<LauncherItem> = (0..50)
            .map(|i| make_item(&format!("item-{}", i), "Generic Action", vec![], 0))
            .collect();

        let res = SearchEngine::search("action", &items, 100_000, &[], &[]);
        assert_eq!(
            res.len(),
            20,
            "Results must be strictly bounded to MAX_SEARCH_RESULTS (20)"
        );
    }
}
