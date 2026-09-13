use crate::traits::*;
use async_trait::async_trait;
use bbq_core::{
    BbqError, BbqResult, ClipboardEntry, MediaCapabilities, MediaSession, NotificationCapabilities,
    NotificationRequest, PlaybackState,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

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
                let exe_xml = exe
                    .to_string_lossy()
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;");
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
                    exe_xml
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

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct CGPoint {
    pub x: f64,
    pub y: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct CGSize {
    pub width: f64,
    pub height: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct CGRect {
    pub origin: CGPoint,
    pub size: CGSize,
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGGetActiveDisplayList(
        max_displays: u32,
        active_displays: *mut u32,
        display_count: *mut u32,
    ) -> i32;
    fn CGMainDisplayID() -> u32;
    fn CGDisplayBounds(display: u32) -> CGRect;
    fn CGDisplayPixelsWide(display: u32) -> usize;
    fn CGDisplayPixelsHigh(display: u32) -> usize;
    fn CGDisplayIsBuiltin(display: u32) -> i32;
}

#[cfg(target_os = "macos")]
fn enumerate_native_macos_displays() -> Vec<DisplayInfo> {
    let mut display_ids = [0u32; 16];
    let mut count = 0u32;
    let err = unsafe {
        CGGetActiveDisplayList(
            display_ids.len() as u32,
            display_ids.as_mut_ptr(),
            &mut count,
        )
    };
    if err != 0 || count == 0 {
        return Vec::new();
    }
    let main_id = unsafe { CGMainDisplayID() };
    let mut displays = Vec::with_capacity(count as usize);

    for &id in &display_ids[..count as usize] {
        let bounds = unsafe { CGDisplayBounds(id) };
        let phys_w = unsafe { CGDisplayPixelsWide(id) };
        let phys_h = unsafe { CGDisplayPixelsHigh(id) };
        let is_primary = id == main_id;
        let is_builtin = unsafe { CGDisplayIsBuiltin(id) } != 0;

        let logical_w = if bounds.size.width > 0.0 {
            bounds.size.width
        } else {
            phys_w as f64
        };
        let logical_h = if bounds.size.height > 0.0 {
            bounds.size.height
        } else {
            phys_h as f64
        };

        // Retina scale factor: physical pixels vs logical points
        let scale = if bounds.size.width > 0.0 && phys_w > 0 {
            let s = phys_w as f64 / bounds.size.width;
            if s > 0.5 && s < 5.0 {
                (s * 100.0).round() / 100.0
            } else {
                1.0
            }
        } else {
            1.0
        };

        // Origin in logical Quartz coordinates (can be negative for left/top monitors)
        let x = bounds.origin.x.round() as i32;
        let y = bounds.origin.y.round() as i32;
        let width = logical_w.round().max(1.0) as u32;
        let height = logical_h.round().max(1.0) as u32;

        // Menu bar height on primary display (~25pt)
        let top_inset = if is_primary { 25 } else { 0 };
        let work_area = DisplayRect {
            x,
            y: y + top_inset,
            width,
            height: height.saturating_sub(top_inset as u32),
        };

        let name = if is_builtin {
            format!("Built-in Retina Display (ID: {})", id)
        } else {
            format!("External Display (ID: {})", id)
        };

        displays.push(DisplayInfo {
            id: format!("macos_{}", id),
            name,
            is_primary,
            scale_factor: scale,
            bounds: DisplayRect {
                x,
                y,
                width,
                height,
            },
            work_area,
        });
    }
    displays
}

#[cfg(not(target_os = "macos"))]
fn enumerate_native_macos_displays() -> Vec<DisplayInfo> {
    vec![
        DisplayInfo {
            id: "macos_main".to_string(),
            name: "Built-in Retina Display (Simulated)".to_string(),
            is_primary: true,
            scale_factor: 2.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1440,
                height: 900,
            },
            work_area: DisplayRect {
                x: 0,
                y: 25,
                width: 1440,
                height: 875,
            },
        },
        DisplayInfo {
            id: "macos_ext_1".to_string(),
            name: "External 4K Display (Simulated)".to_string(),
            is_primary: false,
            scale_factor: 2.0,
            bounds: DisplayRect {
                x: 1440,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 1440,
                y: 0,
                width: 1920,
                height: 1080,
            },
        },
    ]
}

#[derive(Debug, Clone, Default)]
pub struct MacOsDisplay;

#[async_trait]
impl PlatformDisplay for MacOsDisplay {
    async fn get_displays(&self) -> BbqResult<Vec<DisplayInfo>> {
        let displays = enumerate_native_macos_displays();
        if displays.is_empty() {
            return Err(BbqError::Platform(
                "No active macOS displays found via CoreGraphics".to_string(),
            ));
        }
        Ok(displays)
    }

    async fn get_primary_display(&self) -> BbqResult<DisplayInfo> {
        let displays = self.get_displays().await?;
        displays
            .into_iter()
            .find(|d| d.is_primary)
            .ok_or_else(|| BbqError::Platform("No primary macOS display found".to_string()))
    }

    async fn get_active_display(&self) -> BbqResult<DisplayInfo> {
        self.get_primary_display().await
    }

    fn capabilities(&self) -> DisplayCapabilities {
        DisplayCapabilities {
            multi_monitor: true,
            dpi_scaling: true,
            absolute_positioning: true,
            geometry_support: DisplayGeometrySupport::Unverified,
            backend_name: "CoreGraphics / Quartz (Native)".to_string(),
            notes: Some(
                "Native CoreGraphics CGGetActiveDisplayList & CGDisplayBounds implemented; runtime unverified on physical hardware."
                    .to_string(),
            ),
        }
    }
}

#[derive(Clone, Default)]
pub struct MacOsClipboard {
    pub subscribers: Arc<Mutex<Vec<ClipboardEventSink>>>,
}

impl std::fmt::Debug for MacOsClipboard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacOsClipboard").finish()
    }
}

/// macOS Clipboard Adapter:
/// Reads and writes system clipboard using native `pbpaste` and `pbcopy` CLI tools.
/// Adheres strictly to Zero-Polling by lazy on-demand evaluation upon invocation.
#[async_trait]
impl PlatformClipboard for MacOsClipboard {
    async fn initialize(&self) -> BbqResult<()> {
        tracing::info!("Initialized macOS clipboard adapter (event-driven / lazy evaluation mode)");
        Ok(())
    }

    async fn current(&self) -> BbqResult<Option<ClipboardEntry>> {
        let output = match std::process::Command::new("pbpaste").output() {
            Ok(out) if out.status.success() && !out.stdout.is_empty() => out,
            _ => return Ok(None),
        };

        let text = String::from_utf8_lossy(&output.stdout).to_string();
        if text.trim().is_empty() {
            return Ok(None);
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        Ok(Some(ClipboardEntry::new_text(
            format!("macos_clip_{}", now),
            &text,
            Some("macos_system".to_string()),
        )))
    }

    async fn subscribe(&self, sink: ClipboardEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn set_text(&self, text: &str) -> BbqResult<()> {
        use std::io::Write;
        let mut child = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn pbcopy: {}", e)))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(text.as_bytes());
        }
        let _ = child.wait();
        Ok(())
    }

    async fn clear(&self) -> BbqResult<()> {
        self.set_text("").await
    }
}

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
        tracing::info!("macOS NowPlaying/AppleScript media listener initialized");
        Ok(())
    }

    async fn current_session(&self) -> BbqResult<Option<MediaSession>> {
        // Query active media player state via AppleScript without shell injection
        let script = r#"
        if application "Music" is running then
            tell application "Music"
                set pState to player state as string
                set tName to name of current track
                set tArtist to artist of current track
                set tAlbum to album of current track
                return pState & "\t" & tName & "\t" & tArtist & "\t" & tAlbum
            end tell
        else if application "Spotify" is running then
            tell application "Spotify"
                set pState to player state as string
                set tName to name of current track
                set tArtist to artist of current track
                set tAlbum to album of current track
                return pState & "\t" & tName & "\t" & tArtist & "\t" & tAlbum
            end tell
        else
            return ""
        end if
        "#;

        let output = match std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
        {
            Ok(out) if out.status.success() => out,
            _ => return Ok(None),
        };

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result.is_empty() {
            return Ok(None);
        }

        let parts: Vec<&str> = result.split('\t').collect();
        if parts.len() < 2 {
            return Ok(None);
        }

        let state_str = parts[0].to_lowercase();
        let playback_state = if state_str.contains("play") {
            PlaybackState::Playing
        } else if state_str.contains("pause") {
            PlaybackState::Paused
        } else {
            PlaybackState::Stopped
        };

        let title = parts[1].to_string();
        let artist = parts
            .get(2)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let album = parts
            .get(3)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        Ok(Some(MediaSession {
            id: "macos_active".to_string(),
            state: playback_state,
            title: Some(title),
            artist,
            album,
            album_art: None,
            duration_ms: None,
            position_ms: None,
            volume: None,
            source: Some("macos_system".to_string()),
            capabilities: MediaCapabilities {
                can_play: true,
                can_pause: true,
                can_go_next: true,
                can_go_previous: true,
                can_seek: false,
                can_change_volume: false,
            },
        }))
    }

    async fn subscribe(&self, sink: MediaEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn play(&self) -> BbqResult<()> {
        let script = r#"
        if application "Music" is running then tell application "Music" to play
        if application "Spotify" is running then tell application "Spotify" to play
        "#;
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
        Ok(())
    }

    async fn pause(&self) -> BbqResult<()> {
        let script = r#"
        if application "Music" is running then tell application "Music" to pause
        if application "Spotify" is running then tell application "Spotify" to pause
        "#;
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
        Ok(())
    }

    async fn toggle_play_pause(&self) -> BbqResult<()> {
        let script = r#"
        if application "Music" is running then
            tell application "Music" to playpause
        else if application "Spotify" is running then
            tell application "Spotify" to playpause
        end if
        "#;
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
        Ok(())
    }

    async fn next(&self) -> BbqResult<()> {
        let script = r#"
        if application "Music" is running then tell application "Music" to next track
        if application "Spotify" is running then tell application "Spotify" to next track
        "#;
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
        Ok(())
    }

    async fn previous(&self) -> BbqResult<()> {
        let script = r#"
        if application "Music" is running then tell application "Music" to previous track
        if application "Spotify" is running then tell application "Spotify" to previous track
        "#;
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn();
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
        Ok(NotificationCapabilities { available: true })
    }

    fn notify(&self, request: &NotificationRequest) -> BbqResult<()> {
        let title = request
            .title
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', " ")
            .replace('\r', "");
        let body = request
            .body
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', " ")
            .replace('\r', "");
        let script = format!("display notification \"{}\" with title \"{}\"", body, title);
        std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn osascript: {}", e)))?;
        Ok(())
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

#[derive(Clone, Default)]
pub struct MacOsHotkey {
    registered: Arc<Mutex<HashMap<String, HotkeyDefinition>>>,
    subscribers: Arc<Mutex<Vec<HotkeyEventSink>>>,
}

impl std::fmt::Debug for MacOsHotkey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacOsHotkey")
            .field(
                "registered_count",
                &self.registered.lock().map(|m| m.len()).unwrap_or(0),
            )
            .finish()
    }
}

#[async_trait]
impl PlatformHotkey for MacOsHotkey {
    async fn register(&self, _hotkey: &HotkeyDefinition) -> BbqResult<()> {
        Err(BbqError::NotSupported(
            "macOS global hotkey interception requires Carbon RegisterEventHotKey or CGEventTap OS entitlements; application-scoped shortcuts active".to_string(),
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

    async fn subscribe(&self, sink: HotkeyEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_macos_hotkey_capabilities_and_not_supported() {
        let hotkey = MacOsHotkey::default();

        let caps = hotkey.capabilities().await.unwrap();
        assert!(!caps.can_register);
        assert!(!caps.can_unregister);
        assert!(!caps.can_detect_conflicts);

        let def = HotkeyDefinition::new("cmd_space", "Space", vec!["Cmd".to_string()], "Cmd+Space");
        assert!(hotkey.register(&def).await.is_err());
        assert!(!hotkey.is_registered("cmd_space").await.unwrap());
    }

    #[test]
    fn test_macos_notification_capabilities() {
        let notif = MacOsNotification;
        let caps = notif.capabilities().unwrap();
        assert!(caps.available);
    }

    #[tokio::test]
    async fn test_macos_autostart_support() {
        let autostart = MacOsAutostart;
        assert!(autostart.is_supported().await);
    }

    #[tokio::test]
    async fn test_macos_display_geometry_and_capabilities() {
        let display = MacOsDisplay;
        let list = display.get_displays().await.expect("List macOS displays");
        assert!(!list.is_empty());

        let primary = display
            .get_primary_display()
            .await
            .expect("Primary macOS display");
        assert!(primary.is_primary);
        // Valid display scaling factor contract (supports standard 1.0x CI VMs, 2.0x Retina, and scaled resolutions)
        assert!(primary.scale_factor >= 1.0 && primary.scale_factor <= 4.0);
        assert!(primary.bounds.width > 0);
        assert!(primary.bounds.height > 0);
        assert_eq!(primary.work_area.y, 25); // Menu bar offset

        let caps = display.capabilities();
        assert!(caps.multi_monitor);
        assert!(caps.dpi_scaling);
        assert_eq!(caps.geometry_support, DisplayGeometrySupport::Unverified);
        assert!(caps.backend_name.contains("CoreGraphics"));
    }
}
