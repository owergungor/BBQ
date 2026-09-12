use bbq_core::{BbqError, BbqResult};
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

pub trait SettingsRepository: Send + Sync {
    fn get(&self, key: &str) -> BbqResult<Option<String>>;
    fn set(&self, key: &str, value: &str) -> BbqResult<()>;
    fn delete(&self, key: &str) -> BbqResult<()>;
}

pub struct SqliteSettingsRepository {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for SqliteSettingsRepository {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SqliteSettingsRepository").finish()
    }
}

impl SqliteSettingsRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

impl SettingsRepository for SqliteSettingsRepository {
    fn get(&self, key: &str) -> BbqResult<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut rows = stmt
            .query(params![key])
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        if let Some(row) = rows.next().map_err(|e| BbqError::Storage(e.to_string()))? {
            let val: String = row.get(0).map_err(|e| BbqError::Storage(e.to_string()))?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    fn set(&self, key: &str, value: &str) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();

        conn.execute(
            r#"
            INSERT INTO settings (key, value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            "#,
            params![key, value, now],
        )
        .map_err(|e| BbqError::Storage(e.to_string()))?;

        Ok(())
    }

    fn delete(&self, key: &str) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(())
    }
}

pub trait ClipboardRepository: Send + Sync {
    fn get_history(&self, limit: usize) -> BbqResult<Vec<bbq_core::ClipboardEntry>>;
    fn insert_entry(&self, entry: &bbq_core::ClipboardEntry, max_entries: usize) -> BbqResult<()>;
    fn delete_entry(&self, id: &str) -> BbqResult<()>;
    fn clear_history(&self) -> BbqResult<()>;
    fn count(&self) -> BbqResult<usize>;
    fn get_latest_text(&self) -> BbqResult<Option<String>>;
}

pub struct SqliteClipboardRepository {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for SqliteClipboardRepository {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SqliteClipboardRepository").finish()
    }
}

impl SqliteClipboardRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

impl ClipboardRepository for SqliteClipboardRepository {
    fn get_history(&self, limit: usize) -> BbqResult<Vec<bbq_core::ClipboardEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, content_type, content, preview, size_bytes, created_at, source, possible_sensitive
                FROM clipboard_entries
                ORDER BY created_at DESC
                LIMIT ?1
                "#,
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                let ct_str: String = row.get(1)?;
                let possible_sens_int: i32 = row.get(7)?;
                Ok(bbq_core::ClipboardEntry {
                    id: row.get(0)?,
                    content_type: ct_str
                        .parse()
                        .unwrap_or(bbq_core::ClipboardContentType::Unknown),
                    content: row.get(2)?,
                    preview: row.get(3)?,
                    size_bytes: row.get::<_, i64>(4)? as usize,
                    created_at: row.get(5)?,
                    source: row.get(6)?,
                    possible_sensitive: possible_sens_int != 0,
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut entries = Vec::new();
        for r in rows {
            entries.push(r.map_err(|e| BbqError::Storage(e.to_string()))?);
        }
        Ok(entries)
    }

    fn insert_entry(&self, entry: &bbq_core::ClipboardEntry, max_entries: usize) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute(
            r#"
            INSERT INTO clipboard_entries (
                id, content_type, content, preview, size_bytes, created_at, source, possible_sensitive
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                content_type = excluded.content_type,
                content = excluded.content,
                preview = excluded.preview,
                size_bytes = excluded.size_bytes,
                created_at = excluded.created_at,
                source = excluded.source,
                possible_sensitive = excluded.possible_sensitive
            "#,
            params![
                entry.id,
                entry.content_type.to_string(),
                entry.content,
                entry.preview,
                entry.size_bytes as i64,
                entry.created_at,
                entry.source,
                if entry.possible_sensitive { 1 } else { 0 },
            ],
        )
        .map_err(|e| BbqError::Storage(e.to_string()))?;

        if max_entries > 0 {
            conn.execute(
                r#"
                DELETE FROM clipboard_entries
                WHERE id NOT IN (
                    SELECT id FROM clipboard_entries
                    ORDER BY created_at DESC
                    LIMIT ?1
                )
                "#,
                params![max_entries as i64],
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        }

        Ok(())
    }

    fn delete_entry(&self, id: &str) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute("DELETE FROM clipboard_entries WHERE id = ?1", params![id])
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(())
    }

    fn clear_history(&self) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute("DELETE FROM clipboard_entries", [])
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(())
    }

    fn count(&self) -> BbqResult<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM clipboard_entries")
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        let count: i64 = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(count as usize)
    }

    fn get_latest_text(&self) -> BbqResult<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT content FROM clipboard_entries
                WHERE content_type = 'text' AND content IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 1
                "#,
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut rows = stmt
            .query([])
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        if let Some(row) = rows.next().map_err(|e| BbqError::Storage(e.to_string()))? {
            let content: Option<String> =
                row.get(0).map_err(|e| BbqError::Storage(e.to_string()))?;
            Ok(content)
        } else {
            Ok(None)
        }
    }
}

pub trait FileRepository: Send + Sync {
    fn get_workspace(&self, limit: usize) -> BbqResult<Vec<bbq_core::FileEntry>>;
    fn insert_entry(&self, entry: &bbq_core::FileEntry, max_entries: usize) -> BbqResult<()>;
    fn update_entry(&self, entry: &bbq_core::FileEntry) -> BbqResult<()>;
    fn find_by_path(&self, path: &str) -> BbqResult<Option<bbq_core::FileEntry>>;
    fn delete_entry(&self, id: &str) -> BbqResult<()>;
    fn clear_workspace(&self) -> BbqResult<()>;
    fn count(&self) -> BbqResult<usize>;
}

pub struct SqliteFileRepository {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for SqliteFileRepository {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SqliteFileRepository").finish()
    }
}

impl SqliteFileRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

impl FileRepository for SqliteFileRepository {
    fn get_workspace(&self, limit: usize) -> BbqResult<Vec<bbq_core::FileEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, name, path, extension, mime_type, size_bytes, modified_at, created_at, source, missing
                FROM file_entries
                ORDER BY created_at DESC, rowid DESC
                LIMIT ?1
                "#,
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                let missing_int: i32 = row.get(9)?;
                Ok(bbq_core::FileEntry {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    extension: row.get(3)?,
                    mime_type: row.get(4)?,
                    size_bytes: row.get::<_, i64>(5)? as u64,
                    modified_at: row.get(6)?,
                    created_at: row.get(7)?,
                    source: row.get(8)?,
                    missing: missing_int != 0,
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut entries = Vec::new();
        for r in rows {
            entries.push(r.map_err(|e| BbqError::Storage(e.to_string()))?);
        }
        Ok(entries)
    }

    fn insert_entry(&self, entry: &bbq_core::FileEntry, max_entries: usize) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute(
            r#"
            INSERT INTO file_entries (
                id, name, path, extension, mime_type, size_bytes, modified_at, created_at, source, missing
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                path = excluded.path,
                extension = excluded.extension,
                mime_type = excluded.mime_type,
                size_bytes = excluded.size_bytes,
                modified_at = excluded.modified_at,
                created_at = excluded.created_at,
                source = excluded.source,
                missing = excluded.missing
            "#,
            params![
                entry.id,
                entry.name,
                entry.path,
                entry.extension,
                entry.mime_type,
                entry.size_bytes as i64,
                entry.modified_at,
                entry.created_at,
                entry.source,
                if entry.missing { 1 } else { 0 },
            ],
        )
        .map_err(|e| BbqError::Storage(e.to_string()))?;

        if max_entries > 0 {
            conn.execute(
                r#"
                DELETE FROM file_entries
                WHERE id NOT IN (
                    SELECT id FROM file_entries
                    ORDER BY created_at DESC, rowid DESC
                    LIMIT ?1
                )
                "#,
                params![max_entries as i64],
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        }

        Ok(())
    }

    fn update_entry(&self, entry: &bbq_core::FileEntry) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute(
            r#"
            UPDATE file_entries SET
                name = ?2,
                path = ?3,
                extension = ?4,
                mime_type = ?5,
                size_bytes = ?6,
                modified_at = ?7,
                created_at = ?8,
                source = ?9,
                missing = ?10
            WHERE id = ?1
            "#,
            params![
                entry.id,
                entry.name,
                entry.path,
                entry.extension,
                entry.mime_type,
                entry.size_bytes as i64,
                entry.modified_at,
                entry.created_at,
                entry.source,
                if entry.missing { 1 } else { 0 },
            ],
        )
        .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(())
    }

    fn find_by_path(&self, path: &str) -> BbqResult<Option<bbq_core::FileEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, name, path, extension, mime_type, size_bytes, modified_at, created_at, source, missing
                FROM file_entries
                WHERE path = ?1
                LIMIT 1
                "#,
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![path], |row| {
                let missing_int: i32 = row.get(9)?;
                Ok(bbq_core::FileEntry {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    extension: row.get(3)?,
                    mime_type: row.get(4)?,
                    size_bytes: row.get::<_, i64>(5)? as u64,
                    modified_at: row.get(6)?,
                    created_at: row.get(7)?,
                    source: row.get(8)?,
                    missing: missing_int != 0,
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        if let Some(entry) = rows.next() {
            Ok(Some(entry.map_err(|e| BbqError::Storage(e.to_string()))?))
        } else {
            Ok(None)
        }
    }

    fn delete_entry(&self, id: &str) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute("DELETE FROM file_entries WHERE id = ?1", params![id])
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(())
    }

    fn clear_workspace(&self) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        conn.execute("DELETE FROM file_entries", [])
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(())
    }

    fn count(&self) -> BbqResult<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM file_entries")
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        let count: i64 = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| BbqError::Storage(e.to_string()))?;
        Ok(count as usize)
    }
}

use bbq_core::{Reminder, ReminderState};

pub trait ReminderRepository: Send + Sync {
    fn insert(&self, reminder: &Reminder) -> BbqResult<()>;
    fn update_state(&self, id: &str, state: ReminderState) -> BbqResult<()>;
    fn get(&self, id: &str) -> BbqResult<Option<Reminder>>;
    fn list_all(&self) -> BbqResult<Vec<Reminder>>;
    fn list_scheduled(&self) -> BbqResult<Vec<Reminder>>;
    fn delete(&self, id: &str) -> BbqResult<()>;
    fn clear_fired(&self) -> BbqResult<()>;
}

pub struct SqliteReminderRepository {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for SqliteReminderRepository {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SqliteReminderRepository").finish()
    }
}

impl SqliteReminderRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    fn state_to_str(state: ReminderState) -> &'static str {
        match state {
            ReminderState::Scheduled => "Scheduled",
            ReminderState::Fired => "Fired",
            ReminderState::Cancelled => "Cancelled",
        }
    }

    fn str_to_state(s: &str) -> ReminderState {
        match s {
            "Fired" => ReminderState::Fired,
            "Cancelled" => ReminderState::Cancelled,
            _ => ReminderState::Scheduled,
        }
    }
}

impl ReminderRepository for SqliteReminderRepository {
    fn insert(&self, reminder: &Reminder) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        conn.execute(
            r#"
            INSERT INTO reminders (id, title, body, due_at, state, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                reminder.id,
                reminder.title,
                reminder.body,
                reminder.due_at as i64,
                Self::state_to_str(reminder.state),
                reminder.created_at as i64
            ],
        )
        .map_err(|e| BbqError::Storage(format!("Failed to insert reminder: {}", e)))?;

        Ok(())
    }

    fn update_state(&self, id: &str, state: ReminderState) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        conn.execute(
            "UPDATE reminders SET state = ?1 WHERE id = ?2",
            params![Self::state_to_str(state), id],
        )
        .map_err(|e| BbqError::Storage(format!("Failed to update reminder state: {}", e)))?;

        Ok(())
    }

    fn get(&self, id: &str) -> BbqResult<Option<Reminder>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, title, body, due_at, state, created_at FROM reminders WHERE id = ?1",
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let state_str: String = row.get(4)?;
                Ok(Reminder {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    due_at: row.get::<_, i64>(3)? as u64,
                    state: Self::str_to_state(&state_str),
                    created_at: row.get::<_, i64>(5)? as u64,
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        if let Some(res) = rows.next() {
            Ok(Some(res.map_err(|e| BbqError::Storage(e.to_string()))?))
        } else {
            Ok(None)
        }
    }

    fn list_all(&self) -> BbqResult<Vec<Reminder>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        let mut stmt = conn
            .prepare("SELECT id, title, body, due_at, state, created_at FROM reminders ORDER BY due_at ASC")
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let state_str: String = row.get(4)?;
                Ok(Reminder {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    due_at: row.get::<_, i64>(3)? as u64,
                    state: Self::str_to_state(&state_str),
                    created_at: row.get::<_, i64>(5)? as u64,
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut reminders = Vec::new();
        for r in rows {
            reminders.push(r.map_err(|e| BbqError::Storage(e.to_string()))?);
        }
        Ok(reminders)
    }

    fn list_scheduled(&self) -> BbqResult<Vec<Reminder>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        let mut stmt = conn
            .prepare("SELECT id, title, body, due_at, state, created_at FROM reminders WHERE state = 'Scheduled' ORDER BY due_at ASC")
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let state_str: String = row.get(4)?;
                Ok(Reminder {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    due_at: row.get::<_, i64>(3)? as u64,
                    state: Self::str_to_state(&state_str),
                    created_at: row.get::<_, i64>(5)? as u64,
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut reminders = Vec::new();
        for r in rows {
            reminders.push(r.map_err(|e| BbqError::Storage(e.to_string()))?);
        }
        Ok(reminders)
    }

    fn delete(&self, id: &str) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        conn.execute("DELETE FROM reminders WHERE id = ?1", params![id])
            .map_err(|e| BbqError::Storage(format!("Failed to delete reminder: {}", e)))?;

        Ok(())
    }

    fn clear_fired(&self) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        conn.execute("DELETE FROM reminders WHERE state = 'Fired'", [])
            .map_err(|e| BbqError::Storage(format!("Failed to clear fired reminders: {}", e)))?;

        Ok(())
    }
}

use bbq_core::{LauncherAction, LauncherItem, LauncherItemSource};

pub trait LauncherRepository: Send + Sync {
    fn get_recent(&self, limit: usize) -> BbqResult<Vec<LauncherItem>>;
    fn record_recent(&self, item: &LauncherItem, max_recent: usize) -> BbqResult<()>;
    fn clear_recent(&self) -> BbqResult<()>;
    fn get_favorites(&self, limit: usize) -> BbqResult<Vec<LauncherItem>>;
    fn add_favorite(&self, item: &LauncherItem, max_favorites: usize) -> BbqResult<()>;
    fn remove_favorite(&self, id: &str) -> BbqResult<()>;
}

pub struct SqliteLauncherRepository {
    conn: Arc<Mutex<Connection>>,
}

impl std::fmt::Debug for SqliteLauncherRepository {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SqliteLauncherRepository").finish()
    }
}

impl SqliteLauncherRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

impl LauncherRepository for SqliteLauncherRepository {
    fn get_recent(&self, limit: usize) -> BbqResult<Vec<LauncherItem>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, title, subtitle, icon, action_json, last_used_at, usage_count
                FROM launcher_recent
                ORDER BY last_used_at DESC, rowid DESC
                LIMIT ?1
                "#,
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                let action_json: String = row.get(4)?;
                let action: LauncherAction = serde_json::from_str(&action_json).unwrap_or(
                    LauncherAction::SystemAction(bbq_core::SystemActionType::OpenSettings),
                );

                Ok(LauncherItem {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    subtitle: row.get(2)?,
                    icon: row.get(3)?,
                    action,
                    source: LauncherItemSource::Recent,
                    favorite: false,
                    last_used_at: Some(row.get::<_, i64>(5)? as u64),
                    usage_count: row.get::<_, i64>(6)? as u32,
                    keywords: Vec::new(),
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r.map_err(|e| BbqError::Storage(e.to_string()))?);
        }
        Ok(items)
    }

    fn record_recent(&self, item: &LauncherItem, max_recent: usize) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        let action_json = serde_json::to_string(&item.action).map_err(|e| {
            BbqError::Storage(format!("Failed to serialize launcher action: {}", e))
        })?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        conn.execute(
            r#"
            INSERT INTO launcher_recent (id, title, subtitle, icon, action_json, last_used_at, usage_count)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                subtitle = excluded.subtitle,
                icon = excluded.icon,
                action_json = excluded.action_json,
                last_used_at = excluded.last_used_at,
                usage_count = launcher_recent.usage_count + 1
            "#,
            params![
                item.id,
                item.title,
                item.subtitle,
                item.icon,
                action_json,
                now,
            ],
        )
        .map_err(|e| BbqError::Storage(format!("Failed to record recent launcher action: {}", e)))?;

        if max_recent > 0 {
            conn.execute(
                r#"
                DELETE FROM launcher_recent
                WHERE id NOT IN (
                    SELECT id FROM launcher_recent
                    ORDER BY last_used_at DESC, rowid DESC
                    LIMIT ?1
                )
                "#,
                params![max_recent as i64],
            )
            .map_err(|e| BbqError::Storage(format!("Failed to prune recent actions: {}", e)))?;
        }

        Ok(())
    }

    fn clear_recent(&self) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        conn.execute("DELETE FROM launcher_recent", [])
            .map_err(|e| BbqError::Storage(format!("Failed to clear recent actions: {}", e)))?;

        Ok(())
    }

    fn get_favorites(&self, limit: usize) -> BbqResult<Vec<LauncherItem>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, title, subtitle, icon, action_json, created_at
                FROM launcher_favorites
                ORDER BY created_at DESC
                LIMIT ?1
                "#,
            )
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                let action_json: String = row.get(4)?;
                let action: LauncherAction = serde_json::from_str(&action_json).unwrap_or(
                    LauncherAction::SystemAction(bbq_core::SystemActionType::OpenSettings),
                );

                Ok(LauncherItem {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    subtitle: row.get(2)?,
                    icon: row.get(3)?,
                    action,
                    source: LauncherItemSource::Favorite,
                    favorite: true,
                    last_used_at: None,
                    usage_count: 0,
                    keywords: Vec::new(),
                })
            })
            .map_err(|e| BbqError::Storage(e.to_string()))?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r.map_err(|e| BbqError::Storage(e.to_string()))?);
        }
        Ok(items)
    }

    fn add_favorite(&self, item: &LauncherItem, max_favorites: usize) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        let action_json = serde_json::to_string(&item.action).map_err(|e| {
            BbqError::Storage(format!("Failed to serialize launcher action: {}", e))
        })?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        conn.execute(
            r#"
            INSERT INTO launcher_favorites (id, title, subtitle, icon, action_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                subtitle = excluded.subtitle,
                icon = excluded.icon,
                action_json = excluded.action_json
            "#,
            params![
                item.id,
                item.title,
                item.subtitle,
                item.icon,
                action_json,
                now,
            ],
        )
        .map_err(|e| BbqError::Storage(format!("Failed to add favorite launcher action: {}", e)))?;

        if max_favorites > 0 {
            conn.execute(
                r#"
                DELETE FROM launcher_favorites
                WHERE id NOT IN (
                    SELECT id FROM launcher_favorites
                    ORDER BY created_at DESC
                    LIMIT ?1
                )
                "#,
                params![max_favorites as i64],
            )
            .map_err(|e| BbqError::Storage(format!("Failed to prune favorites: {}", e)))?;
        }

        Ok(())
    }

    fn remove_favorite(&self, id: &str) -> BbqResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| BbqError::Storage(format!("DB lock error: {}", e)))?;

        conn.execute("DELETE FROM launcher_favorites WHERE id = ?1", params![id])
            .map_err(|e| {
                BbqError::Storage(format!("Failed to delete favorite launcher action: {}", e))
            })?;

        Ok(())
    }
}
