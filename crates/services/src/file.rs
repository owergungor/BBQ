use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{guess_mime_type, BbqError, BbqEvent, BbqResult, FileEntry};
use bbq_platform::PlatformFile;
use bbq_storage::FileRepository;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub const DEFAULT_MAX_WORKSPACE_FILES: usize = 100;

pub type FileEventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;

#[async_trait]
pub trait FileServiceTrait: Service {
    async fn get_workspace(&self) -> BbqResult<Vec<FileEntry>>;
    async fn add_file(&self, path: &str, source: Option<String>) -> BbqResult<FileEntry>;
    async fn open_file(&self, id_or_path: &str) -> BbqResult<()>;
    async fn reveal_file(&self, id_or_path: &str) -> BbqResult<()>;
    async fn remove_file(&self, id: &str) -> BbqResult<()>;
    async fn clear_workspace(&self) -> BbqResult<()>;
    async fn subscribe_events(&self, sink: FileEventSink) -> BbqResult<()>;
}

pub struct FileService {
    platform: Arc<dyn PlatformFile>,
    repository: Option<Arc<dyn FileRepository>>,
    running: AtomicBool,
    event_sinks: Arc<Mutex<Vec<FileEventSink>>>,
    max_entries: usize,
}

impl std::fmt::Debug for FileService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FileService")
            .field("max_entries", &self.max_entries)
            .finish()
    }
}

impl FileService {
    pub fn new(
        platform: Arc<dyn PlatformFile>,
        repository: Option<Arc<dyn FileRepository>>,
    ) -> Self {
        Self {
            platform,
            repository,
            running: AtomicBool::new(false),
            event_sinks: Arc::new(Mutex::new(Vec::new())),
            max_entries: DEFAULT_MAX_WORKSPACE_FILES,
        }
    }

    pub fn with_max_entries(mut self, max: usize) -> Self {
        self.max_entries = max;
        self
    }

    fn emit_event(&self, event: BbqEvent) {
        if let Ok(sinks) = self.event_sinks.lock() {
            for sink in sinks.iter() {
                sink(event.clone());
            }
        }
    }
}

#[async_trait]
impl Service for FileService {
    fn name(&self) -> &'static str {
        "FileService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing FileService");

        // Restore workspace from repository and check missing files on startup
        if let Some(repo) = &self.repository {
            let entries = repo.get_workspace(self.max_entries)?;
            for entry in entries {
                let exists = std::path::Path::new(&entry.path).exists();
                if !exists && !entry.missing {
                    let mut updated = entry.clone();
                    updated.missing = true;
                    let _ = repo.update_entry(&updated);
                } else if exists && entry.missing {
                    let mut updated = entry.clone();
                    updated.missing = false;
                    let _ = repo.update_entry(&updated);
                }
            }
        }

        self.running.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        self.running.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        self.running.store(false, Ordering::SeqCst);
        Ok(())
    }

    fn status(&self) -> ServiceStatus {
        let is_running = self.running.load(Ordering::SeqCst);
        ServiceStatus {
            name: self.name(),
            state: if is_running {
                ServiceState::Active
            } else {
                ServiceState::Inactive
            },
            message: None,
        }
    }
}

pub const MAX_FILE_PATH_LEN: usize = 4096;

#[async_trait]
impl FileServiceTrait for FileService {
    async fn get_workspace(&self) -> BbqResult<Vec<FileEntry>> {
        if let Some(repo) = &self.repository {
            repo.get_workspace(self.max_entries)
        } else {
            Ok(Vec::new())
        }
    }

    async fn add_file(&self, path: &str, source: Option<String>) -> BbqResult<FileEntry> {
        if path.trim().is_empty() || path.len() > MAX_FILE_PATH_LEN {
            return Err(BbqError::Validation(format!(
                "Path length must be between 1 and {} characters",
                MAX_FILE_PATH_LEN
            )));
        }

        let meta = self.platform.validate_path(path).await?;
        if meta.is_directory {
            return Err(BbqError::Validation(
                "Directories are not supported in temporary workspace".to_string(),
            ));
        }

        let mut now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        if let Some(repo) = &self.repository {
            let current_newest = repo
                .get_workspace(1)
                .ok()
                .and_then(|w| w.first().map(|e| e.created_at))
                .unwrap_or(0);
            if now <= current_newest {
                now = current_newest + 1;
            }
            // Check duplicate suppression using normalized_path + size_bytes + modified_at
            if let Some(mut existing) = repo.find_by_path(&meta.path)? {
                let is_duplicate = existing.size_bytes == meta.size_bytes
                    && existing.modified_at == meta.modified_at;

                if is_duplicate {
                    // Update created_at timestamp to move to newest position
                    existing.created_at = now;
                    existing.missing = false;
                    repo.update_entry(&existing)?;

                    let workspace = repo.get_workspace(self.max_entries)?;
                    self.emit_event(BbqEvent::FileWorkspaceChanged { entries: workspace });
                    return Ok(existing);
                }
            }

            // Create new entry
            let id = format!("file_{}_{}", now, fastrand_or_time());
            let mime_type = meta
                .extension
                .as_deref()
                .map(guess_mime_type)
                .map(|m| m.to_string());

            let entry = FileEntry::new(
                id,
                meta.name,
                meta.path,
                meta.extension,
                mime_type,
                meta.size_bytes,
                meta.modified_at,
                now,
                source,
            );

            repo.insert_entry(&entry, self.max_entries)?;

            self.emit_event(BbqEvent::FileAdded {
                entry: entry.clone(),
            });

            let workspace = repo.get_workspace(self.max_entries)?;
            self.emit_event(BbqEvent::FileWorkspaceChanged { entries: workspace });

            Ok(entry)
        } else {
            let id = format!("file_{}_{}", now, fastrand_or_time());
            let mime_type = meta
                .extension
                .as_deref()
                .map(guess_mime_type)
                .map(|m| m.to_string());

            Ok(FileEntry::new(
                id,
                meta.name,
                meta.path,
                meta.extension,
                mime_type,
                meta.size_bytes,
                meta.modified_at,
                now,
                source,
            ))
        }
    }

    async fn open_file(&self, id_or_path: &str) -> BbqResult<()> {
        if id_or_path.trim().is_empty() || id_or_path.len() > MAX_FILE_PATH_LEN {
            return Err(BbqError::Validation(format!(
                "Identifier or path length must be between 1 and {} characters",
                MAX_FILE_PATH_LEN
            )));
        }

        let target_path = if let Some(repo) = &self.repository {
            // First check if workspace has this file by id
            let entries = repo.get_workspace(self.max_entries)?;
            if let Some(entry) = entries.iter().find(|e| e.id == id_or_path) {
                entry.path.clone()
            } else {
                id_or_path.to_string()
            }
        } else {
            id_or_path.to_string()
        };

        if target_path.len() > MAX_FILE_PATH_LEN {
            return Err(BbqError::Validation(format!(
                "Target path length exceeds {} characters",
                MAX_FILE_PATH_LEN
            )));
        }

        self.platform.open(&target_path).await
    }

    async fn reveal_file(&self, id_or_path: &str) -> BbqResult<()> {
        if id_or_path.trim().is_empty() || id_or_path.len() > MAX_FILE_PATH_LEN {
            return Err(BbqError::Validation(format!(
                "Identifier or path length must be between 1 and {} characters",
                MAX_FILE_PATH_LEN
            )));
        }

        let target_path = if let Some(repo) = &self.repository {
            let entries = repo.get_workspace(self.max_entries)?;
            if let Some(entry) = entries.iter().find(|e| e.id == id_or_path) {
                entry.path.clone()
            } else {
                id_or_path.to_string()
            }
        } else {
            id_or_path.to_string()
        };

        if target_path.len() > MAX_FILE_PATH_LEN {
            return Err(BbqError::Validation(format!(
                "Target path length exceeds {} characters",
                MAX_FILE_PATH_LEN
            )));
        }

        self.platform.reveal(&target_path).await
    }

    async fn remove_file(&self, id: &str) -> BbqResult<()> {
        if id.trim().is_empty() || id.len() > 1024 {
            return Err(BbqError::Validation(
                "File ID length must be between 1 and 1024 characters".to_string(),
            ));
        }

        if let Some(repo) = &self.repository {
            repo.delete_entry(id)?;

            self.emit_event(BbqEvent::FileRemoved { id: id.to_string() });

            let workspace = repo.get_workspace(self.max_entries)?;
            self.emit_event(BbqEvent::FileWorkspaceChanged { entries: workspace });
        }
        Ok(())
    }

    async fn clear_workspace(&self) -> BbqResult<()> {
        if let Some(repo) = &self.repository {
            repo.clear_workspace()?;
            self.emit_event(BbqEvent::FileWorkspaceChanged {
                entries: Vec::new(),
            });
        }
        Ok(())
    }

    async fn subscribe_events(&self, sink: FileEventSink) -> BbqResult<()> {
        if let Ok(mut sinks) = self.event_sinks.lock() {
            sinks.push(sink);
        }
        Ok(())
    }
}

fn fastrand_or_time() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_platform::{FileMetadataInfo, MockFile};
    use bbq_storage::DatabaseManager;

    #[tokio::test]
    async fn test_file_service_add_and_duplicate_suppression() {
        let mock_file = Arc::new(MockFile::new());
        mock_file.add_simulated_file(FileMetadataInfo {
            path: "/home/docs/contract.pdf".to_string(),
            name: "contract.pdf".to_string(),
            extension: Some("pdf".to_string()),
            size_bytes: 204800,
            modified_at: Some(1700000000),
            is_directory: false,
        });

        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.file_repository();
        let service = FileService::new(mock_file.clone(), Some(repo));
        service.init().await.unwrap();

        // 1. Add file
        let entry1 = service
            .add_file("/home/docs/contract.pdf", Some("drag_drop".to_string()))
            .await
            .unwrap();

        assert_eq!(entry1.name, "contract.pdf");
        assert_eq!(entry1.size_bytes, 204800);
        assert_eq!(entry1.mime_type, Some("application/pdf".to_string()));

        let ws = service.get_workspace().await.unwrap();
        assert_eq!(ws.len(), 1);

        // 2. Add exact same file (duplicate suppression moves to newest position)
        let entry2 = service
            .add_file("/home/docs/contract.pdf", None)
            .await
            .unwrap();

        assert_eq!(entry1.id, entry2.id);
        let ws_after_dup = service.get_workspace().await.unwrap();
        assert_eq!(ws_after_dup.len(), 1);
    }

    #[tokio::test]
    async fn test_file_service_directory_rejection() {
        let mock_file = Arc::new(MockFile::new());
        mock_file.add_simulated_file(FileMetadataInfo {
            path: "/home/docs/folder".to_string(),
            name: "folder".to_string(),
            extension: None,
            size_bytes: 4096,
            modified_at: Some(1700000000),
            is_directory: true,
        });

        let db = DatabaseManager::open_in_memory().unwrap();
        let service = FileService::new(mock_file, Some(db.file_repository()));

        let err = service.add_file("/home/docs/folder", None).await;
        assert!(err.is_err());
        match err {
            Err(BbqError::Validation(msg)) => {
                assert!(msg.contains("Directories are not supported"));
            }
            other => panic!("Expected Validation error, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn test_file_service_bounded_limit() {
        let mock_file = Arc::new(MockFile::new());
        let db = DatabaseManager::open_in_memory().unwrap();
        let service =
            FileService::new(mock_file.clone(), Some(db.file_repository())).with_max_entries(3);

        for i in 1..=5 {
            let path = format!("/tmp/file_{}.txt", i);
            mock_file.add_simulated_file(FileMetadataInfo {
                path: path.clone(),
                name: format!("file_{}.txt", i),
                extension: Some("txt".to_string()),
                size_bytes: 100 * i as u64,
                modified_at: Some(i as i64),
                is_directory: false,
            });
            service.add_file(&path, None).await.unwrap();
        }

        let ws = service.get_workspace().await.unwrap();
        assert_eq!(ws.len(), 3);
        // Oldest (1, 2) pruned, latest (5, 4, 3) retained
        assert_eq!(ws[0].name, "file_5.txt");
        assert_eq!(ws[1].name, "file_4.txt");
        assert_eq!(ws[2].name, "file_3.txt");
    }

    #[tokio::test]
    async fn test_file_service_open_reveal_remove() {
        let mock_file = Arc::new(MockFile::new());
        mock_file.add_simulated_file(FileMetadataInfo {
            path: "/path/test.txt".to_string(),
            name: "test.txt".to_string(),
            extension: Some("txt".to_string()),
            size_bytes: 50,
            modified_at: Some(1700000000),
            is_directory: false,
        });

        let db = DatabaseManager::open_in_memory().unwrap();
        let service = FileService::new(mock_file.clone(), Some(db.file_repository()));

        let entry = service.add_file("/path/test.txt", None).await.unwrap();

        // Open by ID
        service.open_file(&entry.id).await.unwrap();
        assert_eq!(
            mock_file.opened.lock().unwrap().as_slice(),
            &["/path/test.txt".to_string()]
        );

        // Reveal by ID
        service.reveal_file(&entry.id).await.unwrap();
        assert_eq!(
            mock_file.revealed.lock().unwrap().as_slice(),
            &["/path/test.txt".to_string()]
        );

        // Remove
        service.remove_file(&entry.id).await.unwrap();
        assert_eq!(service.get_workspace().await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_file_service_missing_file_restoration() {
        let mock_file = Arc::new(MockFile::new());
        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.file_repository();

        // Insert an entry whose path does not exist on disk
        let missing_entry = FileEntry::new(
            "fe_ghost".to_string(),
            "ghost.pdf".to_string(),
            "/nonexistent/ghost.pdf".to_string(),
            Some("pdf".to_string()),
            Some("application/pdf".to_string()),
            1024,
            Some(1700000000),
            1700000000,
            None,
        );
        repo.insert_entry(&missing_entry, 100).unwrap();

        // Instantiate service and run init()
        let service = FileService::new(mock_file, Some(repo.clone()));
        service.init().await.unwrap();

        let ws = service.get_workspace().await.unwrap();
        assert_eq!(ws.len(), 1);
        assert!(
            ws[0].missing,
            "Nonexistent file must be marked missing on init"
        );
    }

    #[tokio::test]
    async fn test_file_service_underlying_file_preserved_on_remove() {
        // Create an actual temporary file
        let temp_dir = std::env::temp_dir();
        let temp_file_path = temp_dir.join(format!("bbq_test_{}.tmp", fastrand_or_time()));
        std::fs::write(&temp_file_path, b"BBQ file safety test").unwrap();
        assert!(temp_file_path.exists());

        let path_str = temp_file_path.to_string_lossy().to_string();
        let mock_file = Arc::new(MockFile::new());
        mock_file.add_simulated_file(FileMetadataInfo {
            path: path_str.clone(),
            name: "test.tmp".to_string(),
            extension: Some("tmp".to_string()),
            size_bytes: 21,
            modified_at: Some(1700000000),
            is_directory: false,
        });

        let db = DatabaseManager::open_in_memory().unwrap();
        let service = FileService::new(mock_file, Some(db.file_repository()));

        let entry = service.add_file(&path_str, None).await.unwrap();
        assert_eq!(service.get_workspace().await.unwrap().len(), 1);

        // Remove from BBQ workspace
        service.remove_file(&entry.id).await.unwrap();
        assert_eq!(service.get_workspace().await.unwrap().len(), 0);

        // CRITICAL: The physical file MUST still exist!
        assert!(
            temp_file_path.exists(),
            "Original physical file must NEVER be deleted when removed from BBQ workspace"
        );

        // Clean up test file
        let _ = std::fs::remove_file(&temp_file_path);
    }
}
