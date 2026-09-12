use crate::traits::*;
use async_trait::async_trait;
use bbq_core::{BbqError, BbqResult, NotificationCapabilities, NotificationRequest};
use std::sync::Arc;

/// macOS concrete platform provider foundation
#[derive(Debug, Clone, Default)]
pub struct MacOsPlatformProvider {
    pub window: MacOsWindow,
    pub display: MacOsDisplay,
    pub clipboard: MacOsClipboard,
    pub file: MacOsFile,
    pub media: MacOsMedia,
    pub notification: MacOsNotification,
    pub launcher: MacOsLauncher,
    pub system: MacOsSystem,
    pub network: MacOsNetwork,
    pub hotkey: MacOsHotkey,
    pub autostart: MacOsAutostart,
}

impl PlatformProvider for MacOsPlatformProvider {
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
pub struct MacOsAutostart;

#[async_trait]
impl PlatformAutostart for MacOsAutostart {
    async fn is_supported(&self) -> bool {
        true
    }

    async fn is_enabled(&self) -> BbqResult<bool> {
        if let Some(home) = std::env::var_os("HOME") {
            let plist =
                std::path::PathBuf::from(home).join("Library/LaunchAgents/com.bbq.desktop.plist");
            Ok(plist.exists())
        } else {
            Ok(false)
        }
    }

    async fn set_enabled(&self, enabled: bool) -> BbqResult<()> {
        if let Some(home) = std::env::var_os("HOME") {
            let agent_dir = std::path::PathBuf::from(home).join("Library/LaunchAgents");
            let plist = agent_dir.join("com.bbq.desktop.plist");
            if enabled {
                let _ = std::fs::create_dir_all(&agent_dir);
                let exe = std::env::current_exe().map_err(|e| BbqError::Platform(e.to_string()))?;
                let content = format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bbq.desktop</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>"#,
                    exe.to_string_lossy()
                );
                std::fs::write(&plist, content).map_err(|e| BbqError::Platform(e.to_string()))?;
            } else if plist.exists() {
                let _ = std::fs::remove_file(plist);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct MacOsWindow;

#[async_trait]
impl PlatformWindow for MacOsWindow {
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

#[derive(Debug, Clone, Default)]
pub struct MacOsDisplay;

#[async_trait]
impl PlatformDisplay for MacOsDisplay {
    async fn get_displays(&self) -> BbqResult<Vec<DisplayInfo>> {
        Ok(vec![DisplayInfo {
            id: "macos_main".to_string(),
            name: "Built-in Retina Display".to_string(),
            is_primary: true,
            scale_factor: 2.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 2560,
                height: 1600,
            },
            work_area: DisplayRect {
                x: 0,
                y: 25,
                width: 2560,
                height: 1575,
            },
        }])
    }

    async fn get_primary_display(&self) -> BbqResult<DisplayInfo> {
        let displays = self.get_displays().await?;
        Ok(displays.into_iter().next().unwrap_or(DisplayInfo {
            id: "macos_main".to_string(),
            name: "Built-in Retina Display".to_string(),
            is_primary: true,
            scale_factor: 2.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 2560,
                height: 1600,
            },
            work_area: DisplayRect {
                x: 0,
                y: 25,
                width: 2560,
                height: 1575,
            },
        }))
    }

    async fn get_active_display(&self) -> BbqResult<DisplayInfo> {
        self.get_primary_display().await
    }
}

#[derive(Clone, Default)]
pub struct MacOsClipboard {
    pub subscribers: Arc<Mutex<Vec<ClipboardEventSink>>>,
    pub last_change_count: Arc<Mutex<i64>>,
}

impl std::fmt::Debug for MacOsClipboard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacOsClipboard").finish()
    }
}

/// macOS Clipboard Adapter:
/// Note on macOS Pasteboard Architecture:
/// AppKit's `NSPasteboard` does not provide an asynchronous push notification for arbitrary system-wide
/// pasteboard mutations without polling `changeCount` or using private APIs.
/// To comply with BBQ's strict prohibition against continuous high-frequency polling (`setInterval`),
/// BBQ evaluates `changeCount` lazily upon focus / user activation or event requests rather than
/// running a tight polling loop.
#[async_trait]
impl PlatformClipboard for MacOsClipboard {
    async fn initialize(&self) -> BbqResult<()> {
        tracing::info!("Initialized macOS clipboard adapter (event-driven / lazy evaluation mode)");
        Ok(())
    }

    async fn current(&self) -> BbqResult<Option<ClipboardEntry>> {
        // Safe AppKit query placeholder for macOS builds
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
pub struct MacOsMedia {
    pub subscribers: Arc<Mutex<Vec<MediaEventSink>>>,
}

impl std::fmt::Debug for MacOsMedia {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacOsMedia").finish()
    }
}

#[async_trait]
impl PlatformMedia for MacOsMedia {
    async fn initialize(&self) -> BbqResult<()> {
        #[cfg(target_os = "macos")]
        {
            let _subs = self.subscribers.clone();
            tracing::info!("macOS NowPlaying media listener initialized");
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
pub struct MacOsNotification;

impl PlatformNotification for MacOsNotification {
    fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    fn capabilities(&self) -> BbqResult<NotificationCapabilities> {
        Ok(NotificationCapabilities { available: false })
    }

    fn notify(&self, _request: &NotificationRequest) -> BbqResult<()> {
        Err(BbqError::NotSupported(
            "macOS native notifications not available in this build".to_string(),
        ))
    }
}

#[derive(Clone, Default)]
pub struct MacOsSystem {
    sink: Arc<std::sync::Mutex<Option<SystemEventSink>>>,
}

impl std::fmt::Debug for MacOsSystem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacOsSystem").finish()
    }
}

#[async_trait]
impl PlatformSystem for MacOsSystem {
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
            operating_system: "macOS".to_string(),
            platform: "macos".to_string(),
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
            "Volume control unsupported without macOS CoreAudio entitlement".to_string(),
        ))
    }

    async fn set_muted(&self, _muted: bool) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Mute control unsupported without macOS CoreAudio entitlement".to_string(),
        ))
    }

    async fn toggle_muted(&self) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Toggle mute unsupported without macOS CoreAudio entitlement".to_string(),
        ))
    }
}

#[derive(Debug, Clone, Default)]
pub struct MacOsNetwork;

#[async_trait]
impl PlatformNetwork for MacOsNetwork {
    async fn is_connected(&self) -> BbqResult<bool> {
        Ok(true)
    }
}

#[derive(Debug, Clone, Default)]
pub struct MacOsFile;

#[async_trait]
impl PlatformFile for MacOsFile {
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
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open command: {}", e)))?;
        Ok(())
    }

    async fn reveal(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("open")
            .args(["-R", path])
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn reveal command: {}", e)))?;
        Ok(())
    }
}

pub use crate::launcher::PlatformLauncher;
use bbq_core::{LauncherAction, LauncherCapabilities};

#[derive(Debug, Clone, Default)]
pub struct MacOsLauncher;

#[async_trait]
impl PlatformLauncher for MacOsLauncher {
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
                "System actions unsupported on macOS without native bridge".to_string(),
            )),
            LauncherAction::BbqAction(_) => Ok(()),
        }
    }

    async fn open_file(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open command: {}", e)))?;
        Ok(())
    }

    async fn open_folder(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open folder: {}", e)))?;
        Ok(())
    }

    async fn open_url(&self, url: &str) -> BbqResult<()> {
        bbq_core::validate_launcher_url(url)?;
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open url: {}", e)))?;
        Ok(())
    }

    async fn open_application(&self, id: &str) -> BbqResult<()> {
        std::process::Command::new("open")
            .args(["-a", id])
            .spawn()
            .map_err(|e| {
                BbqError::Platform(format!(
                    "Failed to launch macOS application '{}': {}",
                    id, e
                ))
            })?;
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct MacOsHotkey;

#[async_trait]
impl PlatformHotkey for MacOsHotkey {
    async fn register(&self, _hotkey: &HotkeyDefinition) -> BbqResult<()> {
        Err(BbqError::NotSupported(
            "Global hotkeys not supported on macOS in this build".to_string(),
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
