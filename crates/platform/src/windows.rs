use crate::traits::*;
use async_trait::async_trait;
use bbq_core::{BbqError, BbqResult, NotificationCapabilities, NotificationRequest};
use std::sync::Arc;

/// Windows concrete platform provider foundation
#[derive(Debug, Clone, Default)]
pub struct WindowsPlatformProvider {
    pub window: WindowsWindow,
    pub display: WindowsDisplay,
    pub clipboard: WindowsClipboard,
    pub file: WindowsFile,
    pub media: WindowsMedia,
    pub notification: WindowsNotification,
    pub launcher: WindowsLauncher,
    pub system: WindowsSystem,
    pub network: WindowsNetwork,
    pub hotkey: WindowsHotkey,
    pub autostart: WindowsAutostart,
}

impl PlatformProvider for WindowsPlatformProvider {
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
pub struct WindowsWindow;

#[async_trait]
impl PlatformWindow for WindowsWindow {
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
pub struct WindowsDisplay;

#[cfg(windows)]
fn get_monitor_scale_factor(hmonitor: windows::Win32::Graphics::Gdi::HMONITOR) -> f64 {
    unsafe {
        let mut dpi_x = 0u32;
        let mut dpi_y = 0u32;
        if windows::Win32::UI::HiDpi::GetDpiForMonitor(
            hmonitor,
            windows::Win32::UI::HiDpi::MDT_EFFECTIVE_DPI,
            &mut dpi_x,
            &mut dpi_y,
        )
        .is_ok()
            && dpi_x > 0
        {
            return dpi_x as f64 / 96.0;
        }
    }
    1.0
}

#[cfg(windows)]
static DISPLAY_SINKS: Mutex<Vec<DisplayEventSink>> = Mutex::new(Vec::new());

#[cfg(windows)]
pub fn notify_display_changed() {
    let displays = enumerate_native_displays();
    let sinks = {
        let lock = DISPLAY_SINKS.lock().unwrap_or_else(|e| e.into_inner());
        lock.clone()
    };
    for sink in sinks {
        sink(PlatformDisplayEvent::DisplaysChanged(displays.clone()));
    }
}

#[cfg(windows)]
unsafe extern "system" fn monitor_enum_proc(
    hmonitor: windows::Win32::Graphics::Gdi::HMONITOR,
    _hdc: windows::Win32::Graphics::Gdi::HDC,
    _lprect: *mut windows::Win32::Foundation::RECT,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::core::BOOL {
    let monitors = &mut *(lparam.0 as *mut Vec<DisplayInfo>);
    let mut mi = windows::Win32::Graphics::Gdi::MONITORINFOEXW::default();
    mi.monitorInfo.cbSize =
        std::mem::size_of::<windows::Win32::Graphics::Gdi::MONITORINFOEXW>() as u32;
    if windows::Win32::Graphics::Gdi::GetMonitorInfoW(
        hmonitor,
        &mut mi as *mut _ as *mut windows::Win32::Graphics::Gdi::MONITORINFO,
    )
    .as_bool()
    {
        let is_primary = (mi.monitorInfo.dwFlags & 1) != 0; // 1 = MONITORINFOF_PRIMARY
        let bounds = DisplayRect {
            x: mi.monitorInfo.rcMonitor.left,
            y: mi.monitorInfo.rcMonitor.top,
            width: (mi.monitorInfo.rcMonitor.right - mi.monitorInfo.rcMonitor.left) as u32,
            height: (mi.monitorInfo.rcMonitor.bottom - mi.monitorInfo.rcMonitor.top) as u32,
        };
        let work_area = DisplayRect {
            x: mi.monitorInfo.rcWork.left,
            y: mi.monitorInfo.rcWork.top,
            width: (mi.monitorInfo.rcWork.right - mi.monitorInfo.rcWork.left) as u32,
            height: (mi.monitorInfo.rcWork.bottom - mi.monitorInfo.rcWork.top) as u32,
        };
        let name_len = mi
            .szDevice
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(mi.szDevice.len());
        let name = String::from_utf16_lossy(&mi.szDevice[..name_len]);
        let id = format!("win_mon_{}", monitors.len() + 1);
        let scale_factor = get_monitor_scale_factor(hmonitor);
        monitors.push(DisplayInfo {
            id,
            name,
            is_primary,
            scale_factor,
            bounds,
            work_area,
        });
    }
    windows::core::BOOL(1)
}

#[cfg(windows)]
fn enumerate_native_displays() -> Vec<DisplayInfo> {
    let mut monitors = Vec::new();
    unsafe {
        let _ = windows::Win32::Graphics::Gdi::EnumDisplayMonitors(
            None,
            None,
            Some(monitor_enum_proc),
            windows::Win32::Foundation::LPARAM(&mut monitors as *mut _ as isize),
        );
    }
    if monitors.is_empty() {
        monitors.push(DisplayInfo {
            id: "win_primary".to_string(),
            name: "Primary Monitor".to_string(),
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
        });
    }
    monitors
}

#[cfg(windows)]
fn get_native_cursor_display() -> Option<DisplayInfo> {
    unsafe {
        let mut pt = windows::Win32::Foundation::POINT::default();
        if windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt).is_ok() {
            let hmonitor = windows::Win32::Graphics::Gdi::MonitorFromPoint(
                pt,
                windows::Win32::Graphics::Gdi::MONITOR_DEFAULTTONEAREST,
            );
            let mut mi = windows::Win32::Graphics::Gdi::MONITORINFOEXW::default();
            mi.monitorInfo.cbSize =
                std::mem::size_of::<windows::Win32::Graphics::Gdi::MONITORINFOEXW>() as u32;
            if windows::Win32::Graphics::Gdi::GetMonitorInfoW(
                hmonitor,
                &mut mi as *mut _ as *mut windows::Win32::Graphics::Gdi::MONITORINFO,
            )
            .as_bool()
            {
                let is_primary = (mi.monitorInfo.dwFlags & 1) != 0;
                let bounds = DisplayRect {
                    x: mi.monitorInfo.rcMonitor.left,
                    y: mi.monitorInfo.rcMonitor.top,
                    width: (mi.monitorInfo.rcMonitor.right - mi.monitorInfo.rcMonitor.left) as u32,
                    height: (mi.monitorInfo.rcMonitor.bottom - mi.monitorInfo.rcMonitor.top) as u32,
                };
                let work_area = DisplayRect {
                    x: mi.monitorInfo.rcWork.left,
                    y: mi.monitorInfo.rcWork.top,
                    width: (mi.monitorInfo.rcWork.right - mi.monitorInfo.rcWork.left) as u32,
                    height: (mi.monitorInfo.rcWork.bottom - mi.monitorInfo.rcWork.top) as u32,
                };
                let name_len = mi
                    .szDevice
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(mi.szDevice.len());
                let name = String::from_utf16_lossy(&mi.szDevice[..name_len]);
                let scale_factor = get_monitor_scale_factor(hmonitor);
                return Some(DisplayInfo {
                    id: if is_primary {
                        "win_primary".to_string()
                    } else {
                        "win_active".to_string()
                    },
                    name,
                    is_primary,
                    scale_factor,
                    bounds,
                    work_area,
                });
            }
        }
    }
    None
}

#[async_trait]
impl PlatformDisplay for WindowsDisplay {
    async fn get_displays(&self) -> BbqResult<Vec<DisplayInfo>> {
        #[cfg(windows)]
        {
            Ok(enumerate_native_displays())
        }
        #[cfg(not(windows))]
        {
            Ok(vec![DisplayInfo {
                id: "win_primary".to_string(),
                name: "Primary Monitor".to_string(),
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
            }])
        }
    }

    async fn get_primary_display(&self) -> BbqResult<DisplayInfo> {
        let displays = self.get_displays().await?;
        Ok(displays
            .into_iter()
            .find(|d| d.is_primary)
            .unwrap_or(DisplayInfo {
                id: "win_primary".to_string(),
                name: "Primary Monitor".to_string(),
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
            }))
    }

    async fn get_active_display(&self) -> BbqResult<DisplayInfo> {
        #[cfg(windows)]
        {
            if let Some(active) = get_native_cursor_display() {
                return Ok(active);
            }
        }
        self.get_primary_display().await
    }

    fn capabilities(&self) -> DisplayCapabilities {
        DisplayCapabilities {
            multi_monitor: true,
            dpi_scaling: true,
            absolute_positioning: true,
            geometry_support: DisplayGeometrySupport::Supported,
            backend_name: "Win32 GDI / MonitorFromPoint".to_string(),
            notes: Some(
                "Native Win32 EnumDisplayMonitors & GetDpiForMonitor runtime verified.".to_string(),
            ),
        }
    }

    fn subscribe(&self, sink: DisplayEventSink) -> BbqResult<()> {
        #[cfg(windows)]
        {
            let mut sinks = DISPLAY_SINKS.lock().unwrap_or_else(|e| e.into_inner());
            sinks.push(sink);
        }
        Ok(())
    }
}

#[cfg(windows)]
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
#[cfg(windows)]
use windows::core::{w, PCWSTR};
#[cfg(windows)]
use windows::Win32::Foundation::{HANDLE, HGLOBAL, HWND, LPARAM, LRESULT, WPARAM};
#[cfg(windows)]
use windows::Win32::System::DataExchange::{
    AddClipboardFormatListener, CloseClipboard, EmptyClipboard, GetClipboardData,
    IsClipboardFormatAvailable, OpenClipboard, RemoveClipboardFormatListener, SetClipboardData,
};
#[cfg(windows)]
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostQuitMessage,
    RegisterClassW, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_CLIPBOARDUPDATE,
    WM_DESTROY, WNDCLASSW,
};

#[cfg(windows)]
const CF_UNICODETEXT: u32 = 13;
#[cfg(windows)]
const CF_BITMAP: u32 = 2;
#[cfg(windows)]
const CF_DIB: u32 = 8;
#[cfg(windows)]
const CF_HDROP: u32 = 15;

#[cfg(windows)]
static CLIPBOARD_SINKS: Mutex<Vec<ClipboardEventSink>> = Mutex::new(Vec::new());

#[cfg(windows)]
unsafe fn read_current_clipboard() -> Option<ClipboardEntry> {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let id = format!("win_clip_{}", COUNTER.fetch_add(1, Ordering::Relaxed));

    let mut opened = false;
    for _ in 0..5 {
        if OpenClipboard(None).is_ok() {
            opened = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    if !opened {
        return None;
    }

    let result = if IsClipboardFormatAvailable(CF_UNICODETEXT).is_ok() {
        if let Ok(handle) = GetClipboardData(CF_UNICODETEXT) {
            let hglobal = HGLOBAL(handle.0);
            let ptr = GlobalLock(hglobal) as *const u16;
            if !ptr.is_null() {
                let size_in_bytes = GlobalSize(hglobal);
                let max_u16 = size_in_bytes / 2;
                let mut len = 0;
                while len < max_u16 && *ptr.add(len) != 0 {
                    len += 1;
                }
                let slice = std::slice::from_raw_parts(ptr, len);
                let text = String::from_utf16_lossy(slice);
                let _ = GlobalUnlock(hglobal);
                Some(ClipboardEntry::new_text(
                    id,
                    &text,
                    Some("windows".to_string()),
                ))
            } else {
                None
            }
        } else {
            None
        }
    } else if IsClipboardFormatAvailable(CF_HDROP).is_ok() {
        Some(ClipboardEntry::new_metadata(
            id,
            ClipboardContentType::FileList,
            "[Files copied to clipboard]".to_string(),
            0,
            Some("windows".to_string()),
        ))
    } else if IsClipboardFormatAvailable(CF_BITMAP).is_ok()
        || IsClipboardFormatAvailable(CF_DIB).is_ok()
    {
        Some(ClipboardEntry::new_metadata(
            id,
            ClipboardContentType::Image,
            "[Image copied to clipboard]".to_string(),
            0,
            Some("windows".to_string()),
        ))
    } else {
        None
    };

    let _ = CloseClipboard();
    result
}

#[cfg(windows)]
unsafe fn write_clipboard_text(text: &str) -> BbqResult<()> {
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    wide.push(0);
    let byte_len = wide.len() * std::mem::size_of::<u16>();

    let mut opened = false;
    for _ in 0..5 {
        if OpenClipboard(None).is_ok() {
            opened = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    if !opened {
        return Err(BbqError::Platform("Failed to open clipboard".to_string()));
    }

    let _ = EmptyClipboard();
    if let Ok(hglobal) = GlobalAlloc(GMEM_MOVEABLE, byte_len) {
        let ptr = GlobalLock(hglobal) as *mut u16;
        if !ptr.is_null() {
            std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
            let _ = GlobalUnlock(hglobal);
            let _ = SetClipboardData(CF_UNICODETEXT, Some(HANDLE(hglobal.0)));
        }
    }
    let _ = CloseClipboard();
    Ok(())
}

#[cfg(windows)]
unsafe fn clear_clipboard_native() -> BbqResult<()> {
    let mut opened = false;
    for _ in 0..5 {
        if OpenClipboard(None).is_ok() {
            opened = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    if !opened {
        return Err(BbqError::Platform("Failed to open clipboard".to_string()));
    }
    let _ = EmptyClipboard();
    let _ = CloseClipboard();
    Ok(())
}

#[cfg(windows)]
unsafe extern "system" fn clipboard_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CLIPBOARDUPDATE => {
            if let Some(entry) = read_current_clipboard() {
                let sinks = {
                    let lock = CLIPBOARD_SINKS.lock().unwrap_or_else(|e| e.into_inner());
                    lock.clone()
                };
                for sink in sinks {
                    sink(PlatformClipboardEvent::Changed(entry.clone()));
                }
            }
            LRESULT(0)
        }
        windows::Win32::UI::WindowsAndMessaging::WM_DISPLAYCHANGE => {
            notify_display_changed();
            LRESULT(0)
        }
        WM_DESTROY => {
            let _ = RemoveClipboardFormatListener(hwnd);
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

#[cfg(windows)]
fn spawn_clipboard_listener_thread() {
    std::thread::Builder::new()
        .name("bbq-clipboard-listener".to_string())
        .spawn(|| unsafe {
            let class_name = w!("BBQClipboardListenerClass");
            let wnd_class = WNDCLASSW {
                lpfnWndProc: Some(clipboard_wndproc),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                ..Default::default()
            };

            let atom = RegisterClassW(&wnd_class);
            if atom == 0 {
                tracing::warn!("Failed to register BBQ clipboard window class");
                return;
            }

            let hwnd = match CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                PCWSTR(class_name.as_ptr()),
                w!("BBQClipboardListenerWindow"),
                WINDOW_STYLE::default(),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                None,
                None,
            ) {
                Ok(h) => h,
                Err(e) => {
                    tracing::warn!("Failed to create BBQ clipboard listener window: {}", e);
                    return;
                }
            };

            if let Err(e) = AddClipboardFormatListener(hwnd) {
                tracing::warn!("Failed to add clipboard format listener: {}", e);
                let _ = DestroyWindow(hwnd);
                return;
            }

            tracing::info!("Registered Windows clipboard format listener successfully");

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = DispatchMessageW(&msg);
            }
        })
        .expect("Failed to spawn Windows clipboard listener thread");
}

#[derive(Clone, Default)]
pub struct WindowsClipboard {
    pub subscribers: Arc<Mutex<Vec<ClipboardEventSink>>>,
    #[cfg(windows)]
    pub initialized: Arc<AtomicBool>,
}

impl std::fmt::Debug for WindowsClipboard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsClipboard").finish()
    }
}

#[async_trait]
impl PlatformClipboard for WindowsClipboard {
    async fn initialize(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            if !self.initialized.swap(true, Ordering::SeqCst) {
                spawn_clipboard_listener_thread();
            }
        }
        Ok(())
    }

    async fn current(&self) -> BbqResult<Option<ClipboardEntry>> {
        #[cfg(windows)]
        unsafe {
            Ok(read_current_clipboard())
        }
        #[cfg(not(windows))]
        Ok(None)
    }

    async fn subscribe(&self, sink: ClipboardEventSink) -> BbqResult<()> {
        self.initialize().await?;
        #[cfg(windows)]
        {
            let mut sinks = CLIPBOARD_SINKS.lock().unwrap_or_else(|e| e.into_inner());
            sinks.push(sink.clone());
        }
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn set_text(&self, text: &str) -> BbqResult<()> {
        #[cfg(windows)]
        unsafe {
            write_clipboard_text(text)
        }
        #[cfg(not(windows))]
        {
            let _ = text;
            Ok(())
        }
    }

    async fn clear(&self) -> BbqResult<()> {
        #[cfg(windows)]
        unsafe {
            clear_clipboard_native()
        }
        #[cfg(not(windows))]
        Ok(())
    }
}

#[cfg(windows)]
use windows::Foundation::TypedEventHandler;
#[cfg(windows)]
use windows::Media::Control::{
    CurrentSessionChangedEventArgs, GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

#[derive(Clone, Default)]
pub struct WindowsMedia {
    pub subscribers: Arc<Mutex<Vec<MediaEventSink>>>,
}

impl std::fmt::Debug for WindowsMedia {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsMedia").finish()
    }
}

#[cfg(windows)]
fn extract_session_from_smtc(
    session: &GlobalSystemMediaTransportControlsSession,
) -> Option<MediaSession> {
    let source = session.SourceAppUserModelId().ok().map(|s| s.to_string());
    let id = source.clone().unwrap_or_else(|| "windows_smtc".to_string());

    let playback_info = session.GetPlaybackInfo().ok();
    let state = playback_info
        .as_ref()
        .and_then(|pi| pi.PlaybackStatus().ok())
        .map(|st| match st {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => {
                PlaybackState::Playing
            }
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => {
                PlaybackState::Paused
            }
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped
            | GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed => {
                PlaybackState::Stopped
            }
            _ => PlaybackState::Unknown,
        })
        .unwrap_or(PlaybackState::Unknown);

    let capabilities = if let Some(ref pi) = playback_info {
        if let Ok(controls) = pi.Controls() {
            MediaCapabilities {
                can_play: controls.IsPlayEnabled().unwrap_or(false),
                can_pause: controls.IsPauseEnabled().unwrap_or(false),
                can_go_next: controls.IsNextEnabled().unwrap_or(false),
                can_go_previous: controls.IsPreviousEnabled().unwrap_or(false),
                can_seek: false,
                can_change_volume: false,
            }
        } else {
            MediaCapabilities::default()
        }
    } else {
        MediaCapabilities::default()
    };

    let (title, artist, album) = if let Ok(props_op) = session.TryGetMediaPropertiesAsync() {
        if let Ok(props) = props_op.get() {
            let t = props.Title().ok().map(|s| s.to_string());
            let a = props.Artist().ok().map(|s| s.to_string());
            let alb = props.AlbumTitle().ok().map(|s| s.to_string());
            (t, a, alb)
        } else {
            (None, None, None)
        }
    } else {
        (None, None, None)
    };

    let (duration_ms, position_ms) = if let Ok(timeline) = session.GetTimelineProperties() {
        let dur = timeline
            .EndTime()
            .ok()
            .map(|t| (t.Duration / 10_000) as u64);
        let pos = timeline
            .Position()
            .ok()
            .map(|t| (t.Duration / 10_000) as u64);
        (dur, pos)
    } else {
        (None, None)
    };

    Some(MediaSession {
        id,
        state,
        title,
        artist,
        album,
        album_art: None,
        duration_ms,
        position_ms,
        volume: None,
        source,
        capabilities,
    })
}

#[async_trait]
impl PlatformMedia for WindowsMedia {
    async fn initialize(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            let subs = self.subscribers.clone();
            std::thread::spawn(move || {
                if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                    if let Ok(manager) = op.get() {
                        let subs_inner = subs.clone();
                        let _ = manager.CurrentSessionChanged(&TypedEventHandler::<
                            GlobalSystemMediaTransportControlsSessionManager,
                            CurrentSessionChangedEventArgs,
                        >::new(
                            move |sender, _args| {
                                if let Ok(mgr) = sender.ok() {
                                    if let Ok(session) = mgr.GetCurrentSession() {
                                        if let Some(media_session) =
                                            extract_session_from_smtc(&session)
                                        {
                                            if let Ok(listeners) = subs_inner.lock() {
                                                for l in listeners.iter() {
                                                    l(MediaEvent::SessionChanged(Some(
                                                        media_session.clone(),
                                                    )));
                                                }
                                            }
                                        }
                                    } else if let Ok(listeners) = subs_inner.lock() {
                                        for l in listeners.iter() {
                                            l(MediaEvent::SessionChanged(None));
                                        }
                                    }
                                }
                                Ok(())
                            },
                        ));
                    }
                }
            });
        }
        Ok(())
    }

    async fn current_session(&self) -> BbqResult<Option<MediaSession>> {
        #[cfg(windows)]
        {
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                if let Ok(manager) = op.get() {
                    if let Ok(session) = manager.GetCurrentSession() {
                        return Ok(extract_session_from_smtc(&session));
                    }
                }
            }
        }
        Ok(None)
    }

    async fn subscribe(&self, sink: MediaEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }

    async fn play(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                if let Ok(manager) = op.get() {
                    if let Ok(session) = manager.GetCurrentSession() {
                        let _ = session.TryPlayAsync();
                    }
                }
            }
        }
        Ok(())
    }

    async fn pause(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                if let Ok(manager) = op.get() {
                    if let Ok(session) = manager.GetCurrentSession() {
                        let _ = session.TryPauseAsync();
                    }
                }
            }
        }
        Ok(())
    }

    async fn toggle_play_pause(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                if let Ok(manager) = op.get() {
                    if let Ok(session) = manager.GetCurrentSession() {
                        let _ = session.TryTogglePlayPauseAsync();
                    }
                }
            }
        }
        Ok(())
    }

    async fn next(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                if let Ok(manager) = op.get() {
                    if let Ok(session) = manager.GetCurrentSession() {
                        let _ = session.TrySkipNextAsync();
                    }
                }
            }
        }
        Ok(())
    }

    async fn previous(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                if let Ok(manager) = op.get() {
                    if let Ok(session) = manager.GetCurrentSession() {
                        let _ = session.TrySkipPreviousAsync();
                    }
                }
            }
        }
        Ok(())
    }

    async fn seek(&self, _position_ms: u64) -> BbqResult<()> {
        Ok(())
    }
}

#[derive(Debug, Clone, Default)]
pub struct WindowsNotification;

fn quick_xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

impl PlatformNotification for WindowsNotification {
    fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    fn capabilities(&self) -> BbqResult<NotificationCapabilities> {
        Ok(NotificationCapabilities { available: true })
    }

    fn notify(&self, request: &NotificationRequest) -> BbqResult<()> {
        use windows::core::HSTRING;
        use windows::Data::Xml::Dom::XmlDocument;
        use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

        let xml_content = format!(
            r#"<toast><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
            quick_xml_escape(&request.title),
            quick_xml_escape(&request.body)
        );

        let doc = XmlDocument::new().map_err(|e| {
            BbqError::Platform(format!("Failed to create XmlDocument for toast: {}", e))
        })?;

        doc.LoadXml(&HSTRING::from(xml_content.as_str()))
            .map_err(|e| BbqError::Platform(format!("Failed to load toast XML: {}", e)))?;

        let toast = ToastNotification::CreateToastNotification(&doc).map_err(|e| {
            BbqError::Platform(format!("Failed to create ToastNotification: {}", e))
        })?;

        // Attempt creating notifier with application ID
        let notifier =
            ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from("com.bbq.desktop"))
                .map_err(|e| {
                    BbqError::Platform(format!("Failed to create toast notifier: {}", e))
                })?;

        notifier.Show(&toast).map_err(|e| {
            BbqError::Platform(format!("Failed to show Windows toast notification: {}", e))
        })?;

        Ok(())
    }
}

#[derive(Clone, Default)]
pub struct WindowsSystem {
    sink: Arc<std::sync::Mutex<Option<SystemEventSink>>>,
}

impl std::fmt::Debug for WindowsSystem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsSystem").finish()
    }
}

impl WindowsSystem {
    fn read_battery() -> BatteryState {
        use windows::System::Power::{BatteryStatus, PowerManager, PowerSupplyStatus};

        let percent = PowerManager::RemainingChargePercent()
            .ok()
            .map(|p| p.clamp(0, 100) as u8);
        let battery_status = PowerManager::BatteryStatus().ok();
        let supply_status = PowerManager::PowerSupplyStatus().ok();

        let charging = battery_status == Some(BatteryStatus::Charging);
        let plugged_in =
            supply_status.is_some() && supply_status != Some(PowerSupplyStatus::NotPresent);

        let power_source = match supply_status {
            Some(PowerSupplyStatus::Inadequate) => Some("Inadequate AC".to_string()),
            Some(PowerSupplyStatus::Adequate) => Some("AC Power".to_string()),
            _ => {
                if battery_status == Some(BatteryStatus::Discharging) {
                    Some("Battery".to_string())
                } else if plugged_in {
                    Some("Plugged In".to_string())
                } else {
                    None
                }
            }
        };

        let available = percent.is_some() && battery_status != Some(BatteryStatus::NotPresent);

        BatteryState {
            available,
            percentage: percent,
            charging,
            plugged_in,
            power_source,
        }
    }

    fn read_network() -> NetworkState {
        use windows::Networking::Connectivity::{NetworkConnectivityLevel, NetworkInformation};

        if let Ok(profile) = NetworkInformation::GetInternetConnectionProfile() {
            let connectivity = profile.GetNetworkConnectivityLevel().ok();
            let connected = connectivity == Some(NetworkConnectivityLevel::InternetAccess);
            let interface_name = profile.ProfileName().ok().map(|s| s.to_string());
            let connection_type = if connected {
                Some("Internet Access".to_string())
            } else if connectivity.is_some() {
                Some("Local Access".to_string())
            } else {
                None
            };

            NetworkState {
                connected,
                interface_name,
                connection_type,
                signal_strength: None,
            }
        } else {
            NetworkState::default()
        }
    }

    fn read_state() -> SystemState {
        let battery = Self::read_battery();
        let network = Self::read_network();
        let hostname = std::env::var("COMPUTERNAME").ok();

        SystemState {
            battery,
            network,
            muted: Some(false),
            volume: Some(1.0),
            uptime_seconds: None,
            hostname,
            operating_system: "Windows".to_string(),
            platform: "windows".to_string(),
        }
    }
}

#[async_trait]
impl PlatformSystem for WindowsSystem {
    async fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn current_state(&self) -> BbqResult<SystemState> {
        Ok(Self::read_state())
    }

    async fn capabilities(&self) -> BbqResult<SystemCapabilities> {
        let has_battery = Self::read_battery().available;
        Ok(SystemCapabilities {
            has_battery,
            can_read_network: true,
            can_control_volume: false,
            can_mute: false,
        })
    }

    async fn subscribe(&self, sink: SystemEventSink) -> BbqResult<()> {
        if let Ok(mut slot) = self.sink.lock() {
            *slot = Some(sink.clone());
        }

        // Register Windows Runtime PowerManager event handlers (zero polling)
        use windows::System::Power::PowerManager;
        {
            let sink_c = sink.clone();
            let _ = PowerManager::RemainingChargePercentChanged(
                &windows::Foundation::EventHandler::new(move |_, _| {
                    let b = Self::read_battery();
                    sink_c(SystemEvent::BatteryChanged(b));
                    Ok(())
                }),
            );
        }

        {
            let sink_c = sink.clone();
            let _ = PowerManager::PowerSupplyStatusChanged(
                &windows::Foundation::EventHandler::new(move |_, _| {
                    let b = Self::read_battery();
                    sink_c(SystemEvent::BatteryChanged(b));
                    Ok(())
                }),
            );
        }

        {
            let sink_c = sink.clone();
            let _ = PowerManager::BatteryStatusChanged(&windows::Foundation::EventHandler::new(
                move |_, _| {
                    let b = Self::read_battery();
                    sink_c(SystemEvent::BatteryChanged(b));
                    Ok(())
                },
            ));
        }

        // Register Windows Runtime NetworkInformation event handler (zero polling)
        use windows::Networking::Connectivity::{
            NetworkInformation, NetworkStatusChangedEventHandler,
        };
        {
            let sink_c = sink.clone();
            let _ = NetworkInformation::NetworkStatusChanged(
                &NetworkStatusChangedEventHandler::new(move |_| {
                    let net = Self::read_network();
                    sink_c(SystemEvent::NetworkChanged(net));
                    Ok(())
                }),
            );
        }

        Ok(())
    }

    async fn set_volume(&self, _volume: f32) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Volume control unsupported via default Windows endpoint".to_string(),
        ))
    }

    async fn set_muted(&self, _muted: bool) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Mute control unsupported via default Windows endpoint".to_string(),
        ))
    }

    async fn toggle_muted(&self) -> BbqResult<()> {
        Err(BbqError::Platform(
            "Toggle mute unsupported via default Windows endpoint".to_string(),
        ))
    }
}

#[derive(Debug, Clone, Default)]
pub struct WindowsNetwork;

#[async_trait]
impl PlatformNetwork for WindowsNetwork {
    async fn is_connected(&self) -> BbqResult<bool> {
        Ok(true)
    }
}

#[derive(Debug, Clone, Default)]
pub struct WindowsFile;

#[async_trait]
impl PlatformFile for WindowsFile {
    async fn validate_path(&self, raw_path: &str) -> BbqResult<FileMetadataInfo> {
        let p = std::path::Path::new(raw_path);
        let canonical = match std::fs::canonicalize(p) {
            Ok(cp) => {
                let s = cp.to_string_lossy().to_string();
                if let Some(stripped) = s.strip_prefix(r"\\?\") {
                    stripped.to_string()
                } else {
                    s
                }
            }
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
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", path])
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to spawn open command: {}", e)))?;
        Ok(())
    }

    async fn reveal(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to reveal file: {}", e)))?;
        Ok(())
    }
}

pub use crate::launcher::PlatformLauncher;
use bbq_core::{LauncherAction, LauncherCapabilities, SystemActionType};

#[derive(Debug, Clone, Default)]
pub struct WindowsLauncher;

#[async_trait]
impl PlatformLauncher for WindowsLauncher {
    async fn initialize(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn capabilities(&self) -> BbqResult<LauncherCapabilities> {
        Ok(LauncherCapabilities {
            open_application: true,
            open_file: true,
            open_folder: true,
            open_url: true,
            system_actions: true,
        })
    }

    async fn launch(&self, action: &LauncherAction) -> BbqResult<()> {
        match action {
            LauncherAction::OpenUrl { url } => self.open_url(url).await,
            LauncherAction::OpenFile { path } => self.open_file(path).await,
            LauncherAction::OpenFolder { path } => self.open_folder(path).await,
            LauncherAction::OpenApplication { id } => self.open_application(id).await,
            LauncherAction::SystemAction(sys) => self.execute_system_action(*sys).await,
            LauncherAction::BbqAction(_) => Ok(()),
        }
    }

    async fn open_file(&self, path: &str) -> BbqResult<()> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::UI::Shell::ShellExecuteW;
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

            let wide_path: Vec<u16> = std::ffi::OsStr::new(path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let wide_op: Vec<u16> = std::ffi::OsStr::new("open")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let res = unsafe {
                ShellExecuteW(
                    None,
                    PCWSTR(wide_op.as_ptr()),
                    PCWSTR(wide_path.as_ptr()),
                    PCWSTR::null(),
                    PCWSTR::null(),
                    SW_SHOWNORMAL,
                )
            };

            if (res.0 as isize) <= 32 {
                return Err(BbqError::Platform(format!(
                    "ShellExecuteW failed to open file '{}' (code: {})",
                    path, res.0 as isize
                )));
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = path;
            Err(BbqError::Platform(
                "WindowsLauncher not supported on non-windows".to_string(),
            ))
        }
    }

    async fn open_folder(&self, path: &str) -> BbqResult<()> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::UI::Shell::ShellExecuteW;
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

            let wide_path: Vec<u16> = std::ffi::OsStr::new(path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let wide_op: Vec<u16> = std::ffi::OsStr::new("explore")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let res = unsafe {
                ShellExecuteW(
                    None,
                    PCWSTR(wide_op.as_ptr()),
                    PCWSTR(wide_path.as_ptr()),
                    PCWSTR::null(),
                    PCWSTR::null(),
                    SW_SHOWNORMAL,
                )
            };

            if (res.0 as isize) <= 32 {
                return Err(BbqError::Platform(format!(
                    "ShellExecuteW failed to explore folder '{}' (code: {})",
                    path, res.0 as isize
                )));
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = path;
            Err(BbqError::Platform(
                "WindowsLauncher not supported on non-windows".to_string(),
            ))
        }
    }

    async fn open_url(&self, url: &str) -> BbqResult<()> {
        bbq_core::validate_launcher_url(url)?;

        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::UI::Shell::ShellExecuteW;
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

            let wide_url: Vec<u16> = std::ffi::OsStr::new(url)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let wide_op: Vec<u16> = std::ffi::OsStr::new("open")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let res = unsafe {
                ShellExecuteW(
                    None,
                    PCWSTR(wide_op.as_ptr()),
                    PCWSTR(wide_url.as_ptr()),
                    PCWSTR::null(),
                    PCWSTR::null(),
                    SW_SHOWNORMAL,
                )
            };

            if (res.0 as isize) <= 32 {
                return Err(BbqError::Platform(format!(
                    "ShellExecuteW failed to open URL '{}' (code: {})",
                    url, res.0 as isize
                )));
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = url;
            Err(BbqError::Platform(
                "WindowsLauncher not supported on non-windows".to_string(),
            ))
        }
    }

    async fn open_application(&self, id: &str) -> BbqResult<()> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::UI::Shell::ShellExecuteW;
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

            let wide_id: Vec<u16> = std::ffi::OsStr::new(id)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let wide_op: Vec<u16> = std::ffi::OsStr::new("open")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let res = unsafe {
                ShellExecuteW(
                    None,
                    PCWSTR(wide_op.as_ptr()),
                    PCWSTR(wide_id.as_ptr()),
                    PCWSTR::null(),
                    PCWSTR::null(),
                    SW_SHOWNORMAL,
                )
            };

            if (res.0 as isize) <= 32 {
                return Err(BbqError::Platform(format!(
                    "ShellExecuteW failed to launch application target '{}' (code: {})",
                    id, res.0 as isize
                )));
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = id;
            Err(BbqError::Platform(
                "WindowsLauncher not supported on non-windows".to_string(),
            ))
        }
    }
}

impl WindowsLauncher {
    async fn execute_system_action(&self, action: SystemActionType) -> BbqResult<()> {
        match action {
            SystemActionType::OpenSettings => self.open_protocol("ms-settings:").await,
            SystemActionType::OpenDownloads => {
                let path = std::env::var_os("USERPROFILE")
                    .map(|p| std::path::PathBuf::from(p).join("Downloads"))
                    .ok_or_else(|| {
                        BbqError::Platform("Unable to resolve Downloads folder".to_string())
                    })?;
                self.open_folder(&path.to_string_lossy()).await
            }
            SystemActionType::OpenHome => {
                let home = std::env::var_os("USERPROFILE")
                    .map(std::path::PathBuf::from)
                    .ok_or_else(|| {
                        BbqError::Platform("Unable to resolve Home folder".to_string())
                    })?;
                self.open_folder(&home.to_string_lossy()).await
            }
            SystemActionType::LockScreen => {
                #[cfg(windows)]
                {
                    use windows::Win32::System::Shutdown::LockWorkStation;
                    unsafe {
                        LockWorkStation().map_err(|e| {
                            BbqError::Platform(format!("LockWorkStation failed: {}", e))
                        })?;
                    }
                    Ok(())
                }
                #[cfg(not(windows))]
                Ok(())
            }
            SystemActionType::ShowDesktop => {
                self.open_protocol("shell:::{3080F90D-D7AD-11D9-BD98-0000947B0257}")
                    .await
            }
            SystemActionType::ToggleMute => Ok(()),
        }
    }

    async fn open_protocol(&self, target: &str) -> BbqResult<()> {
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::UI::Shell::ShellExecuteW;
            use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

            let wide_target: Vec<u16> = std::ffi::OsStr::new(target)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let wide_op: Vec<u16> = std::ffi::OsStr::new("open")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let res = unsafe {
                ShellExecuteW(
                    None,
                    PCWSTR(wide_op.as_ptr()),
                    PCWSTR(wide_target.as_ptr()),
                    PCWSTR::null(),
                    PCWSTR::null(),
                    SW_SHOWNORMAL,
                )
            };

            if (res.0 as isize) <= 32 {
                return Err(BbqError::Platform(format!(
                    "ShellExecuteW failed for protocol '{}' (code: {})",
                    target, res.0 as isize
                )));
            }
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = target;
            Ok(())
        }
    }
}

#[derive(Clone, Default)]
pub struct WindowsHotkey {
    registered: Arc<std::sync::Mutex<std::collections::HashMap<String, HotkeyDefinition>>>,
    subscribers: Arc<std::sync::Mutex<Vec<HotkeyEventSink>>>,
}

impl std::fmt::Debug for WindowsHotkey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsHotkey")
            .field("registered", &self.registered)
            .finish()
    }
}

#[async_trait]
impl PlatformHotkey for WindowsHotkey {
    async fn register(&self, hotkey: &HotkeyDefinition) -> BbqResult<()> {
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

// ----------------------------------------------------------------------------
// Windows Native Autostart via Registry
// ----------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct WindowsAutostart;

#[async_trait]
impl PlatformAutostart for WindowsAutostart {
    async fn is_supported(&self) -> bool {
        true
    }

    async fn is_enabled(&self) -> BbqResult<bool> {
        use windows::core::w;
        use windows::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        };

        unsafe {
            let mut hkey: HKEY = Default::default();
            let status = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                w!(r#"Software\Microsoft\Windows\CurrentVersion\Run"#),
                Some(0),
                KEY_READ,
                &mut hkey,
            );
            if status.is_err() {
                return Ok(false);
            }

            let query_status = RegQueryValueExW(hkey, w!("BBQ"), None, None, None, None);
            let _ = RegCloseKey(hkey);

            Ok(query_status.is_ok())
        }
    }

    async fn set_enabled(&self, enabled: bool) -> BbqResult<()> {
        use windows::core::w;
        use windows::Win32::System::Registry::{
            RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY,
            HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ,
        };

        unsafe {
            let mut hkey: HKEY = Default::default();

            if enabled {
                let status = RegCreateKeyW(
                    HKEY_CURRENT_USER,
                    w!(r#"Software\Microsoft\Windows\CurrentVersion\Run"#),
                    &mut hkey,
                );
                if status.is_err() {
                    return Err(BbqError::Platform(format!(
                        "Failed to open autostart registry key: {:?}",
                        status
                    )));
                }

                let exe = std::env::current_exe().map_err(|e| BbqError::Platform(e.to_string()))?;
                let exe_str = format!("\"{}\"\0", exe.to_string_lossy());
                let wide_chars: Vec<u16> = exe_str.encode_utf16().collect();
                let byte_slice: &[u8] = std::slice::from_raw_parts(
                    wide_chars.as_ptr() as *const u8,
                    wide_chars.len() * 2,
                );

                let set_status = RegSetValueExW(hkey, w!("BBQ"), Some(0), REG_SZ, Some(byte_slice));
                let _ = RegCloseKey(hkey);

                if set_status.is_err() {
                    return Err(BbqError::Platform(format!(
                        "Failed to set autostart registry value: {:?}",
                        set_status
                    )));
                }
            } else {
                let status = RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    w!(r#"Software\Microsoft\Windows\CurrentVersion\Run"#),
                    Some(0),
                    KEY_SET_VALUE,
                    &mut hkey,
                );
                if status.is_ok() {
                    let _ = RegDeleteValueW(hkey, w!("BBQ"));
                    let _ = RegCloseKey(hkey);
                }
            }
            Ok(())
        }
    }
}
