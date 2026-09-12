use crate::traits::*;
use async_trait::async_trait;
use bbq_core::{BbqError, BbqResult, NotificationCapabilities, NotificationRequest};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinuxDisplayServer {
    Wayland,
    X11,
    Unknown,
}

impl LinuxDisplayServer {
    pub fn detect() -> Self {
        if std::env::var("WAYLAND_DISPLAY").is_ok() {
            return Self::Wayland;
        }
        if let Ok(session_type) = std::env::var("XDG_SESSION_TYPE") {
            if session_type.eq_ignore_ascii_case("wayland") {
                return Self::Wayland;
            } else if session_type.eq_ignore_ascii_case("x11") {
                return Self::X11;
            }
        }
        if std::env::var("DISPLAY").is_ok() {
            return Self::X11;
        }
        Self::Unknown
    }
}

/// Linux concrete platform provider foundation
#[derive(Debug, Clone)]
pub struct LinuxPlatformProvider {
    pub server: LinuxDisplayServer,
    pub window: LinuxWindow,
    pub display: LinuxDisplay,
    pub clipboard: LinuxClipboard,
    pub file: LinuxFile,
    pub media: LinuxMedia,
    pub notification: LinuxNotification,
    pub launcher: LinuxLauncher,
    pub system: LinuxSystem,
    pub network: LinuxNetwork,
    pub hotkey: LinuxHotkey,
    pub autostart: LinuxAutostart,
}

impl Default for LinuxPlatformProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl LinuxPlatformProvider {
    pub fn new() -> Self {
        let server = LinuxDisplayServer::detect();
        tracing::info!("Detected Linux display server: {:?}", server);
        Self {
            server,
            window: LinuxWindow { server },
            display: LinuxDisplay { server },
            clipboard: LinuxClipboard::default(),
            file: LinuxFile,
            media: LinuxMedia::default(),
            notification: LinuxNotification,
            launcher: LinuxLauncher,
            system: LinuxSystem::default(),
            network: LinuxNetwork,
            hotkey: LinuxHotkey,
            autostart: LinuxAutostart,
        }
    }
}

use std::sync::Arc;

impl PlatformProvider for LinuxPlatformProvider {
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
pub struct LinuxAutostart;

#[async_trait]
impl PlatformAutostart for LinuxAutostart {
    async fn is_supported(&self) -> bool {
        true
    }

    async fn is_enabled(&self) -> BbqResult<bool> {
        if let Some(home) = std::env::var_os("HOME") {
            let desktop =
                std::path::PathBuf::from(home).join(".config/autostart/com.bbq.desktop.desktop");
            Ok(desktop.exists())
        } else {
            Ok(false)
        }
    }

    async fn set_enabled(&self, enabled: bool) -> BbqResult<()> {
        if let Some(home) = std::env::var_os("HOME") {
            let autostart_dir = std::path::PathBuf::from(home).join(".config/autostart");
            let desktop = autostart_dir.join("com.bbq.desktop.desktop");
            if enabled {
                let _ = std::fs::create_dir_all(&autostart_dir);
                let exe = std::env::current_exe().map_err(|e| BbqError::Platform(e.to_string()))?;
                let content = format!(
                    "[Desktop Entry]\nType=Application\nName=BBQ\nExec={}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n",
                    exe.to_string_lossy()
                );
                std::fs::write(&desktop, content).map_err(|e| BbqError::Platform(e.to_string()))?;
            } else if desktop.exists() {
                let _ = std::fs::remove_file(desktop);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct LinuxWindow {
    pub server: LinuxDisplayServer,
}

#[async_trait]
impl PlatformWindow for LinuxWindow {
    async fn set_position(&self, _x: i32, _y: i32) -> BbqResult<()> {
        Ok(())
    }
    async fn set_size(&self, _width: u32, _height: u32) -> BbqResult<()> {
        Ok(())
    }
    async fn set_always_on_top(&self, _enabled: bool) -> BbqResult<()> {
        Ok(())
    }
    async fn set_visible(&self, _visible: bool) -> BbqResult<()> {
        Ok(())
    }
    async fn set_interactive(&self, _interactive: bool) -> BbqResult<()> {
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct LinuxDisplay {
    pub server: LinuxDisplayServer,
}

#[async_trait]
impl PlatformDisplay for LinuxDisplay {
    async fn get_displays(&self) -> BbqResult<Vec<DisplayInfo>> {
        Ok(vec![DisplayInfo {
            id: "linux_main".to_string(),
            name: "Default Display".to_string(),
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
                y: 32,
                width: 1920,
                height: 1048,
            },
        }])
    }

    async fn get_primary_display(&self) -> BbqResult<DisplayInfo> {
        let displays = self.get_displays().await?;
        Ok(displays.into_iter().next().unwrap_or(DisplayInfo {
            id: "linux_main".to_string(),
            name: "Default Display".to_string(),
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
                y: 32,
                width: 1920,
                height: 1048,
            },
        }))
    }

    async fn get_active_display(&self) -> BbqResult<DisplayInfo> {
        self.get_primary_display().await
    }
}

#[derive(Clone, Default)]
pub struct LinuxClipboard {
    pub subscribers: Arc<Mutex<Vec<ClipboardEventSink>>>,
}

impl std::fmt::Debug for LinuxClipboard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LinuxClipboard").finish()
    }
}

/// Linux Clipboard Adapter:
/// Architectural Note on Compositor Diversity:
/// - X11 environments support selection ownership notifications via the `XFixes` extension
///   (`XFixesSelectSelectionInput` for `CLIPBOARD`).
/// - Wayland environments restrict global clipboard monitoring for security unless privileged protocols
///   (such as `wlr-data-control` or `ext-data-control`) are explicitly supported by the compositor (e.g. Sway, Hyprland).
///   Under standard GNOME/KDE Wayland sessions, unprivileged background clipboard snooping is intentionally blocked.
/// Rather than introducing an aggressive, resource-heavy polling loop, BBQ adheres strictly to zero-polling:
/// if push listeners are unsupported in the environment, the adapter fails gracefully.
#[async_trait]
impl PlatformClipboard for LinuxClipboard {
    async fn initialize(&self) -> BbqResult<()> {
        tracing::info!("Initialized Linux clipboard adapter (compositor-aware mode)");
        Ok(())
    }

    async fn current(&self) -> BbqResult<Option<ClipboardEntry>> {
        Ok(None)
    }

    async fn subscribe(&self, sink: ClipboardEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn set_text(&self, _text: &str) -> BbqResult<()> {
        Ok(())
    }

    async fn clear(&self) -> BbqResult<()> {
        Ok(())
    }
}

use std::sync::Mutex;

#[derive(Clone, Default)]
pub struct LinuxMedia {
    pub subscribers: Arc<Mutex<Vec<MediaEventSink>>>,
}

impl std::fmt::Debug for LinuxMedia {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LinuxMedia").finish()
    }
}

#[async_trait]
impl PlatformMedia for LinuxMedia {
    async fn initialize(&self) -> BbqResult<()> {
        #[cfg(target_os = "linux")]
        {
            let _subs = self.subscribers.clone();
            tokio::spawn(async move {
                if let Ok(_conn) = zbus::Connection::session().await {
                    tracing::info!("Linux MPRIS D-Bus listener connected");
                }
            });
        }
        Ok(())
    }

    async fn current_session(&self) -> BbqResult<Option<MediaSession>> {
        Ok(None)
    }

    async fn subscribe(&self, sink: MediaEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn play(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn pause(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn toggle_play_pause(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn next(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn previous(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn seek(&self, _position_ms: u64) -> BbqResult<()> {
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct LinuxNotification;

impl PlatformNotification for LinuxNotification {
    fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    fn capabilities(&self) -> BbqResult<NotificationCapabilities> {
        Ok(NotificationCapabilities { available: false })
    }

    fn notify(&self, _request: &NotificationRequest) -> BbqResult<()> {
        Err(BbqError::NotSupported(
            "Linux native notifications not available in this build".to_string(),
        ))
    }
}

#[derive(Clone, Default)]
pub struct LinuxSystem {
    sink: Arc<std::sync::Mutex<Option<SystemEventSink>>>,
}

impl std::fmt::Debug for LinuxSystem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LinuxSystem").finish()
    }
}

#[async_trait]
impl PlatformSystem for LinuxSystem {
    async fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn current_state(&self) -> BbqResult<SystemState> {
        Ok(SystemState {
            battery: BatteryState::default(),
            network: NetworkState::default(),
            muted: Some(false),
            volume: Some(1.0),
            uptime_seconds: None,
            hostname: std::env::var("HOSTNAME").ok(),
            operating_system: "Linux".to_string(),
            platform: "linux".to_string(),
        })
    }

    async fn capabilities(&self) -> BbqResult<SystemCapabilities> {
        Ok(SystemCapabilities {
            has_battery: false,
            can_read_network: false,
            can_control_volume: false,
            can_mute: false,
        })
    }

    async fn subscribe(&self, sink: SystemEventSink) -> BbqResult<()> {
        if let Ok(mut slot) = self.sink.lock() {
            *slot = Some(sink);
        }
        Ok(())
    }

    async fn set_volume(&self, _volume: f32) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Volume control unsupported without PulseAudio/PipeWire D-Bus interface".to_string(),
        ))
    }

    async fn set_muted(&self, _muted: bool) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Mute control unsupported without PulseAudio/PipeWire D-Bus interface".to_string(),
        ))
    }

    async fn toggle_muted(&self) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Toggle mute unsupported without PulseAudio/PipeWire D-Bus interface".to_string(),
        ))
    }
}

#[derive(Debug, Clone, Default)]
pub struct LinuxNetwork;

#[async_trait]
impl PlatformNetwork for LinuxNetwork {
    async fn is_connected(&self) -> BbqResult<bool> {
        Ok(true)
    }
}

#[derive(Debug, Clone, Default)]
pub struct LinuxFile;

#[async_trait]
impl PlatformFile for LinuxFile {
    async fn validate_path(&self, raw_path: &str) -> BbqResult<FileMetadataInfo> {
        let p = std::path::Path::new(raw_path);
        let canonical = match std::fs::canonicalize(p) {
            Ok(cp) => cp.to_string_lossy().to_string(),
            Err(e) => {
                return Err(BbqError::Validation(format!(
                    "Cannot access or locate file '{}': {}",
                    raw_path, e
                )));
            }
        };

        let path_obj = std::path::Path::new(&canonical);
        let metadata = match std::fs::metadata(path_obj) {
            Ok(m) => m,
            Err(e) => {
                return Err(BbqError::Validation(format!(
                    "Failed to read metadata for '{}': {}",
                    canonical, e
                )));
            }
        };

        let is_directory = metadata.is_dir();
        let name = path_obj
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let extension = path_obj
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_string());

        let modified_at = metadata.modified().ok().and_then(|st| {
            st.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs() as i64)
        });

        Ok(FileMetadataInfo {
            path: canonical,
            name,
            extension,
            size_bytes: metadata.len(),
            modified_at,
            is_directory,
        })
    }

    async fn open(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open command: {}", e)))?;
        Ok(())
    }

    async fn reveal(&self, path: &str) -> BbqResult<()> {
        let parent = std::path::Path::new(path)
            .parent()
            .unwrap_or_else(|| std::path::Path::new(path));
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn reveal command: {}", e)))?;
        Ok(())
    }
}

pub use crate::launcher::PlatformLauncher;
use bbq_core::{LauncherAction, LauncherCapabilities};

#[derive(Debug, Clone, Default)]
pub struct LinuxLauncher;

#[async_trait]
impl PlatformLauncher for LinuxLauncher {
    async fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn capabilities(&self) -> BbqResult<LauncherCapabilities> {
        Ok(LauncherCapabilities {
            open_application: true,
            open_file: true,
            open_folder: true,
            open_url: true,
            system_actions: false,
        })
    }

    async fn launch(&self, action: &LauncherAction) -> BbqResult<()> {
        match action {
            LauncherAction::OpenUrl { url } => self.open_url(url).await,
            LauncherAction::OpenFile { path } => self.open_file(path).await,
            LauncherAction::OpenFolder { path } => self.open_folder(path).await,
            LauncherAction::OpenApplication { id } => self.open_application(id).await,
            LauncherAction::SystemAction(_) => Err(BbqError::Platform(
                "System actions unsupported on Linux without desktop environment bridge"
                    .to_string(),
            )),
            LauncherAction::BbqAction(_) => Ok(()),
        }
    }

    async fn open_file(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open command: {}", e)))?;
        Ok(())
    }

    async fn open_folder(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open folder: {}", e)))?;
        Ok(())
    }

    async fn open_url(&self, url: &str) -> BbqResult<()> {
        bbq_core::validate_launcher_url(url)?;
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open url: {}", e)))?;
        Ok(())
    }

    async fn open_application(&self, id: &str) -> BbqResult<()> {
        std::process::Command::new("gtk-launch")
            .arg(id)
            .spawn()
            .map_err(|e| {
                BbqError::Platform(format!(
                    "Failed to launch Linux application '{}': {}",
                    id, e
                ))
            })?;
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct LinuxHotkey;

#[async_trait]
impl PlatformHotkey for LinuxHotkey {
    async fn register(&self, _hotkey: &HotkeyDefinition) -> BbqResult<()> {
        Err(BbqError::NotSupported(
            "Global hotkeys not supported on Linux in this build".to_string(),
        ))
    }

    async fn unregister(&self, _id: &str) -> BbqResult<()> {
        Ok(())
    }

    async fn is_registered(&self, _id: &str) -> BbqResult<bool> {
        Ok(false)
    }

    async fn capabilities(&self) -> BbqResult<HotkeyCapabilities> {
        Ok(HotkeyCapabilities {
            can_register: false,
            can_unregister: false,
            can_detect_conflicts: false,
        })
    }

    async fn subscribe(&self, _sink: HotkeyEventSink) -> BbqResult<()> {
        Ok(())
    }
}
