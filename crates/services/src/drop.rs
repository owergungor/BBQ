use async_trait::async_trait;
use bbq_core::{
    BbqError, BbqEvent, BbqResult, DropAction, DropActionResult, DropBatch, DropTarget,
    DropTargetKind, MAX_DROP_ITEMS,
};
use bbq_platform::PlatformFile;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::clipboard::ClipboardServiceTrait;
use crate::file::FileServiceTrait;
use crate::traits::{Service, ServiceState, ServiceStatus};

pub type DropEventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;

#[async_trait]
pub trait DropServiceTrait: Service {
    async fn inspect(&self, paths: &[String]) -> BbqResult<DropBatch>;
    async fn get_actions(&self, batch_id: &str) -> BbqResult<Vec<DropAction>>;
    async fn execute_action(
        &self,
        batch_id: &str,
        action: DropAction,
        target_id: Option<&str>,
    ) -> BbqResult<DropActionResult>;
    async fn get_current_batch(&self) -> BbqResult<Option<DropBatch>>;
    async fn clear(&self) -> BbqResult<()>;
    async fn subscribe_events(&self, sink: DropEventSink) -> BbqResult<()>;
}

pub struct DropService {
    platform_file: Arc<dyn PlatformFile>,
    clipboard: Arc<dyn ClipboardServiceTrait>,
    file_service: Option<Arc<dyn FileServiceTrait>>,
    current_batch: Arc<Mutex<Option<DropBatch>>>,
    event_sinks: Arc<Mutex<Vec<DropEventSink>>>,
    running: AtomicBool,
}

impl std::fmt::Debug for DropService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DropService")
            .field("running", &self.running.load(Ordering::SeqCst))
            .finish()
    }
}

impl DropService {
    pub fn new(
        platform_file: Arc<dyn PlatformFile>,
        clipboard: Arc<dyn ClipboardServiceTrait>,
        file_service: Option<Arc<dyn FileServiceTrait>>,
    ) -> Self {
        Self {
            platform_file,
            clipboard,
            file_service,
            current_batch: Arc::new(Mutex::new(None)),
            event_sinks: Arc::new(Mutex::new(Vec::new())),
            running: AtomicBool::new(false),
        }
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
impl Service for DropService {
    fn name(&self) -> &'static str {
        "DropService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing DropService");
        self.running.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        self.running.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        self.running.store(false, Ordering::SeqCst);
        if let Ok(mut batch) = self.current_batch.lock() {
            *batch = None;
        }
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

#[async_trait]
impl DropServiceTrait for DropService {
    async fn inspect(&self, paths: &[String]) -> BbqResult<DropBatch> {
        if paths.is_empty() {
            return Err(BbqError::Validation(
                "No paths provided for inspection".to_string(),
            ));
        }

        if paths.len() > MAX_DROP_ITEMS {
            return Err(BbqError::Validation(format!(
                "Maximum drop batch limit of {} items exceeded (received {})",
                MAX_DROP_ITEMS,
                paths.len()
            )));
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        // Deduplicate paths while preserving order
        let mut seen = HashSet::new();
        let mut unique_paths = Vec::new();
        for p in paths {
            let trimmed = p.trim().to_string();
            if !trimmed.is_empty() && seen.insert(trimmed.clone()) {
                unique_paths.push(trimmed);
            }
        }

        if unique_paths.is_empty() {
            return Err(BbqError::Validation(
                "All provided paths were empty or invalid".to_string(),
            ));
        }

        let mut targets = Vec::with_capacity(unique_paths.len());
        for (idx, p) in unique_paths.iter().enumerate() {
            let target_id = format!("target_{}_{}", now, idx);
            match self.platform_file.validate_path(p).await {
                Ok(meta) => {
                    let kind = if meta.is_directory {
                        DropTargetKind::Directory
                    } else {
                        DropTargetKind::File
                    };
                    targets.push(DropTarget::new(
                        target_id,
                        meta.path,
                        kind,
                        meta.name,
                        meta.size_bytes,
                        meta.modified_at,
                        meta.extension,
                    ));
                }
                Err(err) => {
                    tracing::warn!("Failed to validate path '{}': {}", p, err);
                    targets.push(DropTarget::new(
                        target_id,
                        p.clone(),
                        DropTargetKind::Unknown,
                        p.clone(),
                        0,
                        None,
                        None,
                    ));
                }
            }
        }

        let batch = DropBatch::new(format!("batch_{}", now), targets, now);

        if let Ok(mut lock) = self.current_batch.lock() {
            *lock = Some(batch.clone());
        }

        self.emit_event(BbqEvent::DropBatchInspected(batch.clone()));

        Ok(batch)
    }

    async fn get_actions(&self, batch_id: &str) -> BbqResult<Vec<DropAction>> {
        let batch_opt = self
            .current_batch
            .lock()
            .map_err(|e| BbqError::Service {
                service: "DropService",
                message: e.to_string(),
            })?
            .clone();

        let batch = match batch_opt {
            Some(b) if b.id == batch_id => b,
            _ => {
                return Err(BbqError::Validation(format!(
                    "Drop batch '{}' not found or expired",
                    batch_id
                )))
            }
        };

        if batch.items.len() == 1 {
            let first = &batch.items[0];
            match first.kind {
                DropTargetKind::File => Ok(vec![
                    DropAction::Open,
                    DropAction::Reveal,
                    DropAction::CopyPath,
                    DropAction::AddToWorkspace,
                ]),
                DropTargetKind::Directory => Ok(vec![
                    DropAction::Open,
                    DropAction::Reveal,
                    DropAction::CopyPath,
                ]),
                DropTargetKind::Unknown => Ok(vec![DropAction::Reveal, DropAction::CopyPath]),
            }
        } else {
            // Multi-drop batch
            let has_files = batch.items.iter().any(|i| i.kind == DropTargetKind::File);
            let mut actions = vec![DropAction::Open, DropAction::Reveal, DropAction::CopyPath];
            if has_files && self.file_service.is_some() {
                actions.push(DropAction::AddToWorkspace);
            }
            Ok(actions)
        }
    }

    async fn execute_action(
        &self,
        batch_id: &str,
        action: DropAction,
        target_id: Option<&str>,
    ) -> BbqResult<DropActionResult> {
        let batch = {
            let lock = self.current_batch.lock().map_err(|e| BbqError::Service {
                service: "DropService",
                message: e.to_string(),
            })?;
            match lock.as_ref() {
                Some(b) if b.id == batch_id => b.clone(),
                _ => {
                    return Err(BbqError::Validation(format!(
                        "Drop batch '{}' not found",
                        batch_id
                    )))
                }
            }
        };

        let selected_items: Vec<&DropTarget> = if let Some(tid) = target_id {
            batch.items.iter().filter(|i| i.id == tid).collect()
        } else {
            batch.items.iter().collect()
        };

        if selected_items.is_empty() {
            return Err(BbqError::Validation(
                "No targets matched for action execution".to_string(),
            ));
        }

        let mut success_count = 0;
        let mut failure_count = 0;

        match action {
            DropAction::Open => {
                // Sequential execution to avoid uncontrolled background process spawning
                for item in &selected_items {
                    match self.platform_file.open(&item.path).await {
                        Ok(_) => success_count += 1,
                        Err(e) => {
                            tracing::error!("Failed to open '{}': {}", item.path, e);
                            failure_count += 1;
                        }
                    }
                }
            }
            DropAction::Reveal => {
                // Reveal items bounded to avoid opening dozens of explorer windows
                let reveal_limit = selected_items.len().min(5);
                for item in selected_items.iter().take(reveal_limit) {
                    match self.platform_file.reveal(&item.path).await {
                        Ok(_) => success_count += 1,
                        Err(e) => {
                            tracing::error!("Failed to reveal '{}': {}", item.path, e);
                            failure_count += 1;
                        }
                    }
                }
                // Mark remaining as success if primary revealed
                if selected_items.len() > reveal_limit {
                    success_count += selected_items.len() - reveal_limit;
                }
            }
            DropAction::CopyPath => {
                // Explicitly copy paths to clipboard ONLY on user request
                let joined = selected_items
                    .iter()
                    .map(|i| i.path.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");

                match self.clipboard.copy_text(&joined).await {
                    Ok(_) => success_count = selected_items.len(),
                    Err(e) => {
                        tracing::error!("Failed to copy paths to clipboard: {}", e);
                        failure_count = selected_items.len();
                    }
                }
            }
            DropAction::AddToWorkspace => {
                if let Some(fs) = &self.file_service {
                    for item in &selected_items {
                        if item.kind == DropTargetKind::File {
                            match fs.add_file(&item.path, Some("drop_zone".to_string())).await {
                                Ok(_) => success_count += 1,
                                Err(e) => {
                                    tracing::error!(
                                        "Failed to add file '{}' to workspace: {}",
                                        item.path,
                                        e
                                    );
                                    failure_count += 1;
                                }
                            }
                        } else {
                            // Directories are not supported in FileService workspace
                            failure_count += 1;
                        }
                    }
                } else {
                    return Err(BbqError::Service {
                        service: "DropService",
                        message: "FileService is not configured".to_string(),
                    });
                }
            }
        }

        let message = if failure_count == 0 {
            if selected_items.len() == 1 {
                match action {
                    DropAction::Open => "Opened successfully".to_string(),
                    DropAction::Reveal => "Revealed in folder".to_string(),
                    DropAction::CopyPath => "Path copied to clipboard".to_string(),
                    DropAction::AddToWorkspace => "Added to workspace".to_string(),
                }
            } else {
                match action {
                    DropAction::Open => format!("Opened {} items", success_count),
                    DropAction::Reveal => format!("Revealed {} items", success_count),
                    DropAction::CopyPath => format!("Copied {} paths to clipboard", success_count),
                    DropAction::AddToWorkspace => {
                        format!("Added {} files to workspace", success_count)
                    }
                }
            }
        } else if success_count > 0 {
            format!(
                "Completed for {} of {} items ({} failed)",
                success_count,
                selected_items.len(),
                failure_count
            )
        } else {
            "Failed to execute action on dropped items".to_string()
        };

        let result = DropActionResult {
            success_count,
            failure_count,
            message,
        };

        self.emit_event(BbqEvent::DropActionExecuted(result.clone()));

        Ok(result)
    }

    async fn get_current_batch(&self) -> BbqResult<Option<DropBatch>> {
        let lock = self.current_batch.lock().map_err(|e| BbqError::Service {
            service: "DropService",
            message: e.to_string(),
        })?;
        Ok(lock.clone())
    }

    async fn clear(&self) -> BbqResult<()> {
        let mut lock = self.current_batch.lock().map_err(|e| BbqError::Service {
            service: "DropService",
            message: e.to_string(),
        })?;
        *lock = None;
        Ok(())
    }

    async fn subscribe_events(&self, sink: DropEventSink) -> BbqResult<()> {
        let mut sinks = self.event_sinks.lock().map_err(|e| BbqError::Service {
            service: "DropService",
            message: e.to_string(),
        })?;
        sinks.push(sink);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_platform::MockFile;

    #[derive(Default)]
    struct MockClipboard {
        copied: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl Service for MockClipboard {
        fn name(&self) -> &'static str {
            "MockClipboard"
        }
        async fn init(&self) -> BbqResult<()> {
            Ok(())
        }
        async fn start(&self) -> BbqResult<()> {
            Ok(())
        }
        async fn stop(&self) -> BbqResult<()> {
            Ok(())
        }
        fn status(&self) -> ServiceStatus {
            ServiceStatus {
                name: self.name(),
                state: ServiceState::Active,
                message: None,
            }
        }
    }

    #[async_trait]
    impl ClipboardServiceTrait for MockClipboard {
        async fn get_history(&self) -> BbqResult<Vec<bbq_core::ClipboardEntry>> {
            Ok(Vec::new())
        }
        async fn get_latest(&self) -> BbqResult<Option<bbq_core::ClipboardEntry>> {
            Ok(None)
        }
        async fn clear_history(&self) -> BbqResult<()> {
            Ok(())
        }
        async fn delete_entry(&self, _id: &str) -> BbqResult<()> {
            Ok(())
        }
        async fn set_history_enabled(&self, _enabled: bool) -> BbqResult<()> {
            Ok(())
        }
        fn is_history_enabled(&self) -> bool {
            true
        }
        async fn get_status(&self) -> BbqResult<bbq_core::ClipboardStatus> {
            Ok(bbq_core::ClipboardStatus {
                enabled: true,
                total_entries: 0,
                max_entries: 100,
            })
        }
        async fn copy_text(&self, text: &str) -> BbqResult<()> {
            self.copied.lock().unwrap().push(text.to_string());
            Ok(())
        }
        async fn clear_clipboard(&self) -> BbqResult<()> {
            Ok(())
        }
        async fn subscribe_events(
            &self,
            _sink: crate::clipboard::ClipboardEntrySink,
        ) -> BbqResult<()> {
            Ok(())
        }
        fn set_max_entries(&self, _max: usize) {}
        fn get_max_entries(&self) -> usize {
            100
        }
    }

    #[tokio::test]
    async fn test_drop_service_inspect_single_file() {
        let mock_file = Arc::new(MockFile::default());
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file, mock_clipboard, None);

        let batch = service
            .inspect(&["C:/test/document.pdf".to_string()])
            .await
            .unwrap();

        assert_eq!(batch.count, 1);
        assert_eq!(batch.items[0].name, "document.pdf");
        assert_eq!(batch.items[0].kind, DropTargetKind::File);

        let actions = service.get_actions(&batch.id).await.unwrap();
        assert!(actions.contains(&DropAction::Open));
        assert!(actions.contains(&DropAction::Reveal));
        assert!(actions.contains(&DropAction::CopyPath));
    }

    #[tokio::test]
    async fn test_drop_service_inspect_rejects_empty_and_bounds() {
        let mock_file = Arc::new(MockFile::default());
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file, mock_clipboard, None);

        // Empty paths reject
        let err_empty = service.inspect(&[]).await.unwrap_err();
        assert!(matches!(err_empty, BbqError::Validation(_)));

        // Exceeding MAX_DROP_ITEMS reject
        let too_many: Vec<String> = (0..55).map(|i| format!("file_{}.txt", i)).collect();
        let err_limit = service.inspect(&too_many).await.unwrap_err();
        assert!(matches!(err_limit, BbqError::Validation(_)));
    }

    #[tokio::test]
    async fn test_drop_service_duplicate_suppression() {
        let mock_file = Arc::new(MockFile::default());
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file, mock_clipboard, None);

        let batch = service
            .inspect(&[
                "C:/test/file.txt".to_string(),
                "C:/test/file.txt".to_string(),
                "C:/test/file.txt ".to_string(),
            ])
            .await
            .unwrap();

        assert_eq!(batch.count, 1);
    }

    #[tokio::test]
    async fn test_drop_service_explicit_copy_path() {
        let mock_file = Arc::new(MockFile::default());
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file, mock_clipboard.clone(), None);

        let batch = service
            .inspect(&["C:/test/file.txt".to_string()])
            .await
            .unwrap();

        // Ensure inspection alone DID NOT copy to clipboard
        assert_eq!(mock_clipboard.copied.lock().unwrap().len(), 0);

        // Explicit action executes CopyPath
        let result = service
            .execute_action(&batch.id, DropAction::CopyPath, None)
            .await
            .unwrap();

        assert_eq!(result.success_count, 1);
        assert_eq!(mock_clipboard.copied.lock().unwrap().len(), 1);
        assert_eq!(mock_clipboard.copied.lock().unwrap()[0], "C:/test/file.txt");
    }

    #[tokio::test]
    async fn test_drop_service_multi_drop_actions() {
        let mock_file = Arc::new(MockFile::default());
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file.clone(), mock_clipboard, None);

        let batch = service
            .inspect(&[
                "C:/test/file1.png".to_string(),
                "C:/test/file2.png".to_string(),
            ])
            .await
            .unwrap();

        assert_eq!(batch.count, 2);

        let result = service
            .execute_action(&batch.id, DropAction::Open, None)
            .await
            .unwrap();

        assert_eq!(result.success_count, 2);
        assert_eq!(result.failure_count, 0);
    }
}
