use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{
    detect_possible_sensitive, BbqResult, ClipboardEntry, ClipboardStatus, MAX_CLIPBOARD_TEXT_SIZE,
};
use bbq_platform::{ClipboardEventSink, PlatformClipboard, PlatformClipboardEvent};
use bbq_storage::{ClipboardRepository, SettingsRepository};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

fn system_time_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub type ClipboardEntrySink = Arc<dyn Fn(ClipboardEntry) + Send + Sync>;

#[async_trait]
pub trait ClipboardServiceTrait: Service {
    async fn get_history(&self) -> BbqResult<Vec<ClipboardEntry>>;
    async fn get_latest(&self) -> BbqResult<Option<ClipboardEntry>>;
    async fn clear_history(&self) -> BbqResult<()>;
    async fn delete_entry(&self, id: &str) -> BbqResult<()>;
    async fn set_history_enabled(&self, enabled: bool) -> BbqResult<()>;
    fn is_history_enabled(&self) -> bool;
    async fn get_status(&self) -> BbqResult<ClipboardStatus>;
    async fn copy_text(&self, text: &str) -> BbqResult<()>;
    async fn clear_clipboard(&self) -> BbqResult<()>;
    async fn subscribe_events(&self, sink: ClipboardEntrySink) -> BbqResult<()>;
    fn set_max_entries(&self, max: usize);
    fn get_max_entries(&self) -> usize;
    async fn set_retention_days(&self, days: u32) -> BbqResult<usize>;
    fn get_retention_days(&self) -> u32;
    async fn prune_retention(&self) -> BbqResult<usize>;
}

#[derive(Clone)]
pub struct ClipboardService {
    platform: Arc<dyn PlatformClipboard>,
    repository: Option<Arc<dyn ClipboardRepository>>,
    settings_repo: Option<Arc<dyn SettingsRepository>>,
    history_enabled: Arc<AtomicBool>,
    max_entries: Arc<AtomicUsize>,
    retention_days: Arc<AtomicU32>,
    last_text: Arc<Mutex<Option<String>>>,
    subscribers: Arc<Mutex<Vec<ClipboardEntrySink>>>,
    service_state: Arc<Mutex<ServiceState>>,
    platform_subscribed: Arc<AtomicBool>,
    time_provider: Arc<dyn Fn() -> u64 + Send + Sync>,
}

impl std::fmt::Debug for ClipboardService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ClipboardService")
            .field(
                "history_enabled",
                &self.history_enabled.load(Ordering::Relaxed),
            )
            .field("max_entries", &self.max_entries.load(Ordering::Relaxed))
            .field("service_state", &self.service_state)
            .finish()
    }
}

impl ClipboardService {
    pub const SETTING_HISTORY_ENABLED: &'static str = "clipboard_history_enabled";
    pub const SETTING_MAX_ENTRIES: &'static str = "clipboard_max_entries";
    pub const SETTING_RETENTION_DAYS: &'static str = "clipboard_retention_days";
    pub const LEGACY_SETTING_HISTORY_ENABLED: &'static str = "clipboard.history.enabled";
    pub const LEGACY_SETTING_MAX_ENTRIES: &'static str = "clipboard.history.max_entries";
    pub const DEFAULT_MAX_ENTRIES: usize = 100;
    pub const DEFAULT_RETENTION_DAYS: u32 = 30;

    pub fn new(
        platform: Arc<dyn PlatformClipboard>,
        repository: Option<Arc<dyn ClipboardRepository>>,
        settings_repo: Option<Arc<dyn SettingsRepository>>,
    ) -> Self {
        Self {
            platform,
            repository,
            settings_repo,
            history_enabled: Arc::new(AtomicBool::new(false)),
            max_entries: Arc::new(AtomicUsize::new(Self::DEFAULT_MAX_ENTRIES)),
            retention_days: Arc::new(AtomicU32::new(Self::DEFAULT_RETENTION_DAYS)),
            last_text: Arc::new(Mutex::new(None)),
            subscribers: Arc::new(Mutex::new(Vec::new())),
            service_state: Arc::new(Mutex::new(ServiceState::Sleeping)),
            platform_subscribed: Arc::new(AtomicBool::new(false)),
            time_provider: Arc::new(system_time_now_ms),
        }
    }

    pub fn with_time_provider(
        platform: Arc<dyn PlatformClipboard>,
        repository: Option<Arc<dyn ClipboardRepository>>,
        settings_repo: Option<Arc<dyn SettingsRepository>>,
        time_provider: Arc<dyn Fn() -> u64 + Send + Sync>,
    ) -> Self {
        Self {
            platform,
            repository,
            settings_repo,
            history_enabled: Arc::new(AtomicBool::new(false)),
            max_entries: Arc::new(AtomicUsize::new(Self::DEFAULT_MAX_ENTRIES)),
            retention_days: Arc::new(AtomicU32::new(Self::DEFAULT_RETENTION_DAYS)),
            last_text: Arc::new(Mutex::new(None)),
            subscribers: Arc::new(Mutex::new(Vec::new())),
            service_state: Arc::new(Mutex::new(ServiceState::Sleeping)),
            platform_subscribed: Arc::new(AtomicBool::new(false)),
            time_provider,
        }
    }

    pub async fn ensure_platform_subscribed(&self) -> BbqResult<()> {
        if !self.platform_subscribed.swap(true, Ordering::SeqCst) {
            self.platform.initialize().await?;
            let this = self.clone();
            let sink: ClipboardEventSink = Arc::new(move |event| {
                this.handle_clipboard_event(event);
            });
            self.platform.subscribe(sink).await?;
        }
        Ok(())
    }

    pub fn with_platform(platform: Arc<dyn PlatformClipboard>) -> Self {
        Self::new(platform, None, None)
    }

    /// Process incoming platform event safely adhering to privacy and memory constraints
    pub fn handle_clipboard_event(&self, event: PlatformClipboardEvent) {
        match event {
            PlatformClipboardEvent::Cleared => {
                if let Ok(mut last) = self.last_text.lock() {
                    *last = None;
                }
                if let Ok(mut state) = self.service_state.lock() {
                    *state = ServiceState::Sleeping;
                }
            }
            PlatformClipboardEvent::Unavailable(reason) => {
                tracing::warn!("Clipboard platform provider unavailable: {}", reason);
                if let Ok(mut state) = self.service_state.lock() {
                    *state = ServiceState::Failed;
                }
            }
            PlatformClipboardEvent::Changed(mut entry) => {
                // Deduplication check: if text matches latest entry, ignore
                if let Some(ref text) = entry.content {
                    let is_dup = {
                        let last = self.last_text.lock().unwrap_or_else(|e| e.into_inner());
                        last.as_ref() == Some(text)
                    };
                    if is_dup {
                        return;
                    }
                    if let Ok(mut last) = self.last_text.lock() {
                        *last = Some(text.clone());
                    }
                }

                // Check sensitive heuristics
                if let Some(ref text) = entry.content {
                    entry.possible_sensitive = detect_possible_sensitive(text);
                }

                // Privacy check: If history is disabled, NEVER persist and NEVER retain long term
                let enabled = self.history_enabled.load(Ordering::SeqCst);
                if !enabled {
                    // Update transient service state without logging clipboard contents
                    if let Ok(mut state) = self.service_state.lock() {
                        *state = ServiceState::Sleeping;
                    }
                    return;
                }

                // Persist if repository is available
                let max = self.max_entries.load(Ordering::Relaxed);
                if let Some(ref repo) = self.repository {
                    if let Err(e) = repo.insert_entry(&entry, max) {
                        tracing::error!("Failed to persist clipboard entry: {}", e);
                    } else {
                        // Strict PII sanitization: Log only entry id, type, size. NEVER content!
                        tracing::debug!(
                            entry_id = %entry.id,
                            content_type = %entry.content_type,
                            size_bytes = entry.size_bytes,
                            possible_sensitive = entry.possible_sensitive,
                            "Persisted new clipboard entry"
                        );
                    }
                }

                if let Ok(mut state) = self.service_state.lock() {
                    *state = ServiceState::Active;
                }

                // Dispatch to UI subscribers
                let sinks = self
                    .subscribers
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone();
                for sink in sinks {
                    sink(entry.clone());
                }
            }
        }
    }
}

#[async_trait]
impl Service for ClipboardService {
    fn name(&self) -> &'static str {
        "ClipboardService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing ClipboardService (privacy-first, default disabled)");

        // 1. Load settings if repository is present
        if let Some(ref settings) = self.settings_repo {
            let enabled_val = settings
                .get(Self::SETTING_HISTORY_ENABLED)
                .ok()
                .flatten()
                .or_else(|| {
                    settings
                        .get(Self::LEGACY_SETTING_HISTORY_ENABLED)
                        .ok()
                        .flatten()
                });
            if let Some(val) = enabled_val {
                let enabled = val.trim().eq_ignore_ascii_case("true");
                self.history_enabled.store(enabled, Ordering::SeqCst);
            }

            let max_val = settings
                .get(Self::SETTING_MAX_ENTRIES)
                .ok()
                .flatten()
                .or_else(|| {
                    settings
                        .get(Self::LEGACY_SETTING_MAX_ENTRIES)
                        .ok()
                        .flatten()
                });
            if let Some(val) = max_val {
                if let Ok(limit) = val.trim().parse::<usize>() {
                    let clamped = limit.clamp(
                        bbq_core::MIN_CLIPBOARD_MAX_ENTRIES,
                        bbq_core::MAX_CLIPBOARD_MAX_ENTRIES,
                    );
                    self.max_entries.store(clamped, Ordering::SeqCst);
                }
            }

            let retention_val = settings.get(Self::SETTING_RETENTION_DAYS).ok().flatten();
            if let Some(val) = retention_val {
                if let Ok(days) = val.trim().parse::<u32>() {
                    let clamped = days.clamp(
                        bbq_core::MIN_CLIPBOARD_RETENTION_DAYS,
                        bbq_core::MAX_CLIPBOARD_RETENTION_DAYS,
                    );
                    self.retention_days.store(clamped, Ordering::SeqCst);
                }
            }
        }

        // 2. Perform startup retention pruning
        if self.repository.is_some() {
            let _ = self.prune_retention().await;
        }

        // 3. Only initialize platform clipboard provider if history is enabled
        if self.history_enabled.load(Ordering::SeqCst) {
            self.ensure_platform_subscribed().await?;
            let mut state = self.service_state.lock().unwrap_or_else(|e| e.into_inner());
            *state = ServiceState::Active;
        } else {
            let mut state = self.service_state.lock().unwrap_or_else(|e| e.into_inner());
            *state = ServiceState::Sleeping;
        }

        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        let mut state = self.service_state.lock().unwrap_or_else(|e| e.into_inner());
        *state = ServiceState::Sleeping;
        Ok(())
    }

    fn status(&self) -> ServiceStatus {
        let state = *self.service_state.lock().unwrap_or_else(|e| e.into_inner());
        ServiceStatus {
            name: self.name(),
            state,
            message: None,
        }
    }
}

#[async_trait]
impl ClipboardServiceTrait for ClipboardService {
    async fn get_history(&self) -> BbqResult<Vec<ClipboardEntry>> {
        if !self.is_history_enabled() {
            return Ok(Vec::new());
        }
        if let Some(ref repo) = self.repository {
            let max = self.max_entries.load(Ordering::Relaxed);
            repo.get_history(max)
        } else {
            Ok(Vec::new())
        }
    }

    async fn get_latest(&self) -> BbqResult<Option<ClipboardEntry>> {
        self.platform.current().await
    }

    async fn clear_history(&self) -> BbqResult<()> {
        if let Some(ref repo) = self.repository {
            repo.clear_history()?;
        }
        if let Ok(mut last) = self.last_text.lock() {
            *last = None;
        }
        Ok(())
    }

    async fn delete_entry(&self, id: &str) -> BbqResult<()> {
        if let Some(ref repo) = self.repository {
            repo.delete_entry(id)?;
        }
        Ok(())
    }

    async fn set_history_enabled(&self, enabled: bool) -> BbqResult<()> {
        self.history_enabled.store(enabled, Ordering::SeqCst);
        if let Some(ref settings) = self.settings_repo {
            settings.set(
                Self::SETTING_HISTORY_ENABLED,
                if enabled { "true" } else { "false" },
            )?;
        }

        if enabled {
            self.ensure_platform_subscribed().await?;
            if let Ok(mut state) = self.service_state.lock() {
                *state = ServiceState::Active;
            }
        } else {
            if let Ok(mut state) = self.service_state.lock() {
                *state = ServiceState::Sleeping;
            }
            self.clear_history().await?;
        }

        Ok(())
    }

    fn is_history_enabled(&self) -> bool {
        self.history_enabled.load(Ordering::SeqCst)
    }

    async fn get_status(&self) -> BbqResult<ClipboardStatus> {
        let enabled = self.is_history_enabled();
        let max_entries = self.max_entries.load(Ordering::Relaxed);
        let total_entries = if enabled {
            if let Some(ref repo) = self.repository {
                repo.count().unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };

        Ok(ClipboardStatus {
            enabled,
            total_entries,
            max_entries,
        })
    }

    async fn copy_text(&self, text: &str) -> BbqResult<()> {
        // Bounded write: cap at MAX_CLIPBOARD_TEXT_SIZE
        let bounded = if text.len() > MAX_CLIPBOARD_TEXT_SIZE {
            let mut end = MAX_CLIPBOARD_TEXT_SIZE;
            while end > 0 && !text.is_char_boundary(end) {
                end -= 1;
            }
            &text[..end]
        } else {
            text
        };
        self.platform.set_text(bounded).await
    }

    async fn clear_clipboard(&self) -> BbqResult<()> {
        self.platform.clear().await
    }

    async fn subscribe_events(&self, sink: ClipboardEntrySink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    fn set_max_entries(&self, max: usize) {
        let clamped = max.clamp(
            bbq_core::MIN_CLIPBOARD_MAX_ENTRIES,
            bbq_core::MAX_CLIPBOARD_MAX_ENTRIES,
        );
        self.max_entries.store(clamped, Ordering::SeqCst);
        if let Some(ref settings) = self.settings_repo {
            let _ = settings.set(Self::SETTING_MAX_ENTRIES, &clamped.to_string());
        }
    }

    fn get_max_entries(&self) -> usize {
        self.max_entries.load(Ordering::Relaxed)
    }

    async fn set_retention_days(&self, days: u32) -> BbqResult<usize> {
        let clamped = days.clamp(
            bbq_core::MIN_CLIPBOARD_RETENTION_DAYS,
            bbq_core::MAX_CLIPBOARD_RETENTION_DAYS,
        );
        self.retention_days.store(clamped, Ordering::SeqCst);
        if let Some(ref settings) = self.settings_repo {
            let _ = settings.set(Self::SETTING_RETENTION_DAYS, &clamped.to_string());
        }
        self.prune_retention().await
    }

    fn get_retention_days(&self) -> u32 {
        self.retention_days.load(Ordering::Relaxed)
    }

    async fn prune_retention(&self) -> BbqResult<usize> {
        let days = self.retention_days.load(Ordering::Relaxed) as u64;
        let retention_ms = days.saturating_mul(24 * 60 * 60 * 1000);
        let now = (self.time_provider)();
        let cutoff_ms = now.saturating_sub(retention_ms);
        if let Some(ref repo) = self.repository {
            let pruned = repo.prune_older_than(cutoff_ms)?;
            if pruned > 0 {
                tracing::info!(
                    pruned_count = pruned,
                    cutoff_ms = cutoff_ms,
                    "Pruned expired clipboard entries"
                );
            }
            Ok(pruned)
        } else {
            Ok(0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_platform::MockClipboard;
    use bbq_storage::DatabaseManager;

    #[tokio::test]
    async fn test_clipboard_service_disabled_by_default() {
        let mock_platform = Arc::new(MockClipboard::default());
        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.clipboard_repository();
        let settings = db.settings_repository();

        let service = ClipboardService::new(mock_platform.clone(), Some(repo), Some(settings));
        service.init().await.unwrap();

        assert!(!service.is_history_enabled());

        // Platform detects text copied
        mock_platform.simulate_text_copied("Confidential Info");

        // History should NOT contain anything because it is disabled
        let history = service.get_history().await.unwrap();
        assert!(history.is_empty());
        let status = service.get_status().await.unwrap();
        assert_eq!(status.total_entries, 0);
    }

    #[tokio::test]
    async fn test_clipboard_service_enable_and_capture() {
        let mock_platform = Arc::new(MockClipboard::default());
        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.clipboard_repository();
        let settings = db.settings_repository();

        let service = ClipboardService::new(mock_platform.clone(), Some(repo), Some(settings));
        service.init().await.unwrap();

        service.set_history_enabled(true).await.unwrap();
        assert!(service.is_history_enabled());

        mock_platform.simulate_text_copied("First copied item");

        let history = service.get_history().await.unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].content, Some("First copied item".to_string()));

        // Consecutive duplicate copied -> must be ignored
        mock_platform.simulate_duplicate_copied("First copied item");
        let history_after_dup = service.get_history().await.unwrap();
        assert_eq!(history_after_dup.len(), 1);

        // Different item copied -> must be saved
        mock_platform.simulate_text_copied("Second copied item");
        let history2 = service.get_history().await.unwrap();
        assert_eq!(history2.len(), 2);
    }

    #[tokio::test]
    async fn test_disabling_history_purges_stored_content() {
        let mock_platform = Arc::new(MockClipboard::default());
        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.clipboard_repository();
        let settings = db.settings_repository();

        let service = ClipboardService::new(mock_platform.clone(), Some(repo), Some(settings));
        service.init().await.unwrap();

        service.set_history_enabled(true).await.unwrap();
        mock_platform.simulate_text_copied("Sensitive Data 1");
        mock_platform.simulate_text_copied("Sensitive Data 2");

        assert_eq!(service.get_history().await.unwrap().len(), 2);

        // Disable history -> must wipe storage
        service.set_history_enabled(false).await.unwrap();
        assert!(!service.is_history_enabled());
        assert_eq!(service.get_history().await.unwrap().len(), 0);

        // Re-enable -> storage was purged, so still 0
        service.set_history_enabled(true).await.unwrap();
        assert_eq!(service.get_history().await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_sensitive_detection_in_service() {
        let mock_platform = Arc::new(MockClipboard::default());
        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.clipboard_repository();
        let settings = db.settings_repository();

        let service = ClipboardService::new(mock_platform.clone(), Some(repo), Some(settings));
        service.init().await.unwrap();
        service.set_history_enabled(true).await.unwrap();

        mock_platform.simulate_sensitive_content("ghp_SecretGitHubToken1234567890");

        let history = service.get_history().await.unwrap();
        assert_eq!(history.len(), 1);
        assert!(history[0].possible_sensitive);
    }

    #[tokio::test]
    async fn test_clipboard_retention_prunes_old_entries_and_preserves_recent() {
        use std::sync::atomic::AtomicU64;
        let mock_platform = Arc::new(MockClipboard::default());
        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.clipboard_repository();
        let settings = db.settings_repository();

        let current_time = Arc::new(AtomicU64::new(100_000_000_000));
        let time_clone = current_time.clone();
        let time_provider = Arc::new(move || time_clone.load(Ordering::SeqCst));

        let service = ClipboardService::with_time_provider(
            mock_platform.clone(),
            Some(repo.clone()),
            Some(settings),
            time_provider,
        );
        service.init().await.unwrap();
        service.set_history_enabled(true).await.unwrap();

        // Configure retention to 7 days
        service.set_retention_days(7).await.unwrap();
        assert_eq!(service.get_retention_days(), 7);

        let seven_days_ms = 7 * 24 * 60 * 60 * 1000;
        let base_time = current_time.load(Ordering::SeqCst);

        // Insert directly into repo with specific timestamps
        // Entry 1: 10 days old (older than retention period)
        let old_entry = bbq_core::ClipboardEntry {
            id: "old-1".to_string(),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some("Old Entry".to_string()),
            preview: "Old Entry".to_string(),
            size_bytes: 9,
            created_at: (base_time - (10 * 24 * 60 * 60 * 1000)) as i64,
            source: None,
            possible_sensitive: false,
        };
        repo.insert_entry(&old_entry, 100).unwrap();

        // Entry 2: Right at the retention boundary (7 days + 1 ms ago -> expired)
        let boundary_old_entry = bbq_core::ClipboardEntry {
            id: "boundary-old".to_string(),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some("Boundary Old".to_string()),
            preview: "Boundary Old".to_string(),
            size_bytes: 12,
            created_at: (base_time - seven_days_ms - 1) as i64,
            source: None,
            possible_sensitive: false,
        };
        repo.insert_entry(&boundary_old_entry, 100).unwrap();

        // Entry 3: Recent entry (3 days old -> should be preserved)
        let recent_entry = bbq_core::ClipboardEntry {
            id: "recent-1".to_string(),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some("Recent Entry".to_string()),
            preview: "Recent Entry".to_string(),
            size_bytes: 12,
            created_at: (base_time - (3 * 24 * 60 * 60 * 1000)) as i64,
            source: None,
            possible_sensitive: false,
        };
        repo.insert_entry(&recent_entry, 100).unwrap();

        assert_eq!(repo.count().unwrap(), 3);

        // Run retention pruning
        let pruned = service.prune_retention().await.unwrap();
        assert_eq!(pruned, 2);

        // Only recent entry survives
        let history = service.get_history().await.unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, "recent-1");

        // Verify count limit still works alongside retention
        let recent_entry2 = bbq_core::ClipboardEntry {
            id: "recent-2".to_string(),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some("Recent 2".to_string()),
            preview: "Recent 2".to_string(),
            size_bytes: 8,
            created_at: (base_time - 1000) as i64,
            source: None,
            possible_sensitive: false,
        };
        let recent_entry3 = bbq_core::ClipboardEntry {
            id: "recent-3".to_string(),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some("Recent 3".to_string()),
            preview: "Recent 3".to_string(),
            size_bytes: 8,
            created_at: base_time as i64,
            source: None,
            possible_sensitive: false,
        };
        repo.insert_entry(&recent_entry2, 2).unwrap();
        repo.insert_entry(&recent_entry3, 2).unwrap();
        // Since max_entries is 2, only recent-3 and recent-2 should remain
        assert_eq!(repo.count().unwrap(), 2);
    }

    #[tokio::test]
    async fn test_clipboard_retention_enforced_on_setting_update_and_startup() {
        use std::sync::atomic::AtomicU64;
        let mock_platform = Arc::new(MockClipboard::default());
        let db = DatabaseManager::open_in_memory().unwrap();
        let repo = db.clipboard_repository();
        let settings = db.settings_repository();

        let current_time = Arc::new(AtomicU64::new(100_000_000_000));
        let time_clone = current_time.clone();
        let time_provider = Arc::new(move || time_clone.load(Ordering::SeqCst));

        let base_time = current_time.load(Ordering::SeqCst);

        // Seed with entries of varying ages: 2 days old, 15 days old
        let entry_2d = bbq_core::ClipboardEntry {
            id: "entry-2d".to_string(),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some("2 days old".to_string()),
            preview: "2 days old".to_string(),
            size_bytes: 10,
            created_at: (base_time - (2 * 24 * 60 * 60 * 1000)) as i64,
            source: None,
            possible_sensitive: false,
        };
        let entry_15d = bbq_core::ClipboardEntry {
            id: "entry-15d".to_string(),
            content_type: bbq_core::ClipboardContentType::Text,
            content: Some("15 days old".to_string()),
            preview: "15 days old".to_string(),
            size_bytes: 11,
            created_at: (base_time - (15 * 24 * 60 * 60 * 1000)) as i64,
            source: None,
            possible_sensitive: false,
        };
        repo.insert_entry(&entry_2d, 100).unwrap();
        repo.insert_entry(&entry_15d, 100).unwrap();

        // 1. Startup with default 30 days retention -> both 2d and 15d are preserved
        let service = ClipboardService::with_time_provider(
            mock_platform.clone(),
            Some(repo.clone()),
            Some(settings.clone()),
            time_provider.clone(),
        );
        service.init().await.unwrap();
        service.set_history_enabled(true).await.unwrap();
        assert_eq!(repo.count().unwrap(), 2);

        // 2. Change setting to 7 days -> 15d entry should be pruned immediately!
        let pruned = service.set_retention_days(7).await.unwrap();
        assert_eq!(pruned, 1);
        assert_eq!(repo.count().unwrap(), 1);
        let remaining = service.get_history().await.unwrap();
        assert_eq!(remaining[0].id, "entry-2d");

        // 3. New startup maintenance with persisted 7 days setting -> runs prune on init
        let service2 = ClipboardService::with_time_provider(
            mock_platform.clone(),
            Some(repo.clone()),
            Some(settings),
            time_provider,
        );
        // Advance time by 6 days (entry_2d is now 8 days old)
        current_time.fetch_add(6 * 24 * 60 * 60 * 1000, Ordering::SeqCst);
        service2.init().await.unwrap();
        assert_eq!(service2.get_retention_days(), 7);
        // On init, entry_2d (now 8 days old) should have been pruned
        assert_eq!(repo.count().unwrap(), 0);
    }
}
