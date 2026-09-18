use bbq_core::ClipboardEntry;
use bbq_storage::DatabaseManager;
use std::fs;
use std::path::PathBuf;

fn create_temp_test_dir(name: &str) -> PathBuf {
    let tmp = std::env::temp_dir().join(format!(
        "bbq_test_corruption_{}_{}_{}",
        name,
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("valid system time")
            .as_nanos()
    ));
    fs::create_dir_all(&tmp).expect("create temp test dir");
    tmp
}

#[test]
fn test_healthy_database_opens_without_quarantine() {
    let tmp = create_temp_test_dir("healthy");
    let db_path = tmp.join("bbq.sqlite");

    // Open normally with recovery
    let (db, warning) = DatabaseManager::open_with_recovery(&db_path).expect("open healthy");
    assert!(
        warning.is_none(),
        "Healthy DB open must not produce quarantine warning"
    );
    assert!(db_path.exists(), "DB file must exist on disk");

    // Reopen again - healthy DB must not create quarantine files
    drop(db);
    let (db2, warning2) = DatabaseManager::open_with_recovery(&db_path).expect("reopen healthy");
    assert!(
        warning2.is_none(),
        "Healthy DB reopen must not produce quarantine warning"
    );

    // Check directory contents: only bbq.sqlite and WAL files, zero .bak files
    let entries: Vec<_> = fs::read_dir(&tmp)
        .expect("read_dir healthy")
        .map(|e| {
            e.expect("dir entry")
                .file_name()
                .to_string_lossy()
                .to_string()
        })
        .collect();
    assert!(
        !entries.iter().any(|name| name.ends_with(".bak")),
        "Healthy startup must not create quarantine files"
    );

    drop(db2);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn test_corrupted_database_is_quarantined_and_fresh_db_created() {
    let tmp = create_temp_test_dir("corrupt");
    let db_path = tmp.join("bbq.sqlite");

    // Create a corrupt database file with invalid header and random garbage
    fs::write(
        &db_path,
        b"NOT A VALID SQLITE DATABASE FILE - CORRUPTED HEADER!",
    )
    .expect("write corrupt");

    // Call open_with_recovery
    let (db, warning) =
        DatabaseManager::open_with_recovery(&db_path).expect("open_with_recovery must succeed");

    assert!(
        warning.is_some(),
        "Warning message must be returned when recovery happens"
    );
    let warn_msg = warning.expect("warning message must be present");
    assert!(
        warn_msg.contains("bbq.sqlite.corrupt"),
        "Warning must mention quarantine file name"
    );
    assert!(
        !warn_msg.contains(&tmp.to_string_lossy().to_string()),
        "Must not leak full system directory paths"
    );

    // Original db_path now has a fresh, valid SQLite database
    assert!(
        db_path.exists(),
        "Fresh persistent DB must exist at original path"
    );

    // Verify migrations ran by testing repository operations on the fresh DB
    let repo = db.clipboard_repository();
    assert_eq!(repo.count().expect("count on recovered db"), 0);

    let entry = ClipboardEntry {
        id: "recovered_clip_1".to_string(),
        content_type: bbq_core::ClipboardContentType::Text,
        content: Some("Working after recovery".to_string()),
        preview: "Working".to_string(),
        size_bytes: 22,
        created_at: 12345,
        source: None,
        possible_sensitive: false,
    };
    repo.insert_entry(&entry, 10)
        .expect("insert on recovered db");
    assert_eq!(repo.count().expect("count after insert"), 1);

    // Verify quarantine file exists and contains the corrupted data
    let entries: Vec<_> = fs::read_dir(&tmp)
        .expect("read_dir corrupt")
        .map(|e| {
            e.expect("dir entry")
                .file_name()
                .to_string_lossy()
                .to_string()
        })
        .collect();
    let bak_files: Vec<_> = entries.iter().filter(|n| n.ends_with(".bak")).collect();
    assert_eq!(bak_files.len(), 1, "Exactly one quarantine file must exist");

    let bak_content = fs::read(tmp.join(bak_files[0])).expect("read quarantine");
    assert_eq!(
        bak_content,
        b"NOT A VALID SQLITE DATABASE FILE - CORRUPTED HEADER!"
    );

    drop(db);
    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn test_repeated_corruption_does_not_overwrite_previous_quarantine() {
    let tmp = create_temp_test_dir("repeated");
    let db_path = tmp.join("bbq.sqlite");

    // First corruption
    fs::write(&db_path, b"CORRUPTION #1").expect("write corrupt 1");
    let (db1, warn1) = DatabaseManager::open_with_recovery(&db_path).expect("recovery 1");
    assert!(warn1.is_some());
    drop(db1);

    // Second corruption immediately (may share timestamp milliseconds)
    fs::write(&db_path, b"CORRUPTION #2").expect("write corrupt 2");
    let (db2, warn2) = DatabaseManager::open_with_recovery(&db_path).expect("recovery 2");
    assert!(warn2.is_some());
    drop(db2);

    // Third corruption
    fs::write(&db_path, b"CORRUPTION #3").expect("write corrupt 3");
    let (db3, warn3) = DatabaseManager::open_with_recovery(&db_path).expect("recovery 3");
    assert!(warn3.is_some());
    drop(db3);

    // Verify all 3 quarantine files are preserved with unique filenames
    let entries: Vec<_> = fs::read_dir(&tmp)
        .expect("read_dir repeated")
        .map(|e| {
            e.expect("dir entry")
                .file_name()
                .to_string_lossy()
                .to_string()
        })
        .collect();
    let bak_files: Vec<_> = entries.iter().filter(|n| n.ends_with(".bak")).collect();
    assert_eq!(
        bak_files.len(),
        3,
        "All 3 quarantine backup files must exist"
    );

    // Original database path remains valid
    let (db4, warn4) = DatabaseManager::open_with_recovery(&db_path).expect("open healthy");
    assert!(warn4.is_none());
    drop(db4);

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn test_wal_checkpoint_truncate_execution() {
    let tmp = create_temp_test_dir("wal_checkpoint");
    let db_path = tmp.join("bbq.sqlite");

    let db = DatabaseManager::open(&db_path).expect("open db");
    let repo = db.clipboard_repository();

    // Write some entries so WAL has pending pages
    for i in 0..20 {
        let entry = ClipboardEntry {
            id: format!("wal_clip_{}", i),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some(format!("WAL test content {}", i)),
            preview: format!("WAL {}", i),
            size_bytes: 16,
            created_at: 1000 + i,
            source: None,
            possible_sensitive: false,
        };
        repo.insert_entry(&entry, 50).expect("insert");
    }

    // Execute explicit WAL checkpoint(TRUNCATE)
    db.checkpoint_wal().expect("checkpoint_wal must succeed");

    // Idempotent: repeated checkpoint on clean DB must succeed
    db.checkpoint_wal()
        .expect("repeated checkpoint_wal must succeed");

    drop(db);
    let _ = fs::remove_dir_all(&tmp);
}
