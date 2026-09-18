use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{BbqResult, MediaEvent, MediaSession, PlaybackState};
use bbq_platform::{MediaEventSink, PlatformMedia};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[async_trait]
pub trait MediaServiceTrait: Service {
    async fn current_session(&self) -> BbqResult<Option<MediaSession>>;
    async fn play(&self) -> BbqResult<()>;
    async fn pause(&self) -> BbqResult<()>;
    async fn toggle_play_pause(&self) -> BbqResult<()>;
    async fn next(&self) -> BbqResult<()>;
    async fn previous(&self) -> BbqResult<()>;
    async fn seek(&self, position_ms: u64) -> BbqResult<()>;
    async fn subscribe_events(&self, sink: MediaEventSink) -> BbqResult<()>;
}

use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone)]
pub struct MediaService {
    platform: Arc<dyn PlatformMedia>,
    current_session: Arc<Mutex<Option<MediaSession>>>,
    known_sessions: Arc<Mutex<HashMap<String, MediaSession>>>,
    subscribers: Arc<Mutex<Vec<MediaEventSink>>>,
    service_state: Arc<Mutex<ServiceState>>,
    is_platform_initialized: Arc<AtomicBool>,
}

impl std::fmt::Debug for MediaService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MediaService")
            .field("current_session", &self.current_session)
            .field("service_state", &self.service_state)
            .finish()
    }
}

impl MediaService {
    pub fn new(platform: Arc<dyn PlatformMedia>) -> Self {
        Self {
            platform,
            current_session: Arc::new(Mutex::new(None)),
            known_sessions: Arc::new(Mutex::new(HashMap::new())),
            subscribers: Arc::new(Mutex::new(Vec::new())),
            service_state: Arc::new(Mutex::new(ServiceState::Sleeping)),
            is_platform_initialized: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Lazily initializes underlying platform media session manager (e.g. Windows SMTC)
    /// on first actual request or control action, avoiding heavy startup DLL mapping.
    pub async fn ensure_platform_initialized(&self) -> BbqResult<()> {
        if !self.is_platform_initialized.load(Ordering::Acquire)
            && !self.is_platform_initialized.swap(true, Ordering::SeqCst)
        {
            tracing::info!("Lazily initializing PlatformMedia / SMTC discovery");
            self.platform.initialize().await?;
            if let Ok(Some(session)) = self.platform.current_session().await {
                self.handle_media_event(MediaEvent::SessionChanged(Some(session)));
            }
        }
        Ok(())
    }

    /// Select the most appropriate active player deterministically:
    /// 1. Actively playing
    /// 2. Paused / most recently active
    /// 3. Any available session
    pub fn select_active_session(sessions: &HashMap<String, MediaSession>) -> Option<MediaSession> {
        if sessions.is_empty() {
            return None;
        }

        // 1. Actively playing player
        if let Some(s) = sessions
            .values()
            .find(|s| s.state == PlaybackState::Playing)
        {
            return Some(s.clone());
        }

        // 2. Paused player
        if let Some(s) = sessions.values().find(|s| s.state == PlaybackState::Paused) {
            return Some(s.clone());
        }

        // 3. First available player
        sessions.values().next().cloned()
    }

    /// Dispatch media event internally to update local cache and notify listeners
    pub fn handle_media_event(&self, event: MediaEvent) {
        match &event {
            MediaEvent::SessionChanged(opt) => {
                let mut current = self
                    .current_session
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut known = self
                    .known_sessions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut state = self.service_state.lock().unwrap_or_else(|e| e.into_inner());

                if let Some(ref session) = opt {
                    known.insert(session.id.clone(), session.clone());
                    *current = Self::select_active_session(&known);
                    *state = if session.state == PlaybackState::Playing {
                        ServiceState::Active
                    } else {
                        ServiceState::Sleeping
                    };
                } else {
                    known.clear();
                    *current = None;
                    *state = ServiceState::Sleeping;
                }
            }
            MediaEvent::PlaybackChanged {
                session_id,
                state: play_state,
            } => {
                let mut current = self
                    .current_session
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut known = self
                    .known_sessions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut service_st = self.service_state.lock().unwrap_or_else(|e| e.into_inner());

                if let Some(s) = known.get_mut(session_id) {
                    s.state = *play_state;
                }
                *current = Self::select_active_session(&known);
                *service_st = if *play_state == PlaybackState::Playing {
                    ServiceState::Active
                } else {
                    ServiceState::Sleeping
                };
            }
            MediaEvent::MetadataChanged {
                session_id,
                title,
                artist,
                album,
                album_art,
                duration_ms,
            } => {
                let mut current = self
                    .current_session
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut known = self
                    .known_sessions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());

                if let Some(s) = known.get_mut(session_id) {
                    s.title = title.clone();
                    s.artist = artist.clone();
                    s.album = album.clone();
                    s.album_art = album_art.clone();
                    s.duration_ms = *duration_ms;
                }
                *current = Self::select_active_session(&known);
            }
            MediaEvent::PositionChanged {
                session_id,
                position_ms,
            } => {
                let mut current = self
                    .current_session
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut known = self
                    .known_sessions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());

                if let Some(s) = known.get_mut(session_id) {
                    s.position_ms = Some(*position_ms);
                }
                if let Some(ref mut c) = *current {
                    if c.id == *session_id {
                        c.position_ms = Some(*position_ms);
                    }
                }
            }
            MediaEvent::CapabilitiesChanged {
                session_id,
                capabilities,
            } => {
                let mut current = self
                    .current_session
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut known = self
                    .known_sessions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());

                if let Some(s) = known.get_mut(session_id) {
                    s.capabilities = capabilities.clone();
                }
                if let Some(ref mut c) = *current {
                    if c.id == *session_id {
                        c.capabilities = capabilities.clone();
                    }
                }
            }
            MediaEvent::SessionClosed { session_id } => {
                let mut current = self
                    .current_session
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut known = self
                    .known_sessions
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let mut state = self.service_state.lock().unwrap_or_else(|e| e.into_inner());

                known.remove(session_id);
                *current = Self::select_active_session(&known);
                if current.is_none() {
                    *state = ServiceState::Sleeping;
                }
            }
        }

        // Notify external subscribers
        if let Ok(subs) = self.subscribers.lock() {
            for sub in subs.iter() {
                sub(event.clone());
            }
        }
    }
}

#[async_trait]
impl Service for MediaService {
    fn name(&self) -> &'static str {
        "MediaService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing MediaService (cheap local registration)");

        // Wire platform media events into MediaService (in-memory subscription)
        let self_clone = self.clone();
        self.platform
            .subscribe(Arc::new(move |event| {
                self_clone.handle_media_event(event);
            }))
            .await?;

        // Note: SMTC platform discovery is lazily deferred until first explicit
        // media session request or playback control invocation.
        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        let mut st = self.service_state.lock().unwrap_or_else(|e| e.into_inner());
        *st = ServiceState::Active;
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        let mut st = self.service_state.lock().unwrap_or_else(|e| e.into_inner());
        *st = ServiceState::Sleeping;
        Ok(())
    }

    fn status(&self) -> ServiceStatus {
        let st = *self.service_state.lock().unwrap_or_else(|e| e.into_inner());
        ServiceStatus {
            name: self.name(),
            state: st,
            message: None,
        }
    }
}

#[async_trait]
impl MediaServiceTrait for MediaService {
    async fn current_session(&self) -> BbqResult<Option<MediaSession>> {
        self.ensure_platform_initialized().await?;
        let current = self
            .current_session
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        Ok(current.clone())
    }

    async fn play(&self) -> BbqResult<()> {
        self.ensure_platform_initialized().await?;
        self.platform.play().await
    }

    async fn pause(&self) -> BbqResult<()> {
        self.ensure_platform_initialized().await?;
        self.platform.pause().await
    }

    async fn toggle_play_pause(&self) -> BbqResult<()> {
        self.ensure_platform_initialized().await?;
        self.platform.toggle_play_pause().await
    }

    async fn next(&self) -> BbqResult<()> {
        self.ensure_platform_initialized().await?;
        self.platform.next().await
    }

    async fn previous(&self) -> BbqResult<()> {
        self.ensure_platform_initialized().await?;
        self.platform.previous().await
    }

    async fn seek(&self, position_ms: u64) -> BbqResult<()> {
        self.ensure_platform_initialized().await?;
        self.platform.seek(position_ms).await
    }

    async fn subscribe_events(&self, sink: MediaEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_core::MediaCapabilities;
    use bbq_platform::MockMedia;

    #[tokio::test]
    async fn test_media_service_lifecycle_and_selection() {
        let mock_platform = Arc::new(MockMedia::default());
        let service = MediaService::new(mock_platform.clone());

        // 1. Initially sleeping
        assert_eq!(service.status().state, ServiceState::Sleeping);
        assert_eq!(service.current_session().await.unwrap(), None);

        // 2. Initialize
        service.init().await.expect("Init should succeed");

        // 3. Simulate player appearance
        let session = MediaSession {
            id: "spotify".to_string(),
            state: PlaybackState::Playing,
            title: Some("Song Title".to_string()),
            artist: Some("Artist Name".to_string()),
            album: Some("Album".to_string()),
            album_art: None,
            duration_ms: Some(200_000),
            position_ms: Some(10_000),
            volume: Some(1.0),
            source: Some("Spotify".to_string()),
            capabilities: MediaCapabilities {
                can_play: true,
                can_pause: true,
                can_go_next: true,
                can_go_previous: true,
                can_seek: true,
                can_change_volume: false,
            },
        };

        mock_platform.simulate_session(Some(session.clone()));

        // 4. Service wakes to Active
        assert_eq!(service.status().state, ServiceState::Active);
        let active = service
            .current_session()
            .await
            .unwrap()
            .expect("Should have active session");
        assert_eq!(active.title, Some("Song Title".to_string()));
        assert_eq!(active.state, PlaybackState::Playing);

        // 5. Pause track
        service.pause().await.expect("Pause should succeed");
        assert_eq!(service.status().state, ServiceState::Sleeping);

        // 6. Test deterministic selection: multiple players
        let mut map = HashMap::new();
        let player1 = MediaSession {
            id: "vlc".to_string(),
            state: PlaybackState::Paused,
            ..Default::default()
        };
        let player2 = MediaSession {
            id: "spotify".to_string(),
            state: PlaybackState::Playing,
            ..Default::default()
        };
        map.insert("vlc".to_string(), player1);
        map.insert("spotify".to_string(), player2);

        let selected = MediaService::select_active_session(&map).unwrap();
        assert_eq!(
            selected.id, "spotify",
            "Playing session must take priority over paused session"
        );

        // 7. Player close
        mock_platform.simulate_session(None);
        assert_eq!(service.current_session().await.unwrap(), None);
        assert_eq!(service.status().state, ServiceState::Sleeping);
    }

    #[tokio::test]
    async fn test_media_service_lazy_smtc_discovery() {
        let mock_platform = Arc::new(MockMedia::default());
        let service = MediaService::new(mock_platform.clone());

        // At registration and startup init(), platform initialize() is NOT invoked
        assert!(!service.is_platform_initialized.load(Ordering::Acquire));
        service.init().await.expect("init must succeed cheaply");
        assert!(!service.is_platform_initialized.load(Ordering::Acquire));

        // On first explicit current_session call, platform initialize() is lazily invoked
        let session = service
            .current_session()
            .await
            .expect("current_session succeeds");
        assert!(session.is_none());
        assert!(service.is_platform_initialized.load(Ordering::Acquire));
    }
}
