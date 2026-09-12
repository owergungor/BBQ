use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{
    detect_possible_sensitive, BbqResult, ClipboardEntry, ClipboardStatus, MAX_CLIPBOARD_TEXT_SIZE,
};
use bbq_platform::{ClipboardEventSink, PlatformClipboard, PlatformClipboardEvent};
use bbq_storage::{ClipboardRepository, SettingsRepository};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

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
}

#[derive(Clone)]
pub struct ClipboardService {
    platform: Arc<dyn PlatformClipboard>,
    repository: Option<Arc<dyn ClipboardRepository>>,
    settings_repo: Option<Arc<dyn SettingsRepository>>,
    history_enabled: Arc<AtomicBool>,
    max_entries: Arc<AtomicUsize>,
    last_text: Arc<Mutex<Option<String>>>,
    subscribers: Arc<Mutex<Vec<ClipboardEntrySink>>>,
    service_state: Arc<Mutex<ServiceState>>,
    platform_subscribed: Arc<AtomicBool>,
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
    pub const LEGACY_SETTING_HISTORY_ENABLED: &'static str = "clipboard.history.enabled";
    pub const LEGACY_SETTING_MAX_ENTRIES: &'static str = "clipboard.history.max_entries";
    pub const DEFAULT_MAX_ENTRIES: usize = 100;

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
            last_text: Arc::new(Mutex::new(None)),
            subscribers: Arc::new(Mutex::new(Vec::new())),
            service_state: Arc::new(Mutex::new(ServiceState::Sleeping)),
            platform_subscribed: Arc::new(AtomicBool::new(false)),
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
        }

        // 2. Only initialize platform clipboard provider if history is enabled
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
}
