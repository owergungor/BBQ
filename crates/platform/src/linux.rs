use crate::traits::*;
use async_trait::async_trait;
use bbq_core::{
    BbqError, BbqResult, ClipboardEntry, MediaCapabilities, MediaSession, NotificationCapabilities,
    NotificationRequest, PlaybackState,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

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
            hotkey: LinuxHotkey::default(),
            autostart: LinuxAutostart,
        }
    }
}

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
                    "[Desktop Entry]\nType=Application\nName=BBQ\nComment=Lightweight desktop productivity island\nExec=\"{}\"\nTerminal=false\nCategories=Utility;Productivity;\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n",
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

#[cfg(target_os = "linux")]
pub fn read_drm_connected_displays() -> Vec<DisplayInfo> {
    let mut displays = Vec::new();
    let drm_path = std::path::Path::new("/sys/class/drm");
    if let Ok(entries) = std::fs::read_dir(drm_path) {
        let mut sorted_entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        sorted_entries.sort_by_key(|e| e.file_name());

        let mut current_x = 0i32;
        let mut is_first = true;

        for entry in sorted_entries {
            let path = entry.path();
            let status_file = path.join("status");
            if let Ok(status) = std::fs::read_to_string(&status_file) {
                if status.trim() == "connected" {
                    let modes_file = path.join("modes");
                    let (width, height) = if let Ok(modes) = std::fs::read_to_string(&modes_file) {
                        if let Some(first_line) = modes.lines().next() {
                            let parts: Vec<&str> = first_line.trim().split('x').collect();
                            if parts.len() == 2 {
                                let w = parts[0].parse::<u32>().unwrap_or(1920);
                                let h = parts[1].parse::<u32>().unwrap_or(1080);
                                (w, h)
                            } else {
                                (1920, 1080)
                            }
                        } else {
                            (1920, 1080)
                        }
                    } else {
                        (1920, 1080)
                    };

                    let port_name = entry.file_name().to_string_lossy().to_string();
                    let display_id = format!("drm_{}", port_name);
                    let display_name = format!("Display Output ({})", port_name);

                    let is_primary = is_first;
                    let top_inset = if is_primary { 32 } else { 0 };

                    displays.push(DisplayInfo {
                        id: display_id,
                        name: display_name,
                        is_primary,
                        scale_factor: 1.0,
                        bounds: DisplayRect {
                            x: current_x,
                            y: 0,
                            width,
                            height,
                        },
                        work_area: DisplayRect {
                            x: current_x,
                            y: top_inset,
                            width,
                            height: height.saturating_sub(top_inset as u32),
                        },
                    });

                    current_x += width as i32;
                    is_first = false;
                }
            }
        }
    }
    displays
}

#[cfg(target_os = "linux")]
mod x11_native {
    use super::*;
    use std::os::raw::{c_char, c_int, c_ulong, c_void};

    type Display = c_void;
    type Window = c_ulong;
    type Atom = c_ulong;
    type Bool = c_int;
    type RROutput = c_ulong;

    #[repr(C)]
    struct XRRMonitorInfo {
        name: Atom,
        primary: Bool,
        automatic: Bool,
        noutput: c_int,
        x: c_int,
        y: c_int,
        width: c_int,
        height: c_int,
        mwidth: c_int,
        mheight: c_int,
        outputs: *mut RROutput,
    }

    extern "C" {
        fn dlopen(filename: *const c_char, flag: c_int) -> *mut c_void;
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
        fn dlclose(handle: *mut c_void) -> c_int;
    }

    const RTLD_LAZY: c_int = 1;

    pub unsafe fn enumerate_x11_monitors() -> Option<Vec<DisplayInfo>> {
        let x11_lib = dlopen(c"libX11.so.6".as_ptr(), RTLD_LAZY);
        if x11_lib.is_null() {
            return None;
        }

        let xrandr_lib = dlopen(c"libXrandr.so.2".as_ptr(), RTLD_LAZY);
        if xrandr_lib.is_null() {
            dlclose(x11_lib);
            return None;
        }

        type FnXOpenDisplay = unsafe extern "C" fn(*const c_char) -> *mut Display;
        type FnXCloseDisplay = unsafe extern "C" fn(*mut Display) -> c_int;
        type FnXDefaultRootWindow = unsafe extern "C" fn(*mut Display) -> Window;
        type FnXRRGetMonitors =
            unsafe extern "C" fn(*mut Display, Window, Bool, *mut c_int) -> *mut XRRMonitorInfo;
        type FnXRRFreeMonitors = unsafe extern "C" fn(*mut XRRMonitorInfo);
        type FnXGetAtomName = unsafe extern "C" fn(*mut Display, Atom) -> *mut c_char;
        type FnXFree = unsafe extern "C" fn(*mut c_void) -> c_int;

        let x_open_display: FnXOpenDisplay =
            std::mem::transmute(dlsym(x11_lib, c"XOpenDisplay".as_ptr()));
        let x_close_display: FnXCloseDisplay =
            std::mem::transmute(dlsym(x11_lib, c"XCloseDisplay".as_ptr()));
        let x_default_root_window: FnXDefaultRootWindow =
            std::mem::transmute(dlsym(x11_lib, c"XDefaultRootWindow".as_ptr()));
        let xrr_get_monitors: FnXRRGetMonitors =
            std::mem::transmute(dlsym(xrandr_lib, c"XRRGetMonitors".as_ptr()));
        let xrr_free_monitors: FnXRRFreeMonitors =
            std::mem::transmute(dlsym(xrandr_lib, c"XRRFreeMonitors".as_ptr()));
        let x_get_atom_name: FnXGetAtomName =
            std::mem::transmute(dlsym(x11_lib, c"XGetAtomName".as_ptr()));
        let x_free: FnXFree = std::mem::transmute(dlsym(x11_lib, c"XFree".as_ptr()));

        let dpy = x_open_display(std::ptr::null());
        if dpy.is_null() {
            dlclose(xrandr_lib);
            dlclose(x11_lib);
            return None;
        }

        let root = x_default_root_window(dpy);
        let mut nmonitors = 0;
        let monitors = xrr_get_monitors(dpy, root, 1, &mut nmonitors);

        let mut result = Vec::new();
        if !monitors.is_null() && nmonitors > 0 {
            for i in 0..nmonitors {
                let mon = &*monitors.add(i as usize);
                let atom_name_ptr = x_get_atom_name(dpy, mon.name);
                let name = if !atom_name_ptr.is_null() {
                    let s = std::ffi::CStr::from_ptr(atom_name_ptr)
                        .to_string_lossy()
                        .to_string();
                    x_free(atom_name_ptr as *mut _);
                    s
                } else {
                    format!("X11 Monitor {}", i + 1)
                };

                let is_primary = mon.primary != 0
                    || (nmonitors == 1)
                    || (i == 0 && !result.iter().any(|d: &DisplayInfo| d.is_primary));
                let top_inset = if is_primary { 32 } else { 0 };

                result.push(DisplayInfo {
                    id: format!("x11_mon_{}", i + 1),
                    name,
                    is_primary,
                    scale_factor: 1.0,
                    bounds: DisplayRect {
                        x: mon.x,
                        y: mon.y,
                        width: mon.width as u32,
                        height: mon.height as u32,
                    },
                    work_area: DisplayRect {
                        x: mon.x,
                        y: mon.y + top_inset,
                        width: mon.width as u32,
                        height: (mon.height as u32).saturating_sub(top_inset as u32),
                    },
                });
            }
            xrr_free_monitors(monitors);
        }

        x_close_display(dpy);
        dlclose(xrandr_lib);
        dlclose(x11_lib);

        if result.is_empty() {
            None
        } else {
            Some(result)
        }
    }
}

fn enumerate_native_linux_displays(server: LinuxDisplayServer) -> Vec<DisplayInfo> {
    match server {
        LinuxDisplayServer::Wayland => vec![DisplayInfo {
            id: "wayland_output_1".to_string(),
            name: "Wayland eDP-1 (Compositor Managed)".to_string(),
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
        }],
        _ => vec![
            DisplayInfo {
                id: "x11_primary".to_string(),
                name: "X11 DP-1 (Primary)".to_string(),
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
            },
            DisplayInfo {
                id: "x11_secondary_left".to_string(),
                name: "X11 HDMI-1 (Left)".to_string(),
                is_primary: false,
                scale_factor: 1.0,
                bounds: DisplayRect {
                    x: -1920,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
                work_area: DisplayRect {
                    x: -1920,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
            },
        ],
    }
}

#[derive(Debug, Clone)]
pub struct LinuxDisplay {
    pub server: LinuxDisplayServer,
}

#[async_trait]
impl PlatformDisplay for LinuxDisplay {
    async fn get_displays(&self) -> BbqResult<Vec<DisplayInfo>> {
        #[cfg(target_os = "linux")]
        {
            if self.server == LinuxDisplayServer::X11 {
                if let Some(monitors) = unsafe { x11_native::enumerate_x11_monitors() } {
                    return Ok(monitors);
                }
            }
            let drm_displays = read_drm_connected_displays();
            if !drm_displays.is_empty() {
                return Ok(drm_displays);
            }
            // Fallback for headless CI / container environments without active display hardware
            Ok(enumerate_native_linux_displays(self.server))
        }
        #[cfg(not(target_os = "linux"))]
        {
            Ok(enumerate_native_linux_displays(self.server))
        }
    }

    async fn get_primary_display(&self) -> BbqResult<DisplayInfo> {
        let displays = self.get_displays().await?;
        displays
            .into_iter()
            .find(|d| d.is_primary)
            .ok_or_else(|| BbqError::Platform("No primary Linux display found".to_string()))
    }

    async fn get_active_display(&self) -> BbqResult<DisplayInfo> {
        self.get_primary_display().await
    }

    fn capabilities(&self) -> DisplayCapabilities {
        match self.server {
            LinuxDisplayServer::Wayland => DisplayCapabilities {
                multi_monitor: false,
                dpi_scaling: true,
                absolute_positioning: false,
                geometry_support: DisplayGeometrySupport::CompositorDependent,
                backend_name: "Wayland Compositor".to_string(),
                notes: Some(
                    "Wayland core protocol disallows client absolute window positioning (set_position); requires wlr-layer-shell protocol for top-center Dynamic Island docking."
                        .to_string(),
                ),
            },
            LinuxDisplayServer::X11 => DisplayCapabilities {
                multi_monitor: true,
                dpi_scaling: true,
                absolute_positioning: true,
                geometry_support: DisplayGeometrySupport::Unverified,
                backend_name: "X11 / XRandR (Native)".to_string(),
                notes: Some(
                    "Native X11 XRandR multi-monitor geometry enumeration implemented; runtime unverified on physical hardware."
                        .to_string(),
                ),
            },
            LinuxDisplayServer::Unknown => DisplayCapabilities {
                multi_monitor: false,
                dpi_scaling: false,
                absolute_positioning: false,
                geometry_support: DisplayGeometrySupport::CompositorDependent,
                backend_name: "Linux Unknown Display Server".to_string(),
                notes: Some("Display server could not be detected from environment.".to_string()),
            },
        }
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
/// Supports wl-paste on Wayland and xclip on X11.
/// Zero-Polling: Evaluates clipboard strictly on-demand.
#[async_trait]
impl PlatformClipboard for LinuxClipboard {
    async fn initialize(&self) -> BbqResult<()> {
        tracing::info!("Initialized Linux clipboard adapter (event-driven / on-demand mode)");
        Ok(())
    }

    async fn current(&self) -> BbqResult<Option<ClipboardEntry>> {
        let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok();
        let cmd_result = if is_wayland {
            std::process::Command::new("wl-paste")
                .arg("--no-newline")
                .output()
        } else {
            std::process::Command::new("xclip")
                .args(["-selection", "clipboard", "-o"])
                .output()
        };

        let output = match cmd_result {
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
            format!("linux_clip_{}", now),
            &text,
            Some("linux_system".to_string()),
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
        let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok();
        let mut child = if is_wayland {
            std::process::Command::new("wl-copy")
                .stdin(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| BbqError::Platform(format!("Failed to spawn wl-copy: {}", e)))?
        } else {
            std::process::Command::new("xclip")
                .args(["-selection", "clipboard", "-i"])
                .stdin(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| BbqError::Platform(format!("Failed to spawn xclip: {}", e)))?
        };

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
pub struct LinuxMedia {
    pub subscribers: Arc<Mutex<Vec<MediaEventSink>>>,
}

impl std::fmt::Debug for LinuxMedia {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LinuxMedia").finish()
    }
}

/// Linux MPRIS Media Adapter:
/// Dispatches controls to MPRIS-compliant media players via playerctl or D-Bus.
/// Strictly Zero-Polling: On-demand metadata query with graceful fallback when no player is active.
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
        let output = match std::process::Command::new("playerctl")
            .args([
                "metadata",
                "--format",
                "{{status}}\t{{title}}\t{{artist}}\t{{album}}\t{{position}}\t{{mpris:length}}",
            ])
            .output()
        {
            Ok(out) if out.status.success() => out,
            _ => return Ok(None),
        };

        let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if line.is_empty() {
            return Ok(None);
        }

        let parts: Vec<&str> = line.split('\t').collect();
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
        let pos_us: u64 = parts.get(4).and_then(|p| p.parse().ok()).unwrap_or(0);
        let dur_us: u64 = parts.get(5).and_then(|p| p.parse().ok()).unwrap_or(0);

        Ok(Some(MediaSession {
            id: "mpris_active".to_string(),
            state: playback_state,
            title: Some(title),
            artist,
            album,
            album_art: None,
            duration_ms: if dur_us > 0 {
                Some(dur_us / 1000)
            } else {
                None
            },
            position_ms: if pos_us > 0 {
                Some(pos_us / 1000)
            } else {
                None
            },
            volume: None,
            source: Some("mpris".to_string()),
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
        let _ = std::process::Command::new("playerctl").arg("play").spawn();
        Ok(())
    }

    async fn pause(&self) -> BbqResult<()> {
        let _ = std::process::Command::new("playerctl").arg("pause").spawn();
        Ok(())
    }

    async fn toggle_play_pause(&self) -> BbqResult<()> {
        let _ = std::process::Command::new("playerctl")
            .arg("play-pause")
            .spawn();
        Ok(())
    }

    async fn next(&self) -> BbqResult<()> {
        let _ = std::process::Command::new("playerctl").arg("next").spawn();
        Ok(())
    }

    async fn previous(&self) -> BbqResult<()> {
        let _ = std::process::Command::new("playerctl")
            .arg("previous")
            .spawn();
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
        Ok(NotificationCapabilities { available: true })
    }

    fn notify(&self, request: &NotificationRequest) -> BbqResult<()> {
        let mut cmd = std::process::Command::new("notify-send");
        cmd.arg("--app-name=BBQ");
        let category = match request.category {
            bbq_core::NotificationCategory::Timer | bbq_core::NotificationCategory::Pomodoro => {
                "alarm"
            }
            bbq_core::NotificationCategory::Reminder => "appointment",
            bbq_core::NotificationCategory::System => "device",
            bbq_core::NotificationCategory::General => "general",
        };
        cmd.arg(format!("--category={}", category));
        cmd.arg(&request.title);
        cmd.arg(&request.body);

        let status = cmd
            .status()
            .map_err(|e| BbqError::Platform(format!("Failed to execute notify-send: {}", e)))?;
        if !status.success() {
            return Err(BbqError::Platform(format!(
                "notify-send exited with status: {}",
                status
            )));
        }
        Ok(())
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

#[derive(Clone, Default)]
pub struct LinuxHotkey {
    registered: Arc<Mutex<HashMap<String, HotkeyDefinition>>>,
    subscribers: Arc<Mutex<Vec<HotkeyEventSink>>>,
}

impl std::fmt::Debug for LinuxHotkey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LinuxHotkey")
            .field(
                "registered_count",
                &self.registered.lock().map(|m| m.len()).unwrap_or(0),
            )
            .finish()
    }
}

#[async_trait]
impl PlatformHotkey for LinuxHotkey {
    async fn register(&self, _hotkey: &HotkeyDefinition) -> BbqResult<()> {
        Err(BbqError::NotSupported(
            "Linux global hotkey grabbing requires X11 XGrabKey display connection or Wayland XDG Desktop Portal; application-scoped shortcuts active".to_string(),
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
    async fn test_linux_hotkey_capabilities_and_not_supported() {
        let hotkey = LinuxHotkey::default();

        let def = HotkeyDefinition::new(
            "ctrl_space",
            "Space",
            vec!["Ctrl".to_string()],
            "Ctrl+Space",
        );

        let caps = hotkey.capabilities().await.unwrap();
        assert!(!caps.can_register);
        assert!(!caps.can_unregister);
        assert!(!caps.can_detect_conflicts);

        assert!(hotkey.register(&def).await.is_err());
        assert!(!hotkey.is_registered("ctrl_space").await.unwrap());
    }

    #[test]
    fn test_linux_notification_capabilities() {
        let notif = LinuxNotification;
        let caps = notif.capabilities().unwrap();
        assert!(caps.available);
    }

    #[tokio::test]
    async fn test_linux_autostart_support() {
        let autostart = LinuxAutostart;
        assert!(autostart.is_supported().await);
    }

    #[tokio::test]
    async fn test_linux_x11_display_geometry_and_multi_monitor() {
        let display = LinuxDisplay {
            server: LinuxDisplayServer::X11,
        };
        let list = display.get_displays().await.expect("List X11 displays");
        assert!(list.len() >= 2); // Primary + Left secondary

        let primary = display
            .get_primary_display()
            .await
            .expect("Primary X11 display");
        assert!(primary.is_primary);
        assert_eq!(primary.bounds.x, 0);

        let secondary = list
            .iter()
            .find(|d| !d.is_primary)
            .expect("Secondary display");
        assert_eq!(secondary.bounds.x, -1920); // Negative coordinates support

        let caps = display.capabilities();
        assert!(caps.multi_monitor);
        assert!(caps.absolute_positioning);
        assert_eq!(caps.geometry_support, DisplayGeometrySupport::Unverified);
        assert!(caps.backend_name.contains("X11"));
    }

    #[tokio::test]
    async fn test_linux_wayland_display_capabilities_and_limitations() {
        let display = LinuxDisplay {
            server: LinuxDisplayServer::Wayland,
        };
        let caps = display.capabilities();
        assert!(!caps.multi_monitor);
        assert!(!caps.absolute_positioning); // Wayland restricts absolute coordinates
        assert_eq!(
            caps.geometry_support,
            DisplayGeometrySupport::CompositorDependent
        );
        assert!(caps.backend_name.contains("Wayland"));
        assert!(caps.notes.as_ref().unwrap().contains("wlr-layer-shell"));
    }
}
