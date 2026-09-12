use crate::search::SearchEngine;
use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{
    validate_launcher_url, BbqActionType, BbqError, BbqEvent, BbqResult, LauncherAction,
    LauncherCapabilities, LauncherItem, LauncherItemSource, SystemActionType, MAX_DISCOVERED_APPS,
    MAX_FAVORITE_ITEMS, MAX_RECENT_ITEMS,
};
use bbq_platform::PlatformLauncher;
use bbq_storage::LauncherRepository;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub type LauncherEventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;

#[async_trait]
pub trait LauncherServiceTrait: Service {
    async fn get_capabilities(&self) -> BbqResult<LauncherCapabilities>;
    async fn list_items(&self) -> BbqResult<Vec<LauncherItem>>;
    async fn search_items(&self, query: &str) -> BbqResult<Vec<LauncherItem>>;
    async fn launch_item(&self, item_id: &str) -> BbqResult<()>;
    async fn launch_action(&self, action: &LauncherAction) -> BbqResult<()>;
    async fn add_favorite(&self, item_id: &str) -> BbqResult<()>;
    async fn remove_favorite(&self, item_id: &str) -> BbqResult<()>;
    async fn list_favorites(&self) -> BbqResult<Vec<LauncherItem>>;
    async fn list_recent(&self) -> BbqResult<Vec<LauncherItem>>;
    async fn clear_recent(&self) -> BbqResult<()>;
    fn subscribe_events(&self, sink: LauncherEventSink) -> BbqResult<()>;
}

pub struct LauncherService {
    platform: Arc<dyn PlatformLauncher>,
    repository: Option<Arc<dyn LauncherRepository>>,
    builtins: Arc<Mutex<Vec<LauncherItem>>>,
    recent: Arc<Mutex<Vec<LauncherItem>>>,
    favorites: Arc<Mutex<Vec<LauncherItem>>>,
    discovered_apps: Arc<Mutex<Vec<LauncherItem>>>,
    subscribers: Arc<Mutex<Vec<LauncherEventSink>>>,
    initialized: Arc<AtomicBool>,
}

impl std::fmt::Debug for LauncherService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LauncherService").finish()
    }
}

impl LauncherService {
    pub fn new(
        platform: Arc<dyn PlatformLauncher>,
        repository: Option<Arc<dyn LauncherRepository>>,
    ) -> Self {
        let builtins = Self::default_builtins();
        Self {
            platform,
            repository,
            builtins: Arc::new(Mutex::new(builtins)),
            recent: Arc::new(Mutex::new(Vec::new())),
            favorites: Arc::new(Mutex::new(Vec::new())),
            discovered_apps: Arc::new(Mutex::new(Vec::new())),
            subscribers: Arc::new(Mutex::new(Vec::new())),
            initialized: Arc::new(AtomicBool::new(false)),
        }
    }

    fn default_builtins() -> Vec<LauncherItem> {
        vec![
            LauncherItem {
                id: "bbq_clipboard".to_string(),
                title: "Clipboard".to_string(),
                subtitle: Some("View and search clipboard history".to_string()),
                icon: Some("📋".to_string()),
                action: LauncherAction::BbqAction(BbqActionType::OpenClipboard),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "clipboard".to_string(),
                    "copy".to_string(),
                    "paste".to_string(),
                    "history".to_string(),
                    "panoya kopyala".to_string(),
                    "gecmis".to_string(),
                ],
            },
            LauncherItem {
                id: "bbq_timer".to_string(),
                title: "Timer & Pomodoro".to_string(),
                subtitle: Some("Countdown, stopwatch, and work cycles".to_string()),
                icon: Some("⏱️".to_string()),
                action: LauncherAction::BbqAction(BbqActionType::OpenTimer),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "timer".to_string(),
                    "countdown".to_string(),
                    "stopwatch".to_string(),
                    "pomodoro".to_string(),
                    "kronometre".to_string(),
                    "zamanlayici".to_string(),
                    "geri sayim".to_string(),
                ],
            },
            LauncherItem {
                id: "bbq_reminders".to_string(),
                title: "Reminders".to_string(),
                subtitle: Some("View upcoming alerts and tasks".to_string()),
                icon: Some("🔔".to_string()),
                action: LauncherAction::BbqAction(BbqActionType::OpenReminders),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "reminder".to_string(),
                    "reminders".to_string(),
                    "todo".to_string(),
                    "tasks".to_string(),
                    "hatirlatici".to_string(),
                    "gorevler".to_string(),
                ],
            },
            LauncherItem {
                id: "bbq_system".to_string(),
                title: "System Status".to_string(),
                subtitle: Some("Battery, network, and resource metrics".to_string()),
                icon: Some("⚙️".to_string()),
                action: LauncherAction::BbqAction(BbqActionType::OpenSystem),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "system".to_string(),
                    "volume".to_string(),
                    "sound".to_string(),
                    "mute".to_string(),
                    "battery".to_string(),
                    "network".to_string(),
                    "sistem".to_string(),
                    "ses".to_string(),
                    "pil".to_string(),
                    "ag".to_string(),
                ],
            },
            LauncherItem {
                id: "bbq_media".to_string(),
                title: "Media Player".to_string(),
                subtitle: Some("Active playback controls and now playing".to_string()),
                icon: Some("🎵".to_string()),
                action: LauncherAction::BbqAction(BbqActionType::OpenMedia),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "media".to_string(),
                    "music".to_string(),
                    "player".to_string(),
                    "play".to_string(),
                    "pause".to_string(),
                    "medya".to_string(),
                    "muzik".to_string(),
                    "calici".to_string(),
                ],
            },
            LauncherItem {
                id: "bbq_settings".to_string(),
                title: "Settings".to_string(),
                subtitle: Some("Preferences, theme, and Island configuration".to_string()),
                icon: Some("🔧".to_string()),
                action: LauncherAction::BbqAction(BbqActionType::OpenSettings),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "settings".to_string(),
                    "preferences".to_string(),
                    "options".to_string(),
                    "theme".to_string(),
                    "ayarlar".to_string(),
                    "ayar".to_string(),
                    "tercihler".to_string(),
                    "secenekler".to_string(),
                ],
            },
            LauncherItem {
                id: "sys_downloads".to_string(),
                title: "Downloads".to_string(),
                subtitle: Some("Open user downloads directory".to_string()),
                icon: Some("📥".to_string()),
                action: LauncherAction::SystemAction(SystemActionType::OpenDownloads),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "downloads".to_string(),
                    "files".to_string(),
                    "folder".to_string(),
                    "indirilenler".to_string(),
                    "dosyalar".to_string(),
                    "klasor".to_string(),
                ],
            },
            LauncherItem {
                id: "sys_home".to_string(),
                title: "Home Directory".to_string(),
                subtitle: Some("Open user personal home folder".to_string()),
                icon: Some("🏠".to_string()),
                action: LauncherAction::SystemAction(SystemActionType::OpenHome),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "home".to_string(),
                    "user".to_string(),
                    "profile".to_string(),
                    "ev".to_string(),
                    "kullanici".to_string(),
                    "profil".to_string(),
                ],
            },
            LauncherItem {
                id: "sys_lock".to_string(),
                title: "Lock Screen".to_string(),
                subtitle: Some("Securely lock the operating system session".to_string()),
                icon: Some("🔒".to_string()),
                action: LauncherAction::SystemAction(SystemActionType::LockScreen),
                source: LauncherItemSource::BuiltIn,
                favorite: false,
                last_used_at: None,
                usage_count: 0,
                keywords: vec![
                    "lock".to_string(),
                    "screen".to_string(),
                    "session".to_string(),
                    "kilit".to_string(),
                    "kilitle".to_string(),
                    "ekran".to_string(),
                    "oturum".to_string(),
                ],
            },
        ]
    }

    fn emit_event(&self, event: BbqEvent) {
        if let Ok(subs) = self.subscribers.lock() {
            for sub in subs.iter() {
                sub(event.clone());
            }
        }
    }

    pub fn set_discovered_apps(&self, apps: Vec<LauncherItem>) {
        if let Ok(mut guard) = self.discovered_apps.lock() {
            *guard = apps.into_iter().take(MAX_DISCOVERED_APPS).collect();
        }
    }
}

#[async_trait]
impl Service for LauncherService {
    fn name(&self) -> &'static str {
        "LauncherService"
    }

    async fn init(&self) -> BbqResult<()> {
        if self.initialized.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        self.platform.initialize().await?;

        // Hydrate persisted recent and favorites
        if let Some(ref repo) = self.repository {
            if let Ok(recent) = repo.get_recent(MAX_RECENT_ITEMS) {
                if let Ok(mut guard) = self.recent.lock() {
                    *guard = recent;
                }
            }
            if let Ok(favs) = repo.get_favorites(MAX_FAVORITE_ITEMS) {
                if let Ok(mut guard) = self.favorites.lock() {
                    *guard = favs;
                }
            }
        }

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
            state: if self.initialized.load(Ordering::SeqCst) {
                ServiceState::Active
            } else {
                ServiceState::Inactive
            },
            message: None,
        }
    }
}

#[async_trait]
impl LauncherServiceTrait for LauncherService {
    async fn get_capabilities(&self) -> BbqResult<LauncherCapabilities> {
        self.platform.capabilities().await
    }

    async fn list_items(&self) -> BbqResult<Vec<LauncherItem>> {
        let mut all = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // 1. Favorites
        if let Ok(favs) = self.favorites.lock() {
            for item in favs.iter() {
                if seen.insert(item.id.clone()) {
                    all.push(item.clone());
                }
            }
        }

        // 2. Builtins
        if let Ok(builtins) = self.builtins.lock() {
            for item in builtins.iter() {
                if seen.insert(item.id.clone()) {
                    let mut it = item.clone();
                    // Sync favorite bit if in favorites
                    if let Ok(favs) = self.favorites.lock() {
                        it.favorite = favs.iter().any(|f| f.id == it.id);
                    }
                    if let Ok(recent) = self.recent.lock() {
                        if let Some(r) = recent.iter().find(|r| r.id == it.id) {
                            it.last_used_at = r.last_used_at;
                            it.usage_count = r.usage_count;
                        }
                    }
                    all.push(it);
                }
            }
        }

        // 3. Recent items
        if let Ok(recent) = self.recent.lock() {
            for item in recent.iter() {
                if seen.insert(item.id.clone()) {
                    let mut it = item.clone();
                    if let Ok(favs) = self.favorites.lock() {
                        it.favorite = favs.iter().any(|f| f.id == it.id);
                    }
                    all.push(it);
                }
            }
        }

        // 4. Discovered applications
        if let Ok(apps) = self.discovered_apps.lock() {
            for item in apps.iter() {
                if seen.insert(item.id.clone()) {
                    let mut it = item.clone();
                    if let Ok(recent) = self.recent.lock() {
                        if let Some(r) = recent.iter().find(|r| r.id == it.id) {
                            it.last_used_at = r.last_used_at;
                            it.usage_count = r.usage_count;
                        }
                    }
                    all.push(it);
                }
            }
        }

        Ok(all)
    }

    async fn search_items(&self, query: &str) -> BbqResult<Vec<LauncherItem>> {
        let items = self.list_items().await?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let favorite_ids: Vec<String> = if let Ok(favs) = self.favorites.lock() {
            favs.iter().map(|f| f.id.clone()).collect()
        } else {
            Vec::new()
        };

        let recent_ids: Vec<String> = if let Ok(recent) = self.recent.lock() {
            recent.iter().map(|r| r.id.clone()).collect()
        } else {
            Vec::new()
        };

        let ranked = SearchEngine::search(query, &items, now, &favorite_ids, &recent_ids);
        Ok(ranked)
    }

    async fn launch_item(&self, item_id: &str) -> BbqResult<()> {
        let all = self.list_items().await?;
        let target =
            all.into_iter()
                .find(|it| it.id == item_id)
                .ok_or_else(|| BbqError::Service {
                    service: "LauncherService",
                    message: format!("Launcher item '{}' not found", item_id),
                })?;

        self.launch_action(&target.action).await?;

        // Update usage in memory and persistence
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let current_usage = if let Ok(recent) = self.recent.lock() {
            recent
                .iter()
                .find(|r| r.id == item_id)
                .map(|r| r.usage_count)
                .unwrap_or(target.usage_count)
        } else {
            target.usage_count
        };

        let mut updated_item = target.clone();
        updated_item.last_used_at = Some(now);
        updated_item.usage_count = current_usage + 1;
        updated_item.source = LauncherItemSource::Recent;

        if let Ok(mut recent) = self.recent.lock() {
            if let Some(pos) = recent.iter().position(|r| r.id == item_id) {
                recent.remove(pos);
            }
            recent.insert(0, updated_item.clone());
            recent.truncate(MAX_RECENT_ITEMS);
        }

        if let Some(ref repo) = self.repository {
            let _ = repo.record_recent(&updated_item, MAX_RECENT_ITEMS);
        }

        self.emit_event(BbqEvent::LauncherActionCompleted {
            item_id: item_id.to_string(),
            action: target.action,
        });

        if let Ok(recent) = self.recent.lock() {
            self.emit_event(BbqEvent::LauncherRecentChanged(recent.clone()));
        }

        Ok(())
    }

    async fn launch_action(&self, action: &LauncherAction) -> BbqResult<()> {
        match action {
            LauncherAction::OpenUrl { url } => {
                validate_launcher_url(url)?;
                self.platform.open_url(url).await
            }
            LauncherAction::OpenFile { path } => {
                if path.trim().is_empty() || path.len() > bbq_core::MAX_PATH_LEN {
                    return Err(BbqError::Validation(
                        "Path length must be between 1 and 4096 characters".to_string(),
                    ));
                }
                self.platform.open_file(path).await
            }
            LauncherAction::OpenFolder { path } => {
                if path.trim().is_empty() || path.len() > bbq_core::MAX_PATH_LEN {
                    return Err(BbqError::Validation(
                        "Path length must be between 1 and 4096 characters".to_string(),
                    ));
                }
                self.platform.open_folder(path).await
            }
            LauncherAction::OpenApplication { id } => {
                if id.trim().is_empty() || id.len() > bbq_core::MAX_APP_ID_LEN {
                    return Err(BbqError::Validation(
                        "Application ID length must be between 1 and 1024 characters".to_string(),
                    ));
                }
                self.platform.open_application(id).await
            }
            LauncherAction::SystemAction(_) => self.platform.launch(action).await,
            LauncherAction::BbqAction(_) => {
                // BBQ internal actions dispatched via UI/events
                Ok(())
            }
        }
    }

    async fn add_favorite(&self, item_id: &str) -> BbqResult<()> {
        let all = self.list_items().await?;
        let target =
            all.into_iter()
                .find(|it| it.id == item_id)
                .ok_or_else(|| BbqError::Service {
                    service: "LauncherService",
                    message: format!("Launcher item '{}' not found", item_id),
                })?;

        let mut fav = target.clone();
        fav.favorite = true;
        fav.source = LauncherItemSource::Favorite;

        if let Ok(mut favs) = self.favorites.lock() {
            if !favs.iter().any(|f| f.id == item_id) {
                if favs.len() >= MAX_FAVORITE_ITEMS {
                    return Err(BbqError::Validation(format!(
                        "Maximum favorite items ({}) reached",
                        MAX_FAVORITE_ITEMS
                    )));
                }
                favs.insert(0, fav.clone());
            }
        }

        if let Some(ref repo) = self.repository {
            repo.add_favorite(&fav, MAX_FAVORITE_ITEMS)?;
        }

        if let Ok(favs) = self.favorites.lock() {
            self.emit_event(BbqEvent::LauncherFavoritesChanged(favs.clone()));
        }

        Ok(())
    }

    async fn remove_favorite(&self, item_id: &str) -> BbqResult<()> {
        if let Ok(mut favs) = self.favorites.lock() {
            favs.retain(|f| f.id != item_id);
        }

        if let Some(ref repo) = self.repository {
            repo.remove_favorite(item_id)?;
        }

        if let Ok(favs) = self.favorites.lock() {
            self.emit_event(BbqEvent::LauncherFavoritesChanged(favs.clone()));
        }

        Ok(())
    }

    async fn list_favorites(&self) -> BbqResult<Vec<LauncherItem>> {
        if let Ok(favs) = self.favorites.lock() {
            Ok(favs.clone())
        } else {
            Ok(Vec::new())
        }
    }

    async fn list_recent(&self) -> BbqResult<Vec<LauncherItem>> {
        if let Ok(recent) = self.recent.lock() {
            Ok(recent.clone())
        } else {
            Ok(Vec::new())
        }
    }

    async fn clear_recent(&self) -> BbqResult<()> {
        if let Ok(mut recent) = self.recent.lock() {
            recent.clear();
        }

        if let Some(ref repo) = self.repository {
            repo.clear_recent()?;
        }

        self.emit_event(BbqEvent::LauncherRecentChanged(Vec::new()));
        Ok(())
    }

    fn subscribe_events(&self, sink: LauncherEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_platform::MockLauncher;

    #[tokio::test]
    async fn test_launcher_service_builtins_and_search() {
        let platform = Arc::new(MockLauncher::new());
        let service = LauncherService::new(platform, None);
        service.init().await.unwrap();

        let items = service.list_items().await.unwrap();
        assert!(items.len() >= 9);
        assert!(items.iter().any(|i| i.id == "bbq_timer"));
        assert!(items.iter().any(|i| i.id == "bbq_clipboard"));

        // Search prefix / substring
        let search_res = service.search_items("time").await.unwrap();
        assert_eq!(search_res.len(), 1);
        assert_eq!(search_res[0].id, "bbq_timer");

        let search_none = service.search_items("xyz_not_exist").await.unwrap();
        assert_eq!(search_none.len(), 0);
    }

    #[tokio::test]
    async fn test_launcher_service_launch_and_recent() {
        let platform = Arc::new(MockLauncher::new());
        let service = LauncherService::new(platform.clone(), None);
        service.init().await.unwrap();

        assert_eq!(service.list_recent().await.unwrap().len(), 0);

        // Launch an item
        service.launch_item("bbq_timer").await.unwrap();

        let recent = service.list_recent().await.unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].id, "bbq_timer");
        assert_eq!(recent[0].usage_count, 1);

        // Launch again -> usage_count = 2, still 1 item in recent
        service.launch_item("bbq_timer").await.unwrap();
        let recent2 = service.list_recent().await.unwrap();
        assert_eq!(recent2.len(), 1);
        assert_eq!(recent2[0].usage_count, 2);

        // Clear recent
        service.clear_recent().await.unwrap();
        assert_eq!(service.list_recent().await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_launcher_service_favorites_lifecycle() {
        let platform = Arc::new(MockLauncher::new());
        let service = LauncherService::new(platform, None);
        service.init().await.unwrap();

        assert_eq!(service.list_favorites().await.unwrap().len(), 0);

        service.add_favorite("bbq_reminders").await.unwrap();
        let favs = service.list_favorites().await.unwrap();
        assert_eq!(favs.len(), 1);
        assert_eq!(favs[0].id, "bbq_reminders");

        service.remove_favorite("bbq_reminders").await.unwrap();
        assert_eq!(service.list_favorites().await.unwrap().len(), 0);
    }
}
