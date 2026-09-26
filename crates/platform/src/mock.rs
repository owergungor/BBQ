use crate::traits::*;
use async_trait::async_trait;
use bbq_core::{BbqError, BbqResult, NotificationCapabilities, NotificationRequest};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct MockPlatformProvider {
    pub window: MockWindow,
    pub display: MockDisplay,
    pub clipboard: MockClipboard,
    pub file: MockFile,
    pub media: MockMedia,
    pub notification: MockNotification,
    pub launcher: MockLauncher,
    pub system: MockSystem,
    pub network: MockNetwork,
    pub hotkey: MockHotkey,
    pub autostart: MockAutostart,
}

impl Default for MockPlatformProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl MockPlatformProvider {
    pub fn new() -> Self {
        Self {
            window: MockWindow::default(),
            display: MockDisplay::default(),
            clipboard: MockClipboard::default(),
            file: MockFile::default(),
            media: MockMedia::default(),
            notification: MockNotification::default(),
            launcher: MockLauncher::default(),
            system: MockSystem::default(),
            network: MockNetwork,
            hotkey: MockHotkey::default(),
            autostart: MockAutostart::new(),
        }
    }
}

impl PlatformProvider for MockPlatformProvider {
    fn window(&self) -> Arc<dyn PlatformWindow> {
        Arc::new(self.window.clone())
    }
    fn display(&self) -> Arc<dyn PlatformDisplay> {
        Arc::new(self.display.clone())
    }
    fn clipboard(&self) -> Arc<dyn PlatformClipboard> {
        Arc::new(self.clipboard.clone())
    }
    fn file(&self) -> Arc<dyn PlatformFile> {
        Arc::new(self.file.clone())
    }
    fn media(&self) -> Arc<dyn PlatformMedia> {
        Arc::new(self.media.clone())
    }
    fn notification(&self) -> Arc<dyn PlatformNotification> {
        Arc::new(self.notification.clone())
    }
    fn launcher(&self) -> Arc<dyn PlatformLauncher> {
        Arc::new(self.launcher.clone())
    }
    fn system(&self) -> Arc<dyn PlatformSystem> {
        Arc::new(self.system.clone())
    }
    fn network(&self) -> Arc<dyn PlatformNetwork> {
        Arc::new(self.network.clone())
    }
    fn hotkey(&self) -> Arc<dyn PlatformHotkey> {
        Arc::new(self.hotkey.clone())
    }
    fn autostart(&self) -> Arc<dyn PlatformAutostart> {
        Arc::new(self.autostart.clone())
    }
}

#[derive(Debug, Clone, Default)]
pub struct MockAutostart {
    pub supported: Arc<Mutex<bool>>,
    pub enabled: Arc<Mutex<bool>>,
}

impl MockAutostart {
    pub fn new() -> Self {
        Self {
            supported: Arc::new(Mutex::new(true)),
            enabled: Arc::new(Mutex::new(false)),
        }
    }
}

#[async_trait]
impl PlatformAutostart for MockAutostart {
    async fn is_supported(&self) -> bool {
        *self.supported.lock().unwrap_or_else(|e| e.into_inner())
    }

    async fn is_enabled(&self) -> BbqResult<bool> {
        Ok(*self.enabled.lock().unwrap_or_else(|e| e.into_inner()))
    }

    async fn set_enabled(&self, enabled: bool) -> BbqResult<()> {
        if let Ok(mut g) = self.enabled.lock() {
            *g = enabled;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct MockWindow {
    pub visible: Arc<Mutex<bool>>,
    pub position: Arc<Mutex<(i32, i32)>>,
    pub size: Arc<Mutex<(u32, u32)>>,
    pub always_on_top: Arc<Mutex<bool>>,
    pub fail_operations: Arc<Mutex<bool>>,
}

impl MockWindow {
    pub fn set_fail_operations(&self, fail: bool) {
        if let Ok(mut g) = self.fail_operations.lock() {
            *g = fail;
        }
    }
}

#[async_trait]
impl PlatformWindow for MockWindow {
    async fn set_position(&self, x: i32, y: i32) -> BbqResult<()> {
        if *self
            .fail_operations
            .lock()
            .unwrap_or_else(|e| e.into_inner())
        {
            return Err(BbqError::Platform(
                "Simulated window manipulation failure".to_string(),
            ));
        }
        if let Ok(mut pos) = self.position.lock() {
            *pos = (x, y);
        }
        Ok(())
    }
    async fn set_size(&self, width: u32, height: u32) -> BbqResult<()> {
        if *self
            .fail_operations
            .lock()
            .unwrap_or_else(|e| e.into_inner())
        {
            return Err(BbqError::Platform(
                "Simulated window manipulation failure".to_string(),
            ));
        }
        if let Ok(mut size) = self.size.lock() {
            *size = (width, height);
        }
        Ok(())
    }
    async fn set_always_on_top(&self, enabled: bool) -> BbqResult<()> {
        if let Ok(mut aot) = self.always_on_top.lock() {
            *aot = enabled;
        }
        Ok(())
    }
    async fn set_visible(&self, visible: bool) -> BbqResult<()> {
        if let Ok(mut vis) = self.visible.lock() {
            *vis = visible;
        }
        Ok(())
    }
    async fn set_interactive(&self, _interactive: bool) -> BbqResult<()> {
        Ok(())
    }
}

#[derive(Clone)]
pub struct MockDisplay {
    pub displays: Arc<Mutex<Vec<DisplayInfo>>>,
    pub active_display_id: Arc<Mutex<Option<String>>>,
    pub subscribers: Arc<Mutex<Vec<DisplayEventSink>>>,
}

impl std::fmt::Debug for MockDisplay {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockDisplay")
            .field("displays", &self.displays)
            .field("active_display_id", &self.active_display_id)
            .finish()
    }
}

impl Default for MockDisplay {
    fn default() -> Self {
        Self {
            displays: Arc::new(Mutex::new(vec![DisplayInfo {
                id: "primary_screen".to_string(),
                name: "Virtual Display 1".to_string(),
                is_primary: true,
                scale_factor: 1.0,
                bounds: DisplayRect {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
                work_area: DisplayRect {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1040,
                },
            }])),
            active_display_id: Arc::new(Mutex::new(None)),
            subscribers: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl MockDisplay {
    pub fn set_displays(&self, list: Vec<DisplayInfo>) {
        if let Ok(mut displays) = self.displays.lock() {
            *displays = list.clone();
        }
        let subs = self
            .subscribers
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default();
        for sub in subs {
            sub(PlatformDisplayEvent::DisplaysChanged(list.clone()));
        }
    }

    pub fn disconnect_display(&self, id: &str) {
        let list = if let Ok(mut displays) = self.displays.lock() {
            displays.retain(|d| d.id != id);
            displays.clone()
        } else {
            Vec::new()
        };
        let subs = self
            .subscribers
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default();
        for sub in subs {
            sub(PlatformDisplayEvent::DisplaysChanged(list.clone()));
        }
    }

    pub fn connect_display(&self, info: DisplayInfo) {
        let list = if let Ok(mut displays) = self.displays.lock() {
            displays.retain(|d| d.id != info.id);
            displays.push(info);
            displays.clone()
        } else {
            Vec::new()
        };
        let subs = self
            .subscribers
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default();
        for sub in subs {
            sub(PlatformDisplayEvent::DisplaysChanged(list.clone()));
        }
    }

    pub fn set_active_display_id(&self, id: &str) {
        if let Ok(mut active) = self.active_display_id.lock() {
            *active = Some(id.to_string());
        }
        let displays = self.displays.lock().map(|d| d.clone()).unwrap_or_default();
        if let Some(target) = displays.iter().find(|d| d.id == id) {
            let subs = self
                .subscribers
                .lock()
                .map(|s| s.clone())
                .unwrap_or_default();
            for sub in subs {
                sub(PlatformDisplayEvent::ActiveDisplayChanged(target.clone()));
            }
        }
    }
}

#[async_trait]
impl PlatformDisplay for MockDisplay {
    async fn get_displays(&self) -> BbqResult<Vec<DisplayInfo>> {
        let displays = self.displays.lock().map(|d| d.clone()).unwrap_or_default();
        Ok(displays)
    }

    async fn get_primary_display(&self) -> BbqResult<DisplayInfo> {
        let displays = self.get_displays().await?;
        displays.into_iter().find(|d| d.is_primary).ok_or_else(|| {
            bbq_core::BbqError::Platform("No primary display found in mock".to_string())
        })
    }

    async fn get_active_display(&self) -> BbqResult<DisplayInfo> {
        let displays = self.get_displays().await?;
        let active_id = self.active_display_id.lock().ok().and_then(|a| a.clone());
        if let Some(id) = active_id {
            if let Some(disp) = displays.iter().find(|d| d.id == id) {
                return Ok(disp.clone());
            }
        }
        self.get_primary_display().await
    }

    fn subscribe(&self, sink: DisplayEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct MockClipboard {
    pub current_entry: Arc<Mutex<Option<ClipboardEntry>>>,
    pub subscribers: Arc<Mutex<Vec<ClipboardEventSink>>>,
    pub is_available: Arc<Mutex<bool>>,
    counter: Arc<Mutex<u64>>,
}

impl Default for MockClipboard {
    fn default() -> Self {
        Self {
            current_entry: Arc::new(Mutex::new(None)),
            subscribers: Arc::new(Mutex::new(Vec::new())),
            is_available: Arc::new(Mutex::new(true)),
            counter: Arc::new(Mutex::new(0)),
        }
    }
}

impl std::fmt::Debug for MockClipboard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockClipboard")
            .field("current_entry", &self.current_entry)
            .finish()
    }
}

impl MockClipboard {
    fn next_id(&self) -> String {
        let mut count = self.counter.lock().unwrap_or_else(|e| e.into_inner());
        *count += 1;
        format!("mock_clip_{}", *count)
    }

    fn dispatch_event(&self, event: PlatformClipboardEvent) {
        let sinks = self
            .subscribers
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        for sink in sinks {
            sink(event.clone());
        }
    }

    pub fn simulate_text_copied(&self, text: &str) {
        let entry = ClipboardEntry::new_text(self.next_id(), text, Some("mock".to_string()));
        if let Ok(mut cur) = self.current_entry.lock() {
            *cur = Some(entry.clone());
        }
        self.dispatch_event(PlatformClipboardEvent::Changed(entry));
    }

    pub fn simulate_duplicate_copied(&self, text: &str) {
        let entry = ClipboardEntry::new_text(self.next_id(), text, Some("mock".to_string()));
        // Dispatches event with same text content
        self.dispatch_event(PlatformClipboardEvent::Changed(entry));
    }

    pub fn simulate_cleared(&self) {
        if let Ok(mut cur) = self.current_entry.lock() {
            *cur = None;
        }
        self.dispatch_event(PlatformClipboardEvent::Cleared);
    }

    pub fn simulate_large_content(&self, size_bytes: usize) {
        let text = "x".repeat(size_bytes);
        self.simulate_text_copied(&text);
    }

    pub fn simulate_sensitive_content(&self, secret: &str) {
        self.simulate_text_copied(secret);
    }

    pub fn simulate_unavailable(&self, reason: &str) {
        if let Ok(mut avail) = self.is_available.lock() {
            *avail = false;
        }
        self.dispatch_event(PlatformClipboardEvent::Unavailable(reason.to_string()));
    }

    pub fn simulate_image_metadata(&self) {
        let entry = ClipboardEntry::new_metadata(
            self.next_id(),
            ClipboardContentType::Image,
            "1920x1080 Image (PNG)".to_string(),
            2048,
            Some("mock".to_string()),
        );
        if let Ok(mut cur) = self.current_entry.lock() {
            *cur = Some(entry.clone());
        }
        self.dispatch_event(PlatformClipboardEvent::Changed(entry));
    }

    pub fn simulate_file_list_metadata(&self, files: Vec<String>) {
        let preview = files.join(", ");
        let entry = ClipboardEntry::new_metadata(
            self.next_id(),
            ClipboardContentType::FileList,
            preview,
            files.len() * 100,
            Some("mock".to_string()),
        );
        if let Ok(mut cur) = self.current_entry.lock() {
            *cur = Some(entry.clone());
        }
        self.dispatch_event(PlatformClipboardEvent::Changed(entry));
    }
}

#[async_trait]
impl PlatformClipboard for MockClipboard {
    async fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn current(&self) -> BbqResult<Option<ClipboardEntry>> {
        let avail = *self.is_available.lock().unwrap_or_else(|e| e.into_inner());
        if !avail {
            return Err(BbqError::Platform(
                "Clipboard service unavailable".to_string(),
            ));
        }
        let cur = self
            .current_entry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        Ok(cur)
    }

    async fn subscribe(&self, sink: ClipboardEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn set_text(&self, text: &str) -> BbqResult<()> {
        self.simulate_text_copied(text);
        Ok(())
    }

    async fn clear(&self) -> BbqResult<()> {
        self.simulate_cleared();
        Ok(())
    }
}

#[derive(Clone)]
pub struct MockMedia {
    pub session: Arc<Mutex<Option<MediaSession>>>,
    pub subscribers: Arc<Mutex<Vec<MediaEventSink>>>,
    pub is_available: Arc<Mutex<bool>>,
}

impl Default for MockMedia {
    fn default() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            subscribers: Arc::new(Mutex::new(Vec::new())),
            is_available: Arc::new(Mutex::new(true)),
        }
    }
}

impl std::fmt::Debug for MockMedia {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockMedia")
            .field("session", &self.session)
            .field("is_available", &self.is_available)
            .finish()
    }
}

impl MockMedia {
    pub fn set_available(&self, available: bool) {
        if let Ok(mut a) = self.is_available.lock() {
            *a = available;
        }
        if !available {
            self.emit_event(MediaEvent::SessionChanged(None));
        }
    }

    pub fn simulate_session(&self, session: Option<MediaSession>) {
        if let Ok(mut s) = self.session.lock() {
            *s = session.clone();
        }
        self.emit_event(MediaEvent::SessionChanged(session));
    }

    pub fn simulate_playback_state(&self, session_id: &str, state: PlaybackState) {
        if let Ok(mut s) = self.session.lock() {
            if let Some(ref mut session) = *s {
                session.state = state;
            }
        }
        self.emit_event(MediaEvent::PlaybackChanged {
            session_id: session_id.to_string(),
            state,
        });
    }

    pub fn simulate_metadata(
        &self,
        session_id: &str,
        title: Option<String>,
        artist: Option<String>,
        album: Option<String>,
    ) {
        if let Ok(mut s) = self.session.lock() {
            if let Some(ref mut sess) = *s {
                sess.title = title.clone();
                sess.artist = artist.clone();
                sess.album = album.clone();
            }
        }
        self.emit_event(MediaEvent::MetadataChanged {
            session_id: session_id.to_string(),
            title,
            artist,
            album,
            album_art: None,
            duration_ms: None,
        });
    }

    pub fn simulate_close(&self, session_id: &str) {
        if let Ok(mut s) = self.session.lock() {
            *s = None;
        }
        self.emit_event(MediaEvent::SessionClosed {
            session_id: session_id.to_string(),
        });
    }

    pub fn emit_event(&self, event: MediaEvent) {
        if let Ok(subs) = self.subscribers.lock() {
            for sub in subs.iter() {
                sub(event.clone());
            }
        }
    }
}

#[async_trait]
impl PlatformMedia for MockMedia {
    async fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn current_session(&self) -> BbqResult<Option<MediaSession>> {
        if !*self.is_available.lock().unwrap_or_else(|e| e.into_inner()) {
            return Err(BbqError::Platform(
                "Simulated media subsystem unavailable".to_string(),
            ));
        }
        Ok(self.session.lock().ok().and_then(|s| s.clone()))
    }

    async fn subscribe(&self, sink: MediaEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn play(&self) -> BbqResult<()> {
        if !*self.is_available.lock().unwrap_or_else(|e| e.into_inner()) {
            return Err(BbqError::Platform(
                "Simulated media subsystem unavailable".to_string(),
            ));
        }
        let changed = if let Ok(mut s) = self.session.lock() {
            if let Some(ref mut session) = *s {
                session.state = PlaybackState::Playing;
                Some((session.id.clone(), session.state))
            } else {
                None
            }
        } else {
            None
        };
        if let Some((id, state)) = changed {
            self.emit_event(MediaEvent::PlaybackChanged {
                session_id: id,
                state,
            });
        }
        Ok(())
    }

    async fn pause(&self) -> BbqResult<()> {
        if !*self.is_available.lock().unwrap_or_else(|e| e.into_inner()) {
            return Err(BbqError::Platform(
                "Simulated media subsystem unavailable".to_string(),
            ));
        }
        let changed = if let Ok(mut s) = self.session.lock() {
            if let Some(ref mut session) = *s {
                session.state = PlaybackState::Paused;
                Some((session.id.clone(), session.state))
            } else {
                None
            }
        } else {
            None
        };
        if let Some((id, state)) = changed {
            self.emit_event(MediaEvent::PlaybackChanged {
                session_id: id,
                state,
            });
        }
        Ok(())
    }

    async fn toggle_play_pause(&self) -> BbqResult<()> {
        let current_state = self
            .session
            .lock()
            .ok()
            .and_then(|s| s.as_ref().map(|x| x.state));
        match current_state {
            Some(PlaybackState::Playing) => self.pause().await,
            _ => self.play().await,
        }
    }

    async fn next(&self) -> BbqResult<()> {
        if !*self.is_available.lock().unwrap_or_else(|e| e.into_inner()) {
            return Err(BbqError::Platform(
                "Simulated media subsystem unavailable".to_string(),
            ));
        }
        Ok(())
    }

    async fn previous(&self) -> BbqResult<()> {
        if !*self.is_available.lock().unwrap_or_else(|e| e.into_inner()) {
            return Err(BbqError::Platform(
                "Simulated media subsystem unavailable".to_string(),
            ));
        }
        Ok(())
    }

    async fn seek(&self, position_ms: u64) -> BbqResult<()> {
        if !*self.is_available.lock().unwrap_or_else(|e| e.into_inner()) {
            return Err(BbqError::Platform(
                "Simulated media subsystem unavailable".to_string(),
            ));
        }
        if let Ok(mut s) = self.session.lock() {
            if let Some(ref mut session) = *s {
                session.position_ms = Some(position_ms);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct MockNotification {
    pub notifications: Arc<Mutex<Vec<NotificationRequest>>>,
    pub available: Arc<Mutex<bool>>,
    pub initialized: Arc<Mutex<bool>>,
}

impl Default for MockNotification {
    fn default() -> Self {
        Self {
            notifications: Arc::new(Mutex::new(Vec::new())),
            available: Arc::new(Mutex::new(true)),
            initialized: Arc::new(Mutex::new(false)),
        }
    }
}

impl MockNotification {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn notification_count(&self) -> usize {
        if let Ok(guard) = self.notifications.lock() {
            guard.len()
        } else {
            0
        }
    }

    pub fn last_notification(&self) -> Option<NotificationRequest> {
        if let Ok(guard) = self.notifications.lock() {
            guard.last().cloned()
        } else {
            None
        }
    }

    pub fn notifications(&self) -> Vec<NotificationRequest> {
        if let Ok(guard) = self.notifications.lock() {
            guard.clone()
        } else {
            Vec::new()
        }
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.notifications.lock() {
            guard.clear();
        }
    }

    pub fn set_available(&self, available: bool) {
        if let Ok(mut guard) = self.available.lock() {
            *guard = available;
        }
    }
}

impl PlatformNotification for MockNotification {
    fn initialize(&self) -> BbqResult<()> {
        if let Ok(mut guard) = self.initialized.lock() {
            *guard = true;
        }
        Ok(())
    }

    fn capabilities(&self) -> BbqResult<NotificationCapabilities> {
        let avail = if let Ok(guard) = self.available.lock() {
            *guard
        } else {
            true
        };
        Ok(NotificationCapabilities { available: avail })
    }

    fn notify(&self, request: &NotificationRequest) -> BbqResult<()> {
        let avail = if let Ok(guard) = self.available.lock() {
            *guard
        } else {
            true
        };
        if !avail {
            return Err(BbqError::Platform(
                "Notification subsystem is unavailable".to_string(),
            ));
        }

        if let Ok(mut guard) = self.notifications.lock() {
            guard.push(request.clone());
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct MockSystem {
    pub state: Arc<Mutex<SystemState>>,
    pub capabilities: Arc<Mutex<SystemCapabilities>>,
    pub sink: Arc<Mutex<Option<SystemEventSink>>>,
    pub initialized: Arc<Mutex<bool>>,
}

impl std::fmt::Debug for MockSystem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockSystem").finish()
    }
}

impl Default for MockSystem {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(SystemState {
                battery: BatteryState {
                    available: true,
                    percentage: Some(100),
                    charging: true,
                    plugged_in: true,
                    power_source: Some("AC".to_string()),
                },
                network: NetworkState {
                    connected: true,
                    interface_name: Some("Mock-WiFi".to_string()),
                    connection_type: Some("WiFi".to_string()),
                    signal_strength: Some(4),
                },
                cpu: Some(bbq_core::CpuMetrics {
                    usage_percent: 25.0,
                    core_count: 8,
                }),
                memory: Some(bbq_core::MemoryMetrics {
                    total_bytes: 16 * 1024 * 1024 * 1024,
                    used_bytes: 8 * 1024 * 1024 * 1024,
                    usage_percent: 50.0,
                }),
                muted: Some(false),
                volume: Some(0.8),
                uptime_seconds: Some(3600),
                hostname: Some("mock-host".to_string()),
                operating_system: "mock-os".to_string(),
                platform: "mock".to_string(),
            })),
            capabilities: Arc::new(Mutex::new(SystemCapabilities {
                has_battery: true,
                can_read_network: true,
                can_read_cpu: true,
                can_read_memory: true,
                can_control_volume: true,
                can_mute: true,
            })),
            sink: Arc::new(Mutex::new(None)),
            initialized: Arc::new(Mutex::new(false)),
        }
    }
}

impl MockSystem {
    pub fn simulate_battery_change(&self, battery: BatteryState) {
        if let Ok(mut state) = self.state.lock() {
            state.battery = battery.clone();
        }
        if let Ok(guard) = self.sink.lock() {
            if let Some(sink) = guard.as_ref() {
                sink(SystemEvent::BatteryChanged(battery));
            }
        }
    }

    pub fn simulate_network_change(&self, network: NetworkState) {
        if let Ok(mut state) = self.state.lock() {
            state.network = network.clone();
        }
        if let Ok(guard) = self.sink.lock() {
            if let Some(sink) = guard.as_ref() {
                sink(SystemEvent::NetworkChanged(network));
            }
        }
    }

    pub fn simulate_volume_change(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.0);
        let muted = if let Ok(mut state) = self.state.lock() {
            state.volume = Some(clamped);
            state.muted
        } else {
            None
        };
        if let Ok(guard) = self.sink.lock() {
            if let Some(sink) = guard.as_ref() {
                sink(SystemEvent::VolumeChanged {
                    volume: Some(clamped),
                    muted,
                });
            }
        }
    }

    pub fn simulate_mute_change(&self, muted: bool) {
        let vol = if let Ok(mut state) = self.state.lock() {
            state.muted = Some(muted);
            state.volume
        } else {
            None
        };
        if let Ok(guard) = self.sink.lock() {
            if let Some(sink) = guard.as_ref() {
                sink(SystemEvent::VolumeChanged {
                    volume: vol,
                    muted: Some(muted),
                });
            }
        }
    }

    pub fn simulate_unavailable(&self, reason: &str) {
        if let Ok(guard) = self.sink.lock() {
            if let Some(sink) = guard.as_ref() {
                sink(SystemEvent::Unavailable {
                    reason: reason.to_string(),
                });
            }
        }
    }
}

#[async_trait]
impl PlatformSystem for MockSystem {
    async fn initialize(&self) -> BbqResult<()> {
        if let Ok(mut init) = self.initialized.lock() {
            *init = true;
        }
        Ok(())
    }

    async fn current_state(&self) -> BbqResult<SystemState> {
        let state = self.state.lock().map_err(|e| {
            bbq_core::BbqError::Platform(format!("Failed to lock mock state: {}", e))
        })?;
        Ok(state.clone())
    }

    async fn capabilities(&self) -> BbqResult<SystemCapabilities> {
        let caps = self.capabilities.lock().map_err(|e| {
            bbq_core::BbqError::Platform(format!("Failed to lock mock capabilities: {}", e))
        })?;
        Ok(caps.clone())
    }

    async fn subscribe(&self, sink: SystemEventSink) -> BbqResult<()> {
        if let Ok(mut slot) = self.sink.lock() {
            *slot = Some(sink);
        }
        Ok(())
    }

    async fn set_volume(&self, volume: f32) -> BbqResult<()> {
        self.simulate_volume_change(volume);
        Ok(())
    }

    async fn set_muted(&self, muted: bool) -> BbqResult<()> {
        self.simulate_mute_change(muted);
        Ok(())
    }

    async fn toggle_muted(&self) -> BbqResult<()> {
        let current_muted = self
            .state
            .lock()
            .ok()
            .and_then(|s| s.muted)
            .unwrap_or(false);
        self.simulate_mute_change(!current_muted);
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct MockNetwork;

#[async_trait]
impl PlatformNetwork for MockNetwork {
    async fn is_connected(&self) -> BbqResult<bool> {
        Ok(true)
    }
}

#[derive(Debug, Clone)]
pub struct MockFile {
    pub files: Arc<Mutex<std::collections::HashMap<String, FileMetadataInfo>>>,
    pub opened: Arc<Mutex<Vec<String>>>,
    pub revealed: Arc<Mutex<Vec<String>>>,
    pub dragged: Arc<Mutex<Vec<Vec<String>>>>,
    pub fail_operations: Arc<Mutex<bool>>,
    pub can_drag_out_supported: Arc<Mutex<bool>>,
}

impl Default for MockFile {
    fn default() -> Self {
        Self {
            files: Arc::new(Mutex::new(std::collections::HashMap::new())),
            opened: Arc::new(Mutex::new(Vec::new())),
            revealed: Arc::new(Mutex::new(Vec::new())),
            dragged: Arc::new(Mutex::new(Vec::new())),
            fail_operations: Arc::new(Mutex::new(false)),
            can_drag_out_supported: Arc::new(Mutex::new(true)),
        }
    }
}

impl MockFile {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_fail_operations(&self, fail: bool) {
        if let Ok(mut f) = self.fail_operations.lock() {
            *f = fail;
        }
    }

    pub fn set_can_drag_out(&self, can: bool) {
        if let Ok(mut c) = self.can_drag_out_supported.lock() {
            *c = can;
        }
    }

    pub fn add_simulated_file(&self, info: FileMetadataInfo) {
        if let Ok(mut map) = self.files.lock() {
            map.insert(info.path.clone(), info);
        }
    }
}

#[async_trait]
impl PlatformFile for MockFile {
    async fn validate_path(&self, path: &str) -> BbqResult<FileMetadataInfo> {
        let files = self
            .files
            .lock()
            .map_err(|e| BbqError::Platform(e.to_string()))?;
        if let Some(info) = files.get(path) {
            Ok(info.clone())
        } else {
            if path.contains("nonexistent") || path.contains("invalid") || path.contains("missing")
            {
                return Err(BbqError::Validation(format!(
                    "File does not exist or is invalid: {}",
                    path
                )));
            }
            let is_directory = path.ends_with('/') || path.ends_with('\\') || path.contains("dir");
            let p = std::path::Path::new(path);
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_string();
            let extension = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string());
            Ok(FileMetadataInfo {
                path: path.to_string(),
                name,
                extension,
                size_bytes: 1024,
                modified_at: Some(1700000000),
                is_directory,
            })
        }
    }

    async fn open(&self, path: &str) -> BbqResult<()> {
        if *self
            .fail_operations
            .lock()
            .unwrap_or_else(|e| e.into_inner())
        {
            return Err(BbqError::Platform(
                "Simulated file operation failure".to_string(),
            ));
        }
        if let Ok(mut opened) = self.opened.lock() {
            opened.push(path.to_string());
        }
        Ok(())
    }

    async fn reveal(&self, path: &str) -> BbqResult<()> {
        if *self
            .fail_operations
            .lock()
            .unwrap_or_else(|e| e.into_inner())
        {
            return Err(BbqError::Platform(
                "Simulated file operation failure".to_string(),
            ));
        }
        if let Ok(mut revealed) = self.revealed.lock() {
            revealed.push(path.to_string());
        }
        Ok(())
    }

    fn can_drag_out(&self) -> bool {
        *self
            .can_drag_out_supported
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    async fn start_drag(&self, paths: &[String]) -> BbqResult<()> {
        if *self
            .fail_operations
            .lock()
            .unwrap_or_else(|e| e.into_inner())
        {
            return Err(BbqError::Platform(
                "Simulated drag operation failure".to_string(),
            ));
        }
        if paths.is_empty() {
            return Err(BbqError::Validation(
                "No paths provided for drag-out".to_string(),
            ));
        }
        for p in paths {
            if p.contains('\0') {
                return Err(BbqError::Validation(format!(
                    "Invalid null byte in path: {}",
                    p
                )));
            }
            if p.contains("nonexistent") || p.contains("missing") {
                return Err(BbqError::Validation(format!("File does not exist: {}", p)));
            }
        }
        if let Ok(mut dragged) = self.dragged.lock() {
            dragged.push(paths.to_vec());
        }
        Ok(())
    }
}

pub use crate::launcher::PlatformLauncher;
use bbq_core::{LauncherAction, LauncherCapabilities};

#[derive(Debug, Clone)]
pub struct MockLauncher {
    pub launched_actions: Arc<Mutex<Vec<LauncherAction>>>,
    pub opened_files: Arc<Mutex<Vec<String>>>,
    pub opened_folders: Arc<Mutex<Vec<String>>>,
    pub opened_urls: Arc<Mutex<Vec<String>>>,
    pub opened_applications: Arc<Mutex<Vec<String>>>,
    pub capabilities: Arc<Mutex<LauncherCapabilities>>,
}

impl Default for MockLauncher {
    fn default() -> Self {
        Self {
            launched_actions: Arc::new(Mutex::new(Vec::new())),
            opened_files: Arc::new(Mutex::new(Vec::new())),
            opened_folders: Arc::new(Mutex::new(Vec::new())),
            opened_urls: Arc::new(Mutex::new(Vec::new())),
            opened_applications: Arc::new(Mutex::new(Vec::new())),
            capabilities: Arc::new(Mutex::new(LauncherCapabilities {
                open_application: true,
                open_file: true,
                open_folder: true,
                open_url: true,
                system_actions: true,
            })),
        }
    }
}

impl MockLauncher {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_capabilities(&self, caps: LauncherCapabilities) {
        if let Ok(mut guard) = self.capabilities.lock() {
            *guard = caps;
        }
    }

    pub fn get_launched_actions(&self) -> Vec<LauncherAction> {
        self.launched_actions
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn get_opened_urls(&self) -> Vec<String> {
        self.opened_urls
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn get_opened_files(&self) -> Vec<String> {
        self.opened_files
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn get_opened_folders(&self) -> Vec<String> {
        self.opened_folders
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn get_opened_applications(&self) -> Vec<String> {
        self.opened_applications
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }
}

#[async_trait]
impl PlatformLauncher for MockLauncher {
    async fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn capabilities(&self) -> BbqResult<LauncherCapabilities> {
        Ok(*self.capabilities.lock().unwrap_or_else(|e| e.into_inner()))
    }

    async fn launch(&self, action: &LauncherAction) -> BbqResult<()> {
        if let Ok(mut guard) = self.launched_actions.lock() {
            guard.push(action.clone());
        }
        match action {
            LauncherAction::OpenUrl { url } => self.open_url(url).await,
            LauncherAction::OpenFile { path } => self.open_file(path).await,
            LauncherAction::OpenFolder { path } => self.open_folder(path).await,
            LauncherAction::OpenApplication { id } => self.open_application(id).await,
            LauncherAction::SystemAction(_) => Ok(()),
            LauncherAction::BbqAction(_) => Ok(()),
        }
    }

    async fn open_file(&self, path: &str) -> BbqResult<()> {
        if let Ok(mut guard) = self.opened_files.lock() {
            guard.push(path.to_string());
        }
        Ok(())
    }

    async fn open_folder(&self, path: &str) -> BbqResult<()> {
        if let Ok(mut guard) = self.opened_folders.lock() {
            guard.push(path.to_string());
        }
        Ok(())
    }

    async fn open_url(&self, url: &str) -> BbqResult<()> {
        bbq_core::validate_launcher_url(url)?;
        if let Ok(mut guard) = self.opened_urls.lock() {
            guard.push(url.to_string());
        }
        Ok(())
    }

    async fn open_application(&self, id: &str) -> BbqResult<()> {
        if let Ok(mut guard) = self.opened_applications.lock() {
            guard.push(id.to_string());
        }
        Ok(())
    }
}

#[derive(Clone, Default)]
pub struct MockHotkey {
    pub registered: Arc<Mutex<std::collections::HashMap<String, HotkeyDefinition>>>,
    pub simulated_conflicts: Arc<Mutex<std::collections::HashSet<String>>>,
    pub subscribers: Arc<Mutex<Vec<HotkeyEventSink>>>,
}

impl std::fmt::Debug for MockHotkey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MockHotkey")
            .field("registered", &self.registered)
            .field("simulated_conflicts", &self.simulated_conflicts)
            .finish()
    }
}

impl MockHotkey {
    pub fn simulate_hotkey_pressed(&self, id: &str) {
        if let Ok(subs) = self.subscribers.lock() {
            for sub in subs.iter() {
                sub(id.to_string());
            }
        }
    }

    pub fn simulate_conflict(&self, id: &str) {
        if let Ok(mut conf) = self.simulated_conflicts.lock() {
            conf.insert(id.to_string());
        }
    }

    pub fn registered_count(&self) -> usize {
        self.registered.lock().map(|r| r.len()).unwrap_or(0)
    }
}

#[async_trait]
impl PlatformHotkey for MockHotkey {
    async fn register(&self, hotkey: &HotkeyDefinition) -> BbqResult<()> {
        if let Ok(conf) = self.simulated_conflicts.lock() {
            if conf.contains(&hotkey.id) || conf.contains(&hotkey.display_str) {
                return Err(BbqError::Platform(format!(
                    "Hotkey '{}' is already in use by another application",
                    hotkey.display_str
                )));
            }
        }
        if let Ok(mut reg) = self.registered.lock() {
            reg.insert(hotkey.id.clone(), hotkey.clone());
        }
        Ok(())
    }

    async fn unregister(&self, id: &str) -> BbqResult<()> {
        if let Ok(mut reg) = self.registered.lock() {
            reg.remove(id);
        }
        Ok(())
    }

    async fn is_registered(&self, id: &str) -> BbqResult<bool> {
        if let Ok(reg) = self.registered.lock() {
            Ok(reg.contains_key(id))
        } else {
            Ok(false)
        }
    }

    async fn capabilities(&self) -> BbqResult<HotkeyCapabilities> {
        Ok(HotkeyCapabilities {
            can_register: true,
            can_unregister: true,
            can_detect_conflicts: true,
        })
    }

    async fn subscribe(&self, sink: HotkeyEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }
}
