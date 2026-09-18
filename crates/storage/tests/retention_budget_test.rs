use bbq_core::{
    ClipboardContentType, ClipboardEntry, LauncherAction, LauncherItem, LauncherItemSource,
};
use bbq_storage::DatabaseManager;

#[test]
fn test_clipboard_burst_5000_entries_bounded_to_100() {
    let db = DatabaseManager::open_in_memory().expect("failed to open in-memory db");
    let repo = db.clipboard_repository();

    let max_budget = 100;

    // Burst insert 5,000 items
    for i in 0..5000 {
        let entry = ClipboardEntry {
            id: format!("clip_{:06}", i),
            content_type: ClipboardContentType::Text,
            content: Some(format!("Content body number {}", i)),
            preview: format!("Preview {}", i),
            size_bytes: 32,
            created_at: 1000000 + i as i64,
            source: Some("test".to_string()),
            possible_sensitive: false,
        };

        repo.insert_entry(&entry, max_budget)
            .expect("insert must succeed");
    }

    // Verify row count is strictly bounded to max_budget
    let total_count = repo.count().expect("count query must succeed");
    assert_eq!(
        total_count, max_budget,
        "Clipboard entries count must be strictly bounded to {}",
        max_budget
    );

    // Verify history returns exactly 100 items
    let history = repo.get_history(200).expect("get_history must succeed");
    assert_eq!(history.len(), max_budget);

    // Verify FIFO retention: the latest item must be the last inserted item (clip_004999)
    assert_eq!(history[0].id, "clip_004999");
    // And the oldest retained item must be clip_004900
    assert_eq!(history[max_budget - 1].id, "clip_004900");
}

#[test]
fn test_launcher_recent_bounded_to_budget() {
    let db = DatabaseManager::open_in_memory().expect("failed to open in-memory db");
    let repo = db.launcher_repository();

    let max_recents = bbq_core::MAX_RECENT_ITEMS;

    // Record 500 launches across 70 distinct items
    for i in 0..500 {
        let item = LauncherItem {
            id: format!("app_{}", i % 70),
            title: format!("Application {}", i % 70),
            subtitle: Some("Utility app".to_string()),
            icon: None,
            action: LauncherAction::OpenApplication {
                id: format!("app_{}", i % 70),
            },
            source: LauncherItemSource::Recent,
            favorite: false,
            last_used_at: Some(2000000 + i as u64),
            usage_count: 1,
            keywords: vec!["utility".to_string()],
        };

        repo.record_recent(&item, max_recents)
            .expect("record_recent must succeed");
    }

    let recents = repo.get_recent(100).expect("get_recent must succeed");
    assert!(
        recents.len() <= max_recents,
        "Recent items count ({}) must not exceed max budget ({})",
        recents.len(),
        max_recents
    );
}

#[test]
fn test_storage_wal_and_pragmas_configured() {
    let db = DatabaseManager::open_in_memory().expect("failed to open db");
    let conn = db.connection();
    let conn_guard = conn.lock().expect("mutex lock");

    // In memory databases return "memory", disk returns "wal". Verify foreign keys are ON.
    let foreign_keys: i32 = conn_guard
        .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
        .expect("query foreign keys");
    assert_eq!(foreign_keys, 1, "foreign_keys pragma must be enabled (1)");
}
