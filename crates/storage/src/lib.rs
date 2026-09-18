#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

pub mod migrations;
pub mod repository;

use bbq_core::{BbqError, BbqResult};
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub use migrations::run_migrations;
pub use repository::{
    ClipboardRepository, FileRepository, LauncherRepository, ReminderRepository,
    SettingsRepository, SqliteClipboardRepository, SqliteFileRepository, SqliteLauncherRepository,
    SqliteReminderRepository, SqliteSettingsRepository,
};

/// Central thread-safe manager for the BBQ SQLite database
#[derive(Clone)]
pub struct DatabaseManager {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for DatabaseManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DatabaseManager").finish()
    }
}

impl DatabaseManager {
    /// Open or create SQLite database on disk and apply migrations
    pub fn open<P: AsRef<Path>>(path: P) -> BbqResult<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                BbqError::Io(format!(
                    "Failed to create database directory {}: {}",
                    parent.display(),
                    e
                ))
            })?;
        }

        let mut conn = Connection::open(path).map_err(|e| {
            BbqError::Storage(format!(
                "Failed to open SQLite database at {}: {}",
                path.display(),
                e
            ))
        })?;

        // Enable WAL mode and foreign keys for performance and data safety
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -512;
            PRAGMA temp_store = MEMORY;
            PRAGMA mmap_size = 0;
            "#,
        )
        .map_err(|e| BbqError::Storage(format!("Failed to configure SQLite pragmas: {}", e)))?;

        run_migrations(&mut conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Open or create SQLite database on disk, applying migrations.
    /// If opening or migration fails due to database corruption, quarantines the damaged
    /// file as `bbq.sqlite.corrupt.<timestamp>.bak` and initializes a fresh database on disk.
    /// Returns the database manager and an optional quarantine warning info.
    pub fn open_with_recovery<P: AsRef<Path>>(path: P) -> BbqResult<(Self, Option<String>)> {
        let path = path.as_ref();
        match Self::open(path) {
            Ok(db) => Ok((db, None)),
            Err(orig_err) => {
                tracing::warn!(
                    "Failed to open SQLite database at {}: {}. Attempting corruption quarantine and recovery.",
                    path.display(),
                    orig_err
                );

                if !path.exists() {
                    return Err(orig_err);
                }

                let parent = path.parent().unwrap_or_else(|| Path::new("."));
                let base_timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();

                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("bbq.sqlite");

                let mut counter: u32 = 0;
                let (quarantine_name, quarantine_path) = loop {
                    let name = if counter == 0 {
                        format!("{}.corrupt.{}.bak", file_name, base_timestamp)
                    } else {
                        format!("{}.corrupt.{}_{}.bak", file_name, base_timestamp, counter)
                    };
                    let candidate = parent.join(&name);
                    if !candidate.exists() {
                        break (name, candidate);
                    }
                    counter += 1;
                };

                // Safely rename / quarantine the damaged file
                std::fs::rename(path, &quarantine_path).map_err(|e| {
                    BbqError::Storage(format!(
                        "Database corruption detected, but failed to quarantine damaged file to {}: {}",
                        quarantine_path.display(),
                        e
                    ))
                })?;

                // Also quarantine any associated WAL / SHM files if they exist
                let wal_path = format!("{}-wal", path.to_string_lossy());
                let wal = Path::new(&wal_path);
                if wal.exists() {
                    let _ = std::fs::rename(wal, parent.join(format!("{}.wal", quarantine_name)));
                }
                let shm_path = format!("{}-shm", path.to_string_lossy());
                let shm = Path::new(&shm_path);
                if shm.exists() {
                    let _ = std::fs::rename(shm, parent.join(format!("{}.shm", quarantine_name)));
                }

                tracing::info!(
                    "Damaged SQLite database quarantined to {}. Initializing clean persistent database.",
                    quarantine_path.display()
                );

                // Now initialize fresh persistent database at original path
                let fresh_db = Self::open(path)?;
                let warning_msg = format!(
                    "Database corruption was detected. Previous database was quarantined as {}.",
                    quarantine_name
                );

                Ok((fresh_db, Some(warning_msg)))
            }
        }
    }

    /// Performs an explicit WAL checkpoint with TRUNCATE to flush WAL pages into main DB on shutdown.
    pub fn checkpoint_wal(&self) -> BbqResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            BbqError::Storage(format!("DB lock error during WAL checkpoint: {}", e))
        })?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| BbqError::Storage(format!("WAL checkpoint failed: {}", e)))?;
        tracing::info!("SQLite WAL checkpoint(TRUNCATE) completed successfully");
        Ok(())
    }

    /// Open an in-memory database for testing
    pub fn open_in_memory() -> BbqResult<Self> {
        let mut conn = Connection::open_in_memory()
            .map_err(|e| BbqError::Storage(format!("Failed to open in-memory SQLite: {}", e)))?;

        run_migrations(&mut conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Get a shared reference to the connection
    pub fn connection(&self) -> Arc<Mutex<Connection>> {
        self.conn.clone()
    }

    /// Create a settings repository backed by this database
    pub fn settings_repository(&self) -> Arc<dyn SettingsRepository> {
        Arc::new(SqliteSettingsRepository::new(self.conn.clone()))
    }

    /// Create a clipboard repository backed by this database
    pub fn clipboard_repository(&self) -> Arc<dyn ClipboardRepository> {
        Arc::new(SqliteClipboardRepository::new(self.conn.clone()))
    }

    /// Create a file repository backed by this database
    pub fn file_repository(&self) -> Arc<dyn FileRepository> {
        Arc::new(SqliteFileRepository::new(self.conn.clone()))
    }

    /// Create a reminder repository backed by this database
    pub fn reminder_repository(&self) -> Arc<dyn ReminderRepository> {
        Arc::new(SqliteReminderRepository::new(self.conn.clone()))
    }

    /// Create a launcher repository backed by this database
    pub fn launcher_repository(&self) -> Arc<dyn LauncherRepository> {
        Arc::new(SqliteLauncherRepository::new(self.conn.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_core::{ClipboardContentType, ClipboardEntry};

    #[test]
    fn test_migrations_and_settings_repo() {
        let db = DatabaseManager::open_in_memory().expect("Should initialize in-memory DB");
        let repo = db.settings_repository();

        assert_eq!(repo.get("theme").unwrap(), None);

        repo.set("theme", "dark").unwrap();
        assert_eq!(repo.get("theme").unwrap(), Some("dark".to_string()));

        repo.set("theme", "light").unwrap();
        assert_eq!(repo.get("theme").unwrap(), Some("light".to_string()));

        repo.delete("theme").unwrap();
        assert_eq!(repo.get("theme").unwrap(), None);
    }

    #[test]
    fn test_clipboard_repository_lifecycle() {
        let db = DatabaseManager::open_in_memory().expect("Should initialize in-memory DB");
        let repo = db.clipboard_repository();

        assert_eq!(repo.count().unwrap(), 0);

        let entry1 = ClipboardEntry::new_text("1".to_string(), "First Item", None);
        repo.insert_entry(&entry1, 100).unwrap();
        assert_eq!(repo.count().unwrap(), 1);

        let latest_text = repo.get_latest_text().unwrap();
        assert_eq!(latest_text, Some("First Item".to_string()));

        let history = repo.get_history(10).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, "1");
        assert_eq!(history[0].preview, "First Item");

        // Insert metadata-only entry
        let meta = ClipboardEntry::new_metadata(
            "2".to_string(),
            ClipboardContentType::Image,
            "1920x1080 PNG".to_string(),
            1024,
            None,
        );
        repo.insert_entry(&meta, 100).unwrap();
        assert_eq!(repo.count().unwrap(), 2);

        // Delete single entry
        repo.delete_entry("1").unwrap();
        assert_eq!(repo.count().unwrap(), 1);

        // Clear all
        repo.clear_history().unwrap();
        assert_eq!(repo.count().unwrap(), 0);
    }

    #[test]
    fn test_clipboard_repository_max_entries_fifo() {
        let db = DatabaseManager::open_in_memory().expect("Should initialize in-memory DB");
        let repo = db.clipboard_repository();

        for i in 1..=10 {
            let mut entry = ClipboardEntry::new_text(i.to_string(), &format!("Item {}", i), None);
            entry.created_at = i as i64; // ensure monotonic timestamp
            repo.insert_entry(&entry, 5).unwrap();
        }

        assert_eq!(repo.count().unwrap(), 5);
        let history = repo.get_history(10).unwrap();
        assert_eq!(history.len(), 5);
        // Latest should be 10 down to 6
        assert_eq!(history[0].id, "10");
        assert_eq!(history[4].id, "6");
    }

    #[test]
    fn test_file_repository_lifecycle() {
        use bbq_core::FileEntry;
        let db = DatabaseManager::open_in_memory().expect("Should initialize in-memory DB");
        let repo = db.file_repository();

        assert_eq!(repo.count().unwrap(), 0);

        let entry1 = FileEntry::new(
            "f1".to_string(),
            "report.pdf".to_string(),
            "/home/user/report.pdf".to_string(),
            Some("pdf".to_string()),
            Some("application/pdf".to_string()),
            2048,
            Some(1000),
            1001,
            Some("drag_drop".to_string()),
        );

        repo.insert_entry(&entry1, 100).unwrap();
        assert_eq!(repo.count().unwrap(), 1);

        let workspace = repo.get_workspace(10).unwrap();
        assert_eq!(workspace.len(), 1);
        assert_eq!(workspace[0].id, "f1");
        assert_eq!(workspace[0].name, "report.pdf");
        assert_eq!(workspace[0].size_bytes, 2048);
        assert!(!workspace[0].missing);

        // Find by path
        let found = repo.find_by_path("/home/user/report.pdf").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, "f1");

        let missing_path = repo.find_by_path("/no/such/file").unwrap();
        assert!(missing_path.is_none());

        // Update entry (e.g. mark missing)
        let mut updated_entry = entry1.clone();
        updated_entry.missing = true;
        repo.update_entry(&updated_entry).unwrap();

        let workspace_after_update = repo.get_workspace(10).unwrap();
        assert!(workspace_after_update[0].missing);

        // Delete entry
        repo.delete_entry("f1").unwrap();
        assert_eq!(repo.count().unwrap(), 0);

        // Insert multiple and clear
        repo.insert_entry(&entry1, 100).unwrap();
        assert_eq!(repo.count().unwrap(), 1);
        repo.clear_workspace().unwrap();
        assert_eq!(repo.count().unwrap(), 0);
    }

    #[test]
    fn test_file_repository_max_entries_fifo() {
        use bbq_core::FileEntry;
        let db = DatabaseManager::open_in_memory().expect("Should initialize in-memory DB");
        let repo = db.file_repository();

        for i in 1..=10 {
            let entry = FileEntry::new(
                format!("f_{}", i),
                format!("doc_{}.txt", i),
                format!("/files/doc_{}.txt", i),
                Some("txt".to_string()),
                Some("text/plain".to_string()),
                100 * i as u64,
                Some(i as i64),
                i as i64,
                None,
            );
            repo.insert_entry(&entry, 5).unwrap();
        }

        assert_eq!(repo.count().unwrap(), 5);
        let workspace = repo.get_workspace(10).unwrap();
        assert_eq!(workspace.len(), 5);
        // Latest created_at should be 10 down to 6
        assert_eq!(workspace[0].id, "f_10");
        assert_eq!(workspace[4].id, "f_6");
    }

    #[test]
    fn test_reminder_repository_lifecycle() {
        use bbq_core::{Reminder, ReminderState};
        let db = DatabaseManager::open_in_memory().expect("Should initialize in-memory DB");
        let repo = db.reminder_repository();

        assert_eq!(repo.list_all().unwrap().len(), 0);

        let rem1 = Reminder {
            id: "rem_1".to_string(),
            title: "Task 1".to_string(),
            body: Some("Description".to_string()),
            due_at: 100000,
            state: ReminderState::Scheduled,
            created_at: 50000,
        };

        let rem2 = Reminder {
            id: "rem_2".to_string(),
            title: "Task 2".to_string(),
            body: None,
            due_at: 200000,
            state: ReminderState::Scheduled,
            created_at: 50000,
        };

        repo.insert(&rem1).unwrap();
        repo.insert(&rem2).unwrap();

        assert_eq!(repo.list_all().unwrap().len(), 2);
        assert_eq!(repo.list_scheduled().unwrap().len(), 2);

        let fetched = repo.get("rem_1").unwrap().unwrap();
        assert_eq!(fetched.title, "Task 1");
        assert_eq!(fetched.state, ReminderState::Scheduled);

        // Update state to Fired
        repo.update_state("rem_1", ReminderState::Fired).unwrap();
        assert_eq!(
            repo.get("rem_1").unwrap().unwrap().state,
            ReminderState::Fired
        );
        assert_eq!(repo.list_scheduled().unwrap().len(), 1);

        // Clear fired
        repo.clear_fired().unwrap();
        assert_eq!(repo.get("rem_1").unwrap(), None);
        assert_eq!(repo.list_all().unwrap().len(), 1);

        // Delete rem2
        repo.delete("rem_2").unwrap();
        assert_eq!(repo.list_all().unwrap().len(), 0);
    }

    #[test]
    fn test_launcher_repository_lifecycle() {
        use bbq_core::{BbqActionType, LauncherAction, LauncherItem, LauncherItemSource};

        let db = DatabaseManager::open_in_memory().expect("Should initialize in-memory DB");
        let repo = db.launcher_repository();

        assert_eq!(repo.get_recent(50).unwrap().len(), 0);
        assert_eq!(repo.get_favorites(20).unwrap().len(), 0);

        let item1 = LauncherItem::new(
            "timer_item",
            "Open Timer",
            Some("Open timer widget".to_string()),
            Some("timer".to_string()),
            LauncherAction::BbqAction(BbqActionType::OpenTimer),
            LauncherItemSource::BuiltIn,
            false,
        )
        .unwrap();

        let item2 = LauncherItem::new(
            "url_item",
            "Google",
            Some("Search engine".to_string()),
            Some("globe".to_string()),
            LauncherAction::OpenUrl {
                url: "https://google.com".to_string(),
            },
            LauncherItemSource::UserConfigured,
            true,
        )
        .unwrap();

        // Record recent
        repo.record_recent(&item1, 50).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        repo.record_recent(&item2, 50).unwrap();

        let recent = repo.get_recent(50).unwrap();
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].id, "url_item"); // most recent first

        // Update item1 duplicate -> should increase usage_count
        std::thread::sleep(std::time::Duration::from_millis(5));
        repo.record_recent(&item1, 50).unwrap();
        let recent_updated = repo.get_recent(50).unwrap();
        assert_eq!(recent_updated.len(), 2);
        assert_eq!(recent_updated[0].id, "timer_item");
        assert_eq!(recent_updated[0].usage_count, 2);

        // Favorites
        repo.add_favorite(&item2, 20).unwrap();
        let favs = repo.get_favorites(20).unwrap();
        assert_eq!(favs.len(), 1);
        assert_eq!(favs[0].id, "url_item");
        assert!(favs[0].favorite);

        repo.remove_favorite("url_item").unwrap();
        assert_eq!(repo.get_favorites(20).unwrap().len(), 0);

        // Clear recent
        repo.clear_recent().unwrap();
        assert_eq!(repo.get_recent(50).unwrap().len(), 0);
    }
}
