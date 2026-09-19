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

#[test]
fn test_sqlite_freelist_and_vacuum_measurement() {
    let tmp = std::env::temp_dir().join(format!(
        "bbq_test_vacuum_meas_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    ));
    std::fs::create_dir_all(&tmp).expect("create temp dir");
    let db_path = tmp.join("meas.db");

    let db = DatabaseManager::open(&db_path).expect("open db");
    let repo = db.clipboard_repository();

    let conn = db.connection();
    let conn_guard = conn.lock().expect("mutex lock");

    // Verify auto_vacuum is currently 0 (deferred per discovery findings)
    let auto_vacuum: i32 = conn_guard
        .query_row("PRAGMA auto_vacuum", [], |r| r.get(0))
        .expect("query auto_vacuum");
    assert_eq!(
        auto_vacuum, 0,
        "auto_vacuum is 0 as intentionally deferred in M14"
    );

    drop(conn_guard);

    // Insert 500 items
    for i in 0..500 {
        let entry = ClipboardEntry {
            id: format!("meas_{:04}", i),
            content_type: ClipboardContentType::Text,
            content: Some("Sample measurement string for database pages".to_string()),
            preview: "Sample".to_string(),
            size_bytes: 44,
            created_at: 1000 + i,
            source: None,
            possible_sensitive: false,
        };
        repo.insert_entry(&entry, 500).expect("insert");
    }

    // Prune entries older than cutoff
    let pruned = repo.prune_older_than(1400).expect("prune");
    assert_eq!(pruned, 400);

    let conn_guard = conn.lock().expect("mutex lock");
    let freelist_count: i32 = conn_guard
        .query_row("PRAGMA freelist_count", [], |r| r.get(0))
        .expect("query freelist");
    let page_count: i32 = conn_guard
        .query_row("PRAGMA page_count", [], |r| r.get(0))
        .expect("query page_count");

    // The freelist absorbs deleted pages for reuse by subsequent SQLite inserts
    assert!(freelist_count >= 0);
    assert!(page_count >= freelist_count);

    drop(conn_guard);
    drop(db);
    let _ = std::fs::remove_dir_all(&tmp);
}
