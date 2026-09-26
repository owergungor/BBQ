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
    async fn start_drag(&self, paths: &[String]) -> BbqResult<()>;
    fn can_drag_out(&self) -> bool;
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

        let mut actions = if batch.items.len() == 1 {
            let first = &batch.items[0];
            match first.kind {
                DropTargetKind::File => vec![
                    DropAction::Open,
                    DropAction::Reveal,
                    DropAction::CopyPath,
                    DropAction::AddToWorkspace,
                ],
                DropTargetKind::Directory => {
                    vec![DropAction::Open, DropAction::Reveal, DropAction::CopyPath]
                }
                DropTargetKind::Unknown => vec![DropAction::Reveal, DropAction::CopyPath],
            }
        } else {
            // Multi-drop batch
            let has_files = batch.items.iter().any(|i| i.kind == DropTargetKind::File);
            let mut acts = vec![DropAction::Open, DropAction::Reveal, DropAction::CopyPath];
            if has_files && self.file_service.is_some() {
                acts.push(DropAction::AddToWorkspace);
            }
            acts
        };

        if self.platform_file.can_drag_out() {
            actions.push(DropAction::DragOut);
        }

        Ok(actions)
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
            DropAction::DragOut => {
                let paths: Vec<String> = selected_items.iter().map(|i| i.path.clone()).collect();
                match self.platform_file.start_drag(&paths).await {
                    Ok(_) => success_count += paths.len(),
                    Err(e) => {
                        tracing::error!("Drag-out failed: {}", e);
                        failure_count += paths.len();
                    }
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
                    DropAction::DragOut => "Drag-out completed".to_string(),
                }
            } else {
                match action {
                    DropAction::Open => format!("Opened {} items", success_count),
                    DropAction::Reveal => format!("Revealed {} items", success_count),
                    DropAction::CopyPath => format!("Copied {} paths to clipboard", success_count),
                    DropAction::AddToWorkspace => {
                        format!("Added {} files to workspace", success_count)
                    }
                    DropAction::DragOut => format!("Dragged out {} items", success_count),
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

    async fn start_drag(&self, paths: &[String]) -> BbqResult<()> {
        self.platform_file.start_drag(paths).await
    }

    fn can_drag_out(&self) -> bool {
        self.platform_file.can_drag_out()
    }
}

/// Safely filters and canonicalizes CLI arguments passed to a single-instance invocation,
/// accepting only valid existing filesystem paths (files or directories), rejecting flags,
/// arbitrary commands, URLs, and nonexistent paths, and bounding to `MAX_DROP_ITEMS`.
pub fn filter_cli_paths<P: AsRef<std::path::Path>>(
    args: &[String],
    base_dir: Option<P>,
) -> Vec<String> {
    if args.is_empty() {
        return Vec::new();
    }

    let mut accepted_paths = Vec::new();
    let mut seen_canonical = HashSet::new();

    // Determine if the first argument is likely the binary invocation itself (argv[0]).
    let start_idx = if args.len() > 1 {
        let first = args[0].trim();
        let first_path = std::path::Path::new(first);
        let is_binary = first_path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|name| {
                let lower = name.to_lowercase();
                lower == "bbq"
                    || lower == "bbq-desktop"
                    || lower == "bbq_desktop"
                    || lower == "app"
                    || lower == "main"
            })
            .unwrap_or(false);

        let matches_current_exe = std::env::current_exe()
            .ok()
            .map(|exe| exe == first_path || exe.file_name() == first_path.file_name())
            .unwrap_or(false);

        if is_binary || matches_current_exe {
            1
        } else {
            0
        }
    } else {
        let first = args[0].trim();
        let first_path = std::path::Path::new(first);
        let is_binary = first_path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|name| {
                let lower = name.to_lowercase();
                lower == "bbq"
                    || lower == "bbq-desktop"
                    || lower == "bbq_desktop"
                    || lower == "app"
                    || lower == "main"
            })
            .unwrap_or(false);

        let matches_current_exe = std::env::current_exe()
            .ok()
            .map(|exe| exe == first_path || exe.file_name() == first_path.file_name())
            .unwrap_or(false);

        if is_binary || matches_current_exe {
            return Vec::new();
        }
        0
    };

    for arg in &args[start_idx..] {
        let trimmed = arg.trim();
        if trimmed.is_empty() {
            continue;
        }

        // 1. Reject flags and switches (e.g. -f, --flag)
        if trimmed.starts_with('-') {
            continue;
        }

        // 2. Reject arbitrary URLs (http://, https://, ftp://, file://)
        if trimmed.contains("://")
            || trimmed.starts_with("http:")
            || trimmed.starts_with("https:")
            || trimmed.starts_with("ftp:")
            || trimmed.starts_with("file:")
        {
            continue;
        }

        // 3. Resolve path relative to base_dir if relative
        let candidate_path = std::path::Path::new(trimmed);
        let resolved = if candidate_path.is_relative() {
            if let Some(ref base) = base_dir {
                base.as_ref().join(candidate_path)
            } else {
                candidate_path.to_path_buf()
            }
        } else {
            candidate_path.to_path_buf()
        };

        // 4. Must exist on the filesystem
        if !resolved.exists() {
            continue;
        }

        // 5. Must be a file or directory (Drop Shelf supports files and directories)
        if !resolved.is_file() && !resolved.is_dir() {
            continue;
        }

        // 6. Safely canonicalize path to resolve symlinks and '..' traversals
        let canonical_str = if let Ok(canon) = std::fs::canonicalize(&resolved) {
            let s = canon.to_string_lossy().to_string();
            #[cfg(windows)]
            let s = s.strip_prefix(r"\\?\").unwrap_or(&s).to_string();
            s
        } else {
            resolved.to_string_lossy().to_string()
        };

        // 7. Deduplicate while preserving order
        if seen_canonical.insert(canonical_str.clone()) {
            accepted_paths.push(canonical_str);
            // 8. Bounded capacity enforcement
            if accepted_paths.len() >= MAX_DROP_ITEMS {
                break;
            }
        }
    }

    accepted_paths
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
        async fn set_retention_days(&self, _days: u32) -> BbqResult<usize> {
            Ok(0)
        }
        fn get_retention_days(&self) -> u32 {
            30
        }
        async fn prune_retention(&self) -> BbqResult<usize> {
            Ok(0)
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

    #[tokio::test]
    async fn test_drop_service_drag_out_actions_capability() {
        let mock_file = Arc::new(MockFile::default());
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file.clone(), mock_clipboard, None);

        let batch = service
            .inspect(&["C:/test/file1.png".to_string()])
            .await
            .unwrap();

        // When can_drag_out is false, DragOut is not present
        mock_file.set_can_drag_out(false);
        let actions = service.get_actions(&batch.id).await.unwrap();
        assert!(!actions.contains(&DropAction::DragOut));

        // When can_drag_out is true, DragOut is offered
        mock_file.set_can_drag_out(true);
        let actions = service.get_actions(&batch.id).await.unwrap();
        assert!(actions.contains(&DropAction::DragOut));
    }

    #[tokio::test]
    async fn test_drop_service_drag_out_success_and_multiple_files() {
        let temp_dir = std::env::temp_dir().join(format!("bbq_drag_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let file1 = temp_dir.join("file1.txt");
        let file2 = temp_dir.join("file2.txt");
        std::fs::write(&file1, "hello").unwrap();
        std::fs::write(&file2, "world").unwrap();

        let path1 = file1.to_string_lossy().to_string();
        let path2 = file2.to_string_lossy().to_string();

        let mock_file = Arc::new(MockFile::default());
        mock_file.set_can_drag_out(true);
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file.clone(), mock_clipboard, None);

        let batch = service
            .inspect(&[path1.clone(), path2.clone()])
            .await
            .unwrap();

        let result = service
            .execute_action(&batch.id, DropAction::DragOut, None)
            .await
            .unwrap();

        assert_eq!(result.success_count, 2);
        assert_eq!(result.failure_count, 0);

        let dragged = mock_file.dragged.lock().unwrap().clone();
        assert_eq!(dragged.len(), 1);
        assert_eq!(dragged[0].len(), 2);
        assert!(dragged[0].contains(&path1));
        assert!(dragged[0].contains(&path2));

        let _ = std::fs::remove_file(file1);
        let _ = std::fs::remove_file(file2);
        let _ = std::fs::remove_dir(temp_dir);
    }

    #[tokio::test]
    async fn test_drop_service_drag_out_missing_file_failure() {
        let mock_file = Arc::new(MockFile::default());
        mock_file.set_can_drag_out(true);
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file.clone(), mock_clipboard, None);

        let batch = service
            .inspect(&["C:/nonexistent/bbq_missing_file_123.bin".to_string()])
            .await
            .unwrap();

        let result = service
            .execute_action(&batch.id, DropAction::DragOut, None)
            .await
            .unwrap();

        assert_eq!(result.success_count, 0);
        assert_eq!(result.failure_count, 1);
    }

    #[tokio::test]
    async fn test_drop_service_drag_out_unsafe_path_rejection() {
        let mock_file = Arc::new(MockFile::default());
        mock_file.set_can_drag_out(true);
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file.clone(), mock_clipboard, None);

        // Path with null byte
        let batch = service
            .inspect(&["C:/path/with\0null.txt".to_string()])
            .await
            .unwrap();

        let result = service
            .execute_action(&batch.id, DropAction::DragOut, None)
            .await
            .unwrap();

        assert_eq!(result.success_count, 0);
        assert_eq!(result.failure_count, 1);
    }

    #[tokio::test]
    async fn test_drop_service_zero_file_content_loading() {
        let temp_dir =
            std::env::temp_dir().join(format!("bbq_zero_content_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let big_file = temp_dir.join("large_payload.dat");
        // Write 100KB dummy file
        let dummy = vec![0u8; 100 * 1024];
        std::fs::write(&big_file, &dummy).unwrap();

        let path = big_file.to_string_lossy().to_string();

        let mock_file = Arc::new(MockFile::default());
        let mock_clipboard = Arc::new(MockClipboard::default());
        let service = DropService::new(mock_file, mock_clipboard, None);

        let batch = service.inspect(std::slice::from_ref(&path)).await.unwrap();

        assert_eq!(batch.count, 1);
        assert_eq!(batch.items[0].name, "large_payload.dat");
        // File metadata only; size matches metadata, but content is never loaded into any field
        assert_eq!(batch.items[0].size, 1024);

        let _ = std::fs::remove_file(big_file);
        let _ = std::fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_filter_cli_paths_valid_file_and_directory() {
        let temp_dir = std::env::temp_dir().join(format!("bbq_drop_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let temp_file = temp_dir.join("test_sample.txt");
        std::fs::write(&temp_file, "sample content").unwrap();

        let sub_dir = temp_dir.join("subfolder");
        let _ = std::fs::create_dir_all(&sub_dir);

        let args = vec![
            temp_file.to_string_lossy().to_string(),
            sub_dir.to_string_lossy().to_string(),
        ];

        let filtered = filter_cli_paths(&args, None::<&std::path::Path>);
        assert_eq!(filtered.len(), 2);
        assert!(filtered.iter().any(|p| p.contains("test_sample.txt")));
        assert!(filtered.iter().any(|p| p.contains("subfolder")));

        let _ = std::fs::remove_file(temp_file);
        let _ = std::fs::remove_dir(sub_dir);
        let _ = std::fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_filter_cli_paths_rejects_nonexistent_and_flags() {
        let args = vec![
            "-f".to_string(),
            "--flag".to_string(),
            "--minimized".to_string(),
            "-v".to_string(),
            "/definitely/nonexistent/file/path/bbq_123456789.xyz".to_string(),
            "relative/nonexistent/file.txt".to_string(),
        ];

        let filtered = filter_cli_paths(&args, None::<&std::path::Path>);
        assert!(
            filtered.is_empty(),
            "Flags and nonexistent paths must be rejected"
        );
    }

    #[test]
    fn test_filter_cli_paths_rejects_arbitrary_urls() {
        let args = vec![
            "https://malicious.site/script.sh".to_string(),
            "http://example.com/payload.exe".to_string(),
            "ftp://files.example.com/archive.zip".to_string(),
            "file:///etc/passwd".to_string(),
            "bbq://command/action".to_string(),
        ];

        let filtered = filter_cli_paths(&args, None::<&std::path::Path>);
        assert!(filtered.is_empty(), "Arbitrary URLs must be rejected");
    }

    #[test]
    fn test_filter_cli_paths_deduplication() {
        let temp_file =
            std::env::temp_dir().join(format!("bbq_dedup_test_{}.txt", std::process::id()));
        std::fs::write(&temp_file, "data").unwrap();
        let path_str = temp_file.to_string_lossy().to_string();

        let args = vec![path_str.clone(), path_str.clone(), path_str.clone()];

        let filtered = filter_cli_paths(&args, None::<&std::path::Path>);
        assert_eq!(
            filtered.len(),
            1,
            "Duplicate paths must be deduplicated to exactly one"
        );

        let _ = std::fs::remove_file(temp_file);
    }

    #[test]
    fn test_filter_cli_paths_capacity_bounded() {
        let temp_dir = std::env::temp_dir().join(format!("bbq_bound_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let mut args = Vec::new();
        let mut created_files = Vec::new();
        // Create 60 temp files (exceeding MAX_DROP_ITEMS = 50)
        for i in 0..60 {
            let f = temp_dir.join(format!("file_{}.txt", i));
            std::fs::write(&f, "content").unwrap();
            args.push(f.to_string_lossy().to_string());
            created_files.push(f);
        }

        let filtered = filter_cli_paths(&args, None::<&std::path::Path>);
        assert_eq!(
            filtered.len(),
            MAX_DROP_ITEMS,
            "Capacity must be bounded to MAX_DROP_ITEMS"
        );

        for f in created_files {
            let _ = std::fs::remove_file(f);
        }
        let _ = std::fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_filter_cli_paths_no_shell_execution() {
        let dangerous_args = vec![
            "$(calc.exe)".to_string(),
            "; rm -rf /".to_string(),
            "| cat /etc/shadow".to_string(),
            "`whoami`".to_string(),
            "& notepad.exe".to_string(),
        ];

        let filtered = filter_cli_paths(&dangerous_args, None::<&std::path::Path>);
        assert!(
            filtered.is_empty(),
            "Shell metacharacters and injected commands must be rejected as nonexistent paths"
        );
    }

    #[test]
    fn test_filter_cli_paths_skips_binary_invocation() {
        let temp_file =
            std::env::temp_dir().join(format!("forward_sample_{}.txt", std::process::id()));
        std::fs::write(&temp_file, "data").unwrap();
        let valid_str = temp_file.to_string_lossy().to_string();

        // 1. When argv[0] is the binary name and second arg is a file
        let args_with_bin = vec!["bbq".to_string(), valid_str.clone()];
        let filtered = filter_cli_paths(&args_with_bin, None::<&std::path::Path>);
        assert_eq!(filtered.len(), 1);
        assert!(filtered[0].contains("forward_sample_"));

        // 2. When argv[0] is bbq-desktop.exe with no additional arguments
        let args_bin_only = vec!["bbq-desktop.exe".to_string()];
        let filtered_empty = filter_cli_paths(&args_bin_only, None::<&std::path::Path>);
        assert!(
            filtered_empty.is_empty(),
            "Binary invocation without files yields 0 paths"
        );

        let _ = std::fs::remove_file(temp_file);
    }
}
