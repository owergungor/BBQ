use bbq_core::{ClipboardContentType, ClipboardEntry, FileEntry, Reminder, ReminderState};
use bbq_storage::DatabaseManager;
use std::sync::Arc;
use std::thread;

#[test]
fn test_clipboard_transactional_success_and_pruning() {
    let db = DatabaseManager::open_in_memory().expect("open in-memory db");
    let repo = db.clipboard_repository();

    let bound = 5;
    for i in 0..10 {
        let entry = ClipboardEntry {
            id: format!("clip_{}", i),
            content_type: ClipboardContentType::Text,
            content: Some(format!("Test content {}", i)),
            preview: format!("Preview {}", i),
            size_bytes: 64,
            created_at: 1000 + i,
            source: Some("test".to_string()),
            possible_sensitive: false,
        };
        repo.insert_entry(&entry, bound)
            .expect("insert must succeed");
    }

    assert_eq!(repo.count().expect("count"), bound);
    let history = repo.get_history(10).expect("get_history");
    assert_eq!(history.len(), bound);
    assert_eq!(history[0].id, "clip_9");
    assert_eq!(history[bound - 1].id, "clip_5");
}

#[test]
fn test_clipboard_transactional_rollback_on_pruning_failure() {
    let db = DatabaseManager::open_in_memory().expect("open in-memory db");
    let repo = db.clipboard_repository();

    // Insert an initial valid entry
    let initial_entry = ClipboardEntry {
        id: "clip_initial".to_string(),
        content_type: ClipboardContentType::Text,
        content: Some("Initial content".to_string()),
        preview: "Initial".to_string(),
        size_bytes: 16,
        created_at: 100,
        source: None,
        possible_sensitive: false,
    };
    repo.insert_entry(&initial_entry, 10)
        .expect("initial insert succeeds");
    assert_eq!(repo.count().expect("count"), 1);

    // Induce a pruning failure by attaching a BEFORE DELETE trigger
    let raw_conn = db.connection();
    raw_conn
        .lock()
        .expect("lock raw_conn")
        .execute_batch(
            r#"
            CREATE TRIGGER abort_prune_clipboard
            BEFORE DELETE ON clipboard_entries
            BEGIN
                SELECT RAISE(ABORT, 'Simulated pruning failure in transaction test');
            END;
            "#,
        )
        .expect("trigger creation succeeds");

    // Attempt to insert a new entry with max_entries = 1 (which requires pruning)
    let new_entry = ClipboardEntry {
        id: "clip_should_rollback".to_string(),
        content_type: ClipboardContentType::Text,
        content: Some("Should not be committed".to_string()),
        preview: "Rollback me".to_string(),
        size_bytes: 16,
        created_at: 200,
        source: None,
        possible_sensitive: false,
    };

    let result = repo.insert_entry(&new_entry, 1);
    assert!(
        result.is_err(),
        "Insert with failed pruning MUST return error"
    );

    // Verify transactional atomicity: the newly inserted row was NOT committed!
    let history = repo.get_history(10).expect("get_history");
    assert_eq!(history.len(), 1, "Only the initial row must remain");
    assert_eq!(history[0].id, "clip_initial");
    assert_eq!(repo.count().expect("count"), 1);
}

#[test]
fn test_file_transactional_rollback_on_pruning_failure() {
    let db = DatabaseManager::open_in_memory().expect("open in-memory db");
    let repo = db.file_repository();

    let initial = FileEntry {
        id: "file_1".to_string(),
        name: "test1.txt".to_string(),
        path: "/tmp/test1.txt".to_string(),
        extension: Some("txt".to_string()),
        mime_type: Some("text/plain".to_string()),
        size_bytes: 1024,
        modified_at: Some(100),
        created_at: 100,
        source: Some("drop".to_string()),
        missing: false,
    };
    repo.insert_entry(&initial, 10)
        .expect("initial insert succeeds");
    assert_eq!(repo.count().expect("count"), 1);

    // Install trigger to abort delete
    db.connection()
        .lock()
        .expect("lock conn")
        .execute_batch(
            r#"
            CREATE TRIGGER abort_prune_files
            BEFORE DELETE ON file_entries
            BEGIN
                SELECT RAISE(ABORT, 'Simulated file pruning failure');
            END;
            "#,
        )
        .expect("trigger installed");

    let second = FileEntry {
        id: "file_2_rollback".to_string(),
        name: "test2.txt".to_string(),
        path: "/tmp/test2.txt".to_string(),
        extension: Some("txt".to_string()),
        mime_type: Some("text/plain".to_string()),
        size_bytes: 2048,
        modified_at: Some(200),
        created_at: 200,
        source: Some("drop".to_string()),
        missing: false,
    };

    let res = repo.insert_entry(&second, 1);
    assert!(res.is_err(), "Pruning failure must rollback file insert");

    let files = repo.get_workspace(10).expect("get_workspace");
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].id, "file_1");
}

#[test]
fn test_reminder_transactional_rollback_on_pruning_failure() {
    let db = DatabaseManager::open_in_memory().expect("open in-memory db");
    let repo = db.reminder_repository();

    for i in 0..50 {
        let r = Reminder {
            id: format!("rem_{}", i),
            title: format!("Reminder {}", i),
            body: None,
            due_at: 1000 + i,
            state: ReminderState::Scheduled,
            created_at: 100 + i,
        };
        repo.insert(&r).expect("initial reminder insert succeeds");
    }
    assert_eq!(repo.list_all().expect("list_all").len(), 50);

    // Install trigger to abort delete on reminders
    db.connection()
        .lock()
        .expect("lock conn")
        .execute_batch(
            r#"
            CREATE TRIGGER abort_prune_reminders
            BEFORE DELETE ON reminders
            BEGIN
                SELECT RAISE(ABORT, 'Simulated reminder pruning failure');
            END;
            "#,
        )
        .expect("trigger installed");

    // The 51st reminder triggers pruning DELETE of the oldest item, which fires the trigger and aborts
    let rem_new = Reminder {
        id: "rem_50_fail".to_string(),
        title: "Failing Reminder".to_string(),
        body: None,
        due_at: 99999,
        state: ReminderState::Scheduled,
        created_at: 99999,
    };

    let res = repo.insert(&rem_new);
    assert!(
        res.is_err(),
        "Pruning delete failure rolls back entire reminder transaction"
    );

    // Verify exactly 50 remain and rem_50_fail is not present
    let list = repo.list_all().expect("list_all");
    assert_eq!(list.len(), 50);
    assert!(
        !list.iter().any(|r| r.id == "rem_50_fail"),
        "Failed insert must not be partially committed"
    );
}

#[test]
fn test_clipboard_upsert_behavior() {
    let db = DatabaseManager::open_in_memory().expect("open in-memory db");
    let repo = db.clipboard_repository();

    let entry = ClipboardEntry {
        id: "clip_upsert".to_string(),
        content_type: ClipboardContentType::Text,
        content: Some("First version".to_string()),
        preview: "First".to_string(),
        size_bytes: 12,
        created_at: 100,
        source: None,
        possible_sensitive: false,
    };
    repo.insert_entry(&entry, 10).expect("insert succeeds");

    // Update with same ID
    let updated = ClipboardEntry {
        id: "clip_upsert".to_string(),
        content_type: ClipboardContentType::Text,
        content: Some("Updated version".to_string()),
        preview: "Updated".to_string(),
        size_bytes: 15,
        created_at: 200,
        source: Some("browser".to_string()),
        possible_sensitive: true,
    };
    repo.insert_entry(&updated, 10).expect("upsert succeeds");

    assert_eq!(repo.count().expect("count"), 1);
    let history = repo.get_history(5).expect("history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].preview, "Updated");
    assert!(history[0].possible_sensitive);
    assert_eq!(history[0].source.as_deref(), Some("browser"));
}

#[test]
fn test_concurrent_access_serialization() {
    let db = Arc::new(DatabaseManager::open_in_memory().expect("open in-memory db"));
    let mut handles = Vec::new();

    for thread_idx in 0..8 {
        let db_clone = db.clone();
        handles.push(thread::spawn(move || {
            let repo = db_clone.clipboard_repository();
            for i in 0..25 {
                let entry = ClipboardEntry {
                    id: format!("t_{}_{}", thread_idx, i),
                    content_type: ClipboardContentType::Text,
                    content: Some(format!("Content from thread {} iter {}", thread_idx, i)),
                    preview: format!("t{}-{}", thread_idx, i),
                    size_bytes: 20,
                    created_at: (thread_idx * 1000 + i) as i64,
                    source: None,
                    possible_sensitive: false,
                };
                repo.insert_entry(&entry, 50)
                    .expect("concurrent insert succeeds");
            }
        }));
    }

    for h in handles {
        h.join().expect("thread join succeeds");
    }

    let repo = db.clipboard_repository();
    assert_eq!(repo.count().expect("count"), 50);
}

#[test]
fn test_retention_bound_after_restart() {
    let tmp_dir = std::env::temp_dir().join(format!(
        "bbq_test_restart_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("valid system time")
            .as_nanos()
    ));
    let _ = std::fs::create_dir_all(&tmp_dir);
    let db_path = tmp_dir.join("test_restart.sqlite");

    // First session: insert entries bounded to 15
    {
        let db = DatabaseManager::open(&db_path).expect("open first session");
        let repo = db.clipboard_repository();
        for i in 0..40 {
            let entry = ClipboardEntry {
                id: format!("clip_{}", i),
                content_type: ClipboardContentType::Text,
                content: Some(format!("Content {}", i)),
                preview: format!("Preview {}", i),
                size_bytes: 10,
                created_at: 1000 + i,
                source: None,
                possible_sensitive: false,
            };
            repo.insert_entry(&entry, 15)
                .expect("insert in first session");
        }
        assert_eq!(repo.count().expect("count first session"), 15);
        let _ = db.checkpoint_wal();
    }

    // Restart: reopen the database from disk
    {
        let db = DatabaseManager::open(&db_path).expect("open restarted session");
        let repo = db.clipboard_repository();
        assert_eq!(repo.count().expect("count after restart"), 15);
        let history = repo.get_history(20).expect("get_history after restart");
        assert_eq!(history.len(), 15);
        assert_eq!(history[0].id, "clip_39");
        assert_eq!(history[14].id, "clip_25");
    }

    // Clean up
    let _ = std::fs::remove_dir_all(&tmp_dir);
}
