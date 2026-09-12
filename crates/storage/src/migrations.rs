use bbq_core::{BbqError, BbqResult};
use rusqlite::{params, Connection};

#[derive(Debug)]
pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "v001_initial_schema",
        sql: r#"
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS key_value_store (
                namespace TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (namespace, key)
            );
        "#,
    },
    Migration {
        version: 2,
        name: "v002_clipboard_entries",
        sql: r#"
            CREATE TABLE IF NOT EXISTS clipboard_entries (
                id TEXT PRIMARY KEY,
                content_type TEXT NOT NULL,
                content TEXT,
                preview TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                source TEXT,
                possible_sensitive INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_clipboard_entries_created_at
            ON clipboard_entries(created_at DESC);
        "#,
    },
    Migration {
        version: 3,
        name: "v003_file_entries",
        sql: r#"
            CREATE TABLE IF NOT EXISTS file_entries (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                extension TEXT,
                mime_type TEXT,
                size_bytes INTEGER NOT NULL,
                modified_at INTEGER,
                created_at INTEGER NOT NULL,
                source TEXT,
                missing INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_file_entries_created_at
            ON file_entries(created_at DESC);
        "#,
    },
    Migration {
        version: 4,
        name: "v004_reminders",
        sql: r#"
            CREATE TABLE IF NOT EXISTS reminders (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                body TEXT,
                due_at INTEGER NOT NULL,
                state TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_reminders_due_at
            ON reminders(due_at);

            CREATE INDEX IF NOT EXISTS idx_reminders_state
            ON reminders(state);
        "#,
    },
    Migration {
        version: 5,
        name: "v005_launcher",
        sql: r#"
            CREATE TABLE IF NOT EXISTS launcher_recent (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                subtitle TEXT,
                icon TEXT,
                action_json TEXT NOT NULL,
                last_used_at INTEGER NOT NULL,
                usage_count INTEGER NOT NULL DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_launcher_recent_last_used_at
            ON launcher_recent(last_used_at DESC);

            CREATE TABLE IF NOT EXISTS launcher_favorites (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                subtitle TEXT,
                icon TEXT,
                action_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
        "#,
    },
];

pub fn run_migrations(conn: &mut Connection) -> BbqResult<()> {
    // Ensure migrations table exists
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );
        "#,
    )
    .map_err(|e| BbqError::Migration(format!("Failed to create schema_migrations table: {}", e)))?;

    // Determine current version
    let current_version: i64 = {
        let mut stmt = conn
            .prepare("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")
            .map_err(|e| BbqError::Migration(format!("Failed to query migrations: {}", e)))?;
        stmt.query_row([], |row| row.get(0)).map_err(|e| {
            BbqError::Migration(format!("Failed to fetch current migration version: {}", e))
        })?
    };

    for migration in MIGRATIONS {
        if migration.version > current_version {
            tracing::info!(
                "Applying migration {} ({})",
                migration.version,
                migration.name
            );
            let tx = conn.transaction().map_err(|e| {
                BbqError::Migration(format!("Failed to begin migration transaction: {}", e))
            })?;

            tx.execute_batch(migration.sql).map_err(|e| {
                BbqError::Migration(format!(
                    "Failed executing migration {}: {}",
                    migration.name, e
                ))
            })?;

            let now = chrono_now_iso();
            tx.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
                params![migration.version, migration.name, now],
            )
            .map_err(|e| {
                BbqError::Migration(format!(
                    "Failed recording migration {}: {}",
                    migration.name, e
                ))
            })?;

            tx.commit().map_err(|e| {
                BbqError::Migration(format!(
                    "Failed committing migration {}: {}",
                    migration.name, e
                ))
            })?;
        }
    }

    Ok(())
}

fn chrono_now_iso() -> String {
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", duration.as_secs())
}
