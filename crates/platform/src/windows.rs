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
        let is_primary = (mi.monitorInfo.dwFlags & 1) != 0;
        let scale_factor = get_monitor_scale_factor(hmonitor);
        let safe_scale = if scale_factor > 0.0 {
            scale_factor
        } else {
            1.0
        };
        let bounds = DisplayRect {
            x: (mi.monitorInfo.rcMonitor.left as f64 / safe_scale).round() as i32,
            y: (mi.monitorInfo.rcMonitor.top as f64 / safe_scale).round() as i32,
            width: (((mi.monitorInfo.rcMonitor.right - mi.monitorInfo.rcMonitor.left) as f64)
                / safe_scale)
                .round()
                .max(1.0) as u32,
            height: (((mi.monitorInfo.rcMonitor.bottom - mi.monitorInfo.rcMonitor.top) as f64)
                / safe_scale)
                .round()
                .max(1.0) as u32,
        };
        let work_area = DisplayRect {
            x: (mi.monitorInfo.rcWork.left as f64 / safe_scale).round() as i32,
            y: (mi.monitorInfo.rcWork.top as f64 / safe_scale).round() as i32,
            width: (((mi.monitorInfo.rcWork.right - mi.monitorInfo.rcWork.left) as f64)
                / safe_scale)
                .round()
                .max(1.0) as u32,
            height: (((mi.monitorInfo.rcWork.bottom - mi.monitorInfo.rcWork.top) as f64)
                / safe_scale)
                .round()
                .max(1.0) as u32,
        };
        let name_len = mi
            .szDevice
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(mi.szDevice.len());
        let name = String::from_utf16_lossy(&mi.szDevice[..name_len]);
        let id = format!("win_mon_{}", monitors.len() + 1);
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
                let scale_factor = get_monitor_scale_factor(hmonitor);
                let safe_scale = if scale_factor > 0.0 {
                    scale_factor
                } else {
                    1.0
                };
                let bounds = DisplayRect {
                    x: (mi.monitorInfo.rcMonitor.left as f64 / safe_scale).round() as i32,
                    y: (mi.monitorInfo.rcMonitor.top as f64 / safe_scale).round() as i32,
                    width: (((mi.monitorInfo.rcMonitor.right - mi.monitorInfo.rcMonitor.left)
                        as f64)
                        / safe_scale)
                        .round()
                        .max(1.0) as u32,
                    height: (((mi.monitorInfo.rcMonitor.bottom - mi.monitorInfo.rcMonitor.top)
                        as f64)
                        / safe_scale)
                        .round()
                        .max(1.0) as u32,
                };
                let work_area = DisplayRect {
                    x: (mi.monitorInfo.rcWork.left as f64 / safe_scale).round() as i32,
                    y: (mi.monitorInfo.rcWork.top as f64 / safe_scale).round() as i32,
                    width: (((mi.monitorInfo.rcWork.right - mi.monitorInfo.rcWork.left) as f64)
                        / safe_scale)
                        .round()
                        .max(1.0) as u32,
                    height: (((mi.monitorInfo.rcWork.bottom - mi.monitorInfo.rcWork.top) as f64)
                        / safe_scale)
                        .round()
                        .max(1.0) as u32,
                };
                let name_len = mi
                    .szDevice
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(mi.szDevice.len());
                let name = String::from_utf16_lossy(&mi.szDevice[..name_len]);
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
        windows::Win32::UI::WindowsAndMessaging::WM_POWERBROADCAST => {
            // PBT_APMRESUMEAUTOMATIC = 0x0012, PBT_APMRESUMESUSPEND = 0x0007
            if wparam.0 == 0x0012 || wparam.0 == 0x0007 {
                tracing::info!(
                    "WM_POWERBROADCAST resume event received: re-evaluating displays and geometry"
                );
                notify_display_changed();
            }
            LRESULT(1)
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
fn spawn_clipboard_listener_thread() -> BbqResult<()> {
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
        .map_err(|e| {
            BbqError::Platform(format!(
                "Failed to spawn Windows clipboard listener thread: {}",
                e
            ))
        })?;
    Ok(())
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
                if let Err(e) = spawn_clipboard_listener_thread() {
                    self.initialized.store(false, Ordering::SeqCst);
                    return Err(e);
                }
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
    GlobalSystemMediaTransportControlsSessionMediaProperties,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus, MediaPropertiesChangedEventArgs,
    PlaybackInfoChangedEventArgs, TimelinePropertiesChangedEventArgs,
};

#[cfg(windows)]
struct ActiveSessionGuard {
    session: GlobalSystemMediaTransportControlsSession,
    prop_token: i64,
    playback_token: i64,
    timeline_token: i64,
}

#[cfg(windows)]
impl Drop for ActiveSessionGuard {
    fn drop(&mut self) {
        let _ = self.session.RemoveMediaPropertiesChanged(self.prop_token);
        let _ = self.session.RemovePlaybackInfoChanged(self.playback_token);
        let _ = self
            .session
            .RemoveTimelinePropertiesChanged(self.timeline_token);
    }
}

#[derive(Clone, Default)]
pub struct WindowsMedia {
    pub subscribers: Arc<Mutex<Vec<MediaEventSink>>>,
    #[cfg(windows)]
    active_guard: Arc<Mutex<Option<ActiveSessionGuard>>>,
}

impl std::fmt::Debug for WindowsMedia {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowsMedia").finish()
    }
}

#[cfg(windows)]
fn base64_encode(bytes: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 {
            chunk[1] as usize
        } else {
            0
        };
        let b2 = if chunk.len() > 2 {
            chunk[2] as usize
        } else {
            0
        };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARSET[(n >> 18) & 63] as char);
        result.push(CHARSET[(n >> 12) & 63] as char);
        if chunk.len() > 1 {
            result.push(CHARSET[(n >> 6) & 63] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARSET[n & 63] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[cfg(windows)]
fn extract_artwork(
    props: &GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    const MAX_THUMBNAIL_BYTES: u32 = 512 * 1024; // 512 KB memory bound
    if let Ok(thumb_ref) = props.Thumbnail() {
        if let Ok(op) = thumb_ref.OpenReadAsync() {
            if let Ok(stream) = op.get() {
                if let Ok(size) = stream.Size() {
                    if size > 0 && size <= MAX_THUMBNAIL_BYTES as u64 {
                        let size_u32 = size as u32;
                        if let Ok(reader) =
                            windows::Storage::Streams::DataReader::CreateDataReader(&stream)
                        {
                            if reader
                                .LoadAsync(size_u32)
                                .and_then(|load_op| load_op.get())
                                .is_ok()
                            {
                                let mut buffer = vec![0u8; size_u32 as usize];
                                if reader.ReadBytes(&mut buffer).is_ok() {
                                    let b64 = base64_encode(&buffer);
                                    let mime = if buffer.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
                                        "image/png"
                                    } else {
                                        "image/jpeg"
                                    };
                                    return Some(format!("data:{};base64,{}", mime, b64));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
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
                can_seek: controls.IsPlaybackPositionEnabled().unwrap_or(false),
                can_change_volume: false,
            }
        } else {
            MediaCapabilities::default()
        }
    } else {
        MediaCapabilities::default()
    };

    let (title, artist, album, album_art) =
        if let Ok(props_op) = session.TryGetMediaPropertiesAsync() {
            if let Ok(props) = props_op.get() {
                let t = props.Title().ok().map(|s| s.to_string());
                let a = props.Artist().ok().map(|s| s.to_string());
                let alb = props.AlbumTitle().ok().map(|s| s.to_string());
                let art = extract_artwork(&props);
                (t, a, alb, art)
            } else {
                (None, None, None, None)
            }
        } else {
            (None, None, None, None)
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

    let last_updated_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64);

    Some(MediaSession {
        id,
        state,
        title,
        artist,
        album,
        album_art,
        duration_ms,
        position_ms,
        last_updated_time,
        volume: None,
        source,
        capabilities,
    })
}

#[cfg(windows)]
fn attach_session_listeners(
    session: &GlobalSystemMediaTransportControlsSession,
    subs: Arc<Mutex<Vec<MediaEventSink>>>,
    guard_slot: Arc<Mutex<Option<ActiveSessionGuard>>>,
) {
    // Drop existing guard to ensure deterministic deregistration before registering new handlers
    if let Ok(mut g) = guard_slot.lock() {
        *g = None;
    }

    let subs_props = subs.clone();
    let prop_token = session
        .MediaPropertiesChanged(&TypedEventHandler::<
            GlobalSystemMediaTransportControlsSession,
            MediaPropertiesChangedEventArgs,
        >::new(move |sender, _args| {
            if let Some(s) = sender.as_ref() {
                if let Some(media_session) = extract_session_from_smtc(s) {
                    if let Ok(listeners) = subs_props.lock() {
                        for l in listeners.iter() {
                            l(MediaEvent::SessionChanged(Some(media_session.clone())));
                        }
                    }
                }
            }
            Ok(())
        }))
        .ok();

    let subs_playback = subs.clone();
    let playback_token = session
        .PlaybackInfoChanged(&TypedEventHandler::<
            GlobalSystemMediaTransportControlsSession,
            PlaybackInfoChangedEventArgs,
        >::new(move |sender, _args| {
            if let Some(s) = sender.as_ref() {
                if let Some(media_session) = extract_session_from_smtc(s) {
                    if let Ok(listeners) = subs_playback.lock() {
                        for l in listeners.iter() {
                            l(MediaEvent::SessionChanged(Some(media_session.clone())));
                        }
                    }
                }
            }
            Ok(())
        }))
        .ok();

    let subs_timeline = subs;
    let timeline_token = session
        .TimelinePropertiesChanged(&TypedEventHandler::<
            GlobalSystemMediaTransportControlsSession,
            TimelinePropertiesChangedEventArgs,
        >::new(move |sender, _args| {
            if let Some(s) = sender.as_ref() {
                if let Some(media_session) = extract_session_from_smtc(s) {
                    if let Ok(listeners) = subs_timeline.lock() {
                        for l in listeners.iter() {
                            l(MediaEvent::SessionChanged(Some(media_session.clone())));
                        }
                    }
                }
            }
            Ok(())
        }))
        .ok();

    if let (Some(prop_token), Some(playback_token), Some(timeline_token)) =
        (prop_token, playback_token, timeline_token)
    {
        if let Ok(mut g) = guard_slot.lock() {
            *g = Some(ActiveSessionGuard {
                session: session.clone(),
                prop_token,
                playback_token,
                timeline_token,
            });
        }
    }
}

#[async_trait]
impl PlatformMedia for WindowsMedia {
    async fn initialize(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            let subs = self.subscribers.clone();
            let guard = self.active_guard.clone();
            std::thread::spawn(move || {
                if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
                    if let Ok(manager) = op.get() {
                        if let Ok(session) = manager.GetCurrentSession() {
                            attach_session_listeners(&session, subs.clone(), guard.clone());
                            if let Some(media_session) = extract_session_from_smtc(&session) {
                                if let Ok(listeners) = subs.lock() {
                                    for l in listeners.iter() {
                                        l(MediaEvent::SessionChanged(Some(media_session.clone())));
                                    }
                                }
                            }
                        }

                        let subs_inner = subs;
                        let guard_inner = guard;
                        let _ = manager.CurrentSessionChanged(&TypedEventHandler::<
                            GlobalSystemMediaTransportControlsSessionManager,
                            CurrentSessionChangedEventArgs,
                        >::new(
                            move |sender, _args| {
                                if let Ok(mgr) = sender.ok() {
                                    if let Ok(session) = mgr.GetCurrentSession() {
                                        attach_session_listeners(
                                            &session,
                                            subs_inner.clone(),
                                            guard_inner.clone(),
                                        );
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
                                    } else {
                                        if let Ok(mut g) = guard_inner.lock() {
                                            *g = None;
                                        }
                                        if let Ok(listeners) = subs_inner.lock() {
                                            for l in listeners.iter() {
                                                l(MediaEvent::SessionChanged(None));
                                            }
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
            let res = tokio::time::timeout(
                std::time::Duration::from_millis(250),
                tokio::task::spawn_blocking(|| {
                    if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                    {
                        if let Ok(manager) = op.get() {
                            if let Ok(session) = manager.GetCurrentSession() {
                                return extract_session_from_smtc(&session);
                            }
                        }
                    }
                    None
                }),
            )
            .await;

            match res {
                Ok(Ok(opt)) => return Ok(opt),
                Ok(Err(join_err)) => {
                    tracing::warn!(
                        "SMTC session retrieval spawn_blocking join error: {}",
                        join_err
                    );
                }
                Err(_) => {
                    tracing::warn!("SMTC session retrieval timed out after 250ms");
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
            tokio::task::spawn_blocking(|| {
                let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(
                    |e| BbqError::Platform(format!("Failed to request SMTC manager: {}", e)),
                )?;
                let manager = op.get().map_err(|e| {
                    BbqError::Platform(format!("Failed to get SMTC manager: {}", e))
                })?;
                let session = manager
                    .GetCurrentSession()
                    .map_err(|e| BbqError::Platform(format!("No active SMTC session: {}", e)))?;
                let play_op = session.TryPlayAsync().map_err(|e| {
                    BbqError::Platform(format!("TryPlayAsync invocation failed: {}", e))
                })?;
                let ok = play_op.get().map_err(|e| {
                    BbqError::Platform(format!("TryPlayAsync completion failed: {}", e))
                })?;
                if !ok {
                    return Err(BbqError::Platform(
                        "TryPlayAsync rejected by media player".to_string(),
                    ));
                }
                Ok(())
            })
            .await
            .map_err(|e| BbqError::Platform(format!("Play task join failed: {}", e)))?
        }
        #[cfg(not(windows))]
        Ok(())
    }

    async fn pause(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            tokio::task::spawn_blocking(|| {
                let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(
                    |e| BbqError::Platform(format!("Failed to request SMTC manager: {}", e)),
                )?;
                let manager = op.get().map_err(|e| {
                    BbqError::Platform(format!("Failed to get SMTC manager: {}", e))
                })?;
                let session = manager
                    .GetCurrentSession()
                    .map_err(|e| BbqError::Platform(format!("No active SMTC session: {}", e)))?;
                let pause_op = session.TryPauseAsync().map_err(|e| {
                    BbqError::Platform(format!("TryPauseAsync invocation failed: {}", e))
                })?;
                let ok = pause_op.get().map_err(|e| {
                    BbqError::Platform(format!("TryPauseAsync completion failed: {}", e))
                })?;
                if !ok {
                    return Err(BbqError::Platform(
                        "TryPauseAsync rejected by media player".to_string(),
                    ));
                }
                Ok(())
            })
            .await
            .map_err(|e| BbqError::Platform(format!("Pause task join failed: {}", e)))?
        }
        #[cfg(not(windows))]
        Ok(())
    }

    async fn toggle_play_pause(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            tokio::task::spawn_blocking(|| {
                let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(
                    |e| BbqError::Platform(format!("Failed to request SMTC manager: {}", e)),
                )?;
                let manager = op.get().map_err(|e| {
                    BbqError::Platform(format!("Failed to get SMTC manager: {}", e))
                })?;
                let session = manager
                    .GetCurrentSession()
                    .map_err(|e| BbqError::Platform(format!("No active SMTC session: {}", e)))?;
                let toggle_op = session.TryTogglePlayPauseAsync().map_err(|e| {
                    BbqError::Platform(format!("TryTogglePlayPauseAsync invocation failed: {}", e))
                })?;
                let ok = toggle_op.get().map_err(|e| {
                    BbqError::Platform(format!("TryTogglePlayPauseAsync completion failed: {}", e))
                })?;
                if !ok {
                    return Err(BbqError::Platform(
                        "TryTogglePlayPauseAsync rejected by media player".to_string(),
                    ));
                }
                Ok(())
            })
            .await
            .map_err(|e| BbqError::Platform(format!("Toggle play/pause task join failed: {}", e)))?
        }
        #[cfg(not(windows))]
        Ok(())
    }

    async fn next(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            tokio::task::spawn_blocking(|| {
                let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(
                    |e| BbqError::Platform(format!("Failed to request SMTC manager: {}", e)),
                )?;
                let manager = op.get().map_err(|e| {
                    BbqError::Platform(format!("Failed to get SMTC manager: {}", e))
                })?;
                let session = manager
                    .GetCurrentSession()
                    .map_err(|e| BbqError::Platform(format!("No active SMTC session: {}", e)))?;
                let next_op = session.TrySkipNextAsync().map_err(|e| {
                    BbqError::Platform(format!("TrySkipNextAsync invocation failed: {}", e))
                })?;
                let ok = next_op.get().map_err(|e| {
                    BbqError::Platform(format!("TrySkipNextAsync completion failed: {}", e))
                })?;
                if !ok {
                    return Err(BbqError::Platform(
                        "TrySkipNextAsync rejected by media player".to_string(),
                    ));
                }
                Ok(())
            })
            .await
            .map_err(|e| BbqError::Platform(format!("Next task join failed: {}", e)))?
        }
        #[cfg(not(windows))]
        Ok(())
    }

    async fn previous(&self) -> BbqResult<()> {
        #[cfg(windows)]
        {
            tokio::task::spawn_blocking(|| {
                let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(
                    |e| BbqError::Platform(format!("Failed to request SMTC manager: {}", e)),
                )?;
                let manager = op.get().map_err(|e| {
                    BbqError::Platform(format!("Failed to get SMTC manager: {}", e))
                })?;
                let session = manager
                    .GetCurrentSession()
                    .map_err(|e| BbqError::Platform(format!("No active SMTC session: {}", e)))?;
                let prev_op = session.TrySkipPreviousAsync().map_err(|e| {
                    BbqError::Platform(format!("TrySkipPreviousAsync invocation failed: {}", e))
                })?;
                let ok = prev_op.get().map_err(|e| {
                    BbqError::Platform(format!("TrySkipPreviousAsync completion failed: {}", e))
                })?;
                if !ok {
                    return Err(BbqError::Platform(
                        "TrySkipPreviousAsync rejected by media player".to_string(),
                    ));
                }
                Ok(())
            })
            .await
            .map_err(|e| BbqError::Platform(format!("Previous task join failed: {}", e)))?
        }
        #[cfg(not(windows))]
        Ok(())
    }

    async fn seek(&self, position_ms: u64) -> BbqResult<()> {
        #[cfg(windows)]
        {
            tokio::task::spawn_blocking(move || {
                let op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().map_err(
                    |e| BbqError::Platform(format!("Failed to request SMTC manager: {}", e)),
                )?;
                let manager = op.get().map_err(|e| {
                    BbqError::Platform(format!("Failed to get SMTC manager: {}", e))
                })?;
                let session = manager
                    .GetCurrentSession()
                    .map_err(|e| BbqError::Platform(format!("No active SMTC session: {}", e)))?;
                // WinRT expects 100-nanosecond units (1 ms = 10,000 ticks)
                let pos_100ns = (position_ms as i64).saturating_mul(10_000);
                let seek_op = session
                    .TryChangePlaybackPositionAsync(pos_100ns)
                    .map_err(|e| {
                        BbqError::Platform(format!(
                            "TryChangePlaybackPositionAsync invocation failed: {}",
                            e
                        ))
                    })?;
                let ok = seek_op.get().map_err(|e| {
                    BbqError::Platform(format!(
                        "TryChangePlaybackPositionAsync completion failed: {}",
                        e
                    ))
                })?;
                if !ok {
                    return Err(BbqError::Platform(
                        "TryChangePlaybackPositionAsync rejected by media player".to_string(),
                    ));
                }
                Ok(())
            })
            .await
            .map_err(|e| BbqError::Platform(format!("Seek task join failed: {}", e)))?
        }
        #[cfg(not(windows))]
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

    fn read_memory() -> Option<bbq_core::MemoryMetrics> {
        #[cfg(windows)]
        {
            use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
            let mut mem_status = MEMORYSTATUSEX {
                dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
                ..Default::default()
            };
            if unsafe { GlobalMemoryStatusEx(&mut mem_status) }.is_ok() {
                let total = mem_status.ullTotalPhys;
                let avail = mem_status.ullAvailPhys;
                let used = total.saturating_sub(avail);
                let pct = if total > 0 {
                    (used as f64 / total as f64 * 100.0).clamp(0.0, 100.0) as f32
                } else {
                    0.0
                };
                return Some(bbq_core::MemoryMetrics {
                    total_bytes: total,
                    used_bytes: used,
                    usage_percent: pct,
                });
            }
        }
        None
    }

    fn read_cpu() -> Option<bbq_core::CpuMetrics> {
        #[cfg(windows)]
        {
            use windows::Win32::Foundation::FILETIME;
            use windows::Win32::System::SystemInformation::{GetSystemInfo, SYSTEM_INFO};
            use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};

            let mut sys_info = SYSTEM_INFO::default();
            unsafe { GetSystemInfo(&mut sys_info) };
            let core_count = sys_info.dwNumberOfProcessors.max(1);

            let mut creation = FILETIME::default();
            let mut exit = FILETIME::default();
            let mut kernel = FILETIME::default();
            let mut user = FILETIME::default();

            let handle = unsafe { GetCurrentProcess() };
            if unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) }
                .is_ok()
            {
                let to_u64 =
                    |ft: FILETIME| ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64);
                let kernel_time = to_u64(kernel);
                let user_time = to_u64(user);
                let process_time = kernel_time.saturating_add(user_time);

                use std::sync::Mutex;
                static PREV_PROCESS_CPU: Mutex<Option<(u64, std::time::Instant)>> =
                    Mutex::new(None);

                let now = std::time::Instant::now();
                let usage_percent = if let Ok(mut lock) = PREV_PROCESS_CPU.lock() {
                    let pct = if let Some((prev_process_time, prev_inst)) = *lock {
                        let proc_delta = process_time.saturating_sub(prev_process_time);
                        let elapsed = now.duration_since(prev_inst);
                        let elapsed_100ns = (elapsed.as_nanos() / 100) as u64;

                        // Total available capacity across all CPU cores in 100-nanosecond units
                        let total_capacity = elapsed_100ns.saturating_mul(core_count as u64);

                        if total_capacity > 0 && elapsed.as_millis() >= 80 {
                            ((proc_delta as f64 / total_capacity as f64) * 100.0).clamp(0.0, 100.0)
                                as f32
                        } else {
                            0.0
                        }
                    } else {
                        // First sample: graceful baseline
                        0.0
                    };
                    *lock = Some((process_time, now));
                    pct
                } else {
                    0.0
                };

                return Some(bbq_core::CpuMetrics {
                    usage_percent,
                    core_count,
                });
            }
        }
        None
    }

    fn read_state() -> SystemState {
        let battery = Self::read_battery();
        let network = Self::read_network();
        let cpu = Self::read_cpu();
        let memory = Self::read_memory();
        let hostname = std::env::var("COMPUTERNAME").ok();

        SystemState {
            battery,
            network,
            cpu,
            memory,
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
            can_read_cpu: true,
            can_read_memory: true,
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
                "WindowsFileOperations not supported on non-windows".to_string(),
            ))
        }
    }

    async fn reveal(&self, path: &str) -> BbqResult<()> {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| BbqError::Platform(format!("Failed to reveal file: {}", e)))?;
        Ok(())
    }

    fn can_drag_out(&self) -> bool {
        true
    }

    async fn start_drag(&self, raw_paths: &[String]) -> BbqResult<()> {
        #[cfg(windows)]
        {
            if raw_paths.is_empty() {
                return Err(BbqError::Validation(
                    "No paths provided for drag-out".to_string(),
                ));
            }

            // 1. Strict validation, existence check, and canonicalization (rejects missing, unsafe)
            let mut canonical_paths = Vec::with_capacity(raw_paths.len());
            for p_str in raw_paths {
                if p_str.contains('\0') {
                    return Err(BbqError::Validation(format!(
                        "Invalid null byte in path: {}",
                        p_str
                    )));
                }
                let p = std::path::Path::new(p_str);
                if !p.exists() {
                    return Err(BbqError::Validation(format!(
                        "File does not exist: {}",
                        p_str
                    )));
                }
                let canonical = std::fs::canonicalize(p).map_err(|e| {
                    BbqError::Validation(format!("Cannot canonicalize path '{}': {}", p_str, e))
                })?;
                let s = canonical.to_string_lossy().to_string();
                let clean = if let Some(stripped) = s.strip_prefix(r"\\?\") {
                    stripped.to_string()
                } else {
                    s
                };
                canonical_paths.push(clean);
            }

            // 2. Offload OLE drag-out to blocking native thread so UI stays 100% responsive
            tokio::task::spawn_blocking(move || {
                use std::os::windows::ffi::OsStrExt;
                use windows::core::PCWSTR;
                use windows::Win32::System::Com::IDataObject;
                use windows::Win32::System::Ole::{
                    OleInitialize, OleUninitialize, DROPEFFECT_COPY, DROPEFFECT_LINK,
                };
                use windows::Win32::UI::Shell::{
                    BHID_DataObject, Common::ITEMIDLIST, ILFree, IShellItem, IShellItemArray,
                    SHCreateItemFromParsingName, SHCreateShellItemArrayFromIDLists, SHDoDragDrop,
                    SHGetIDListFromObject,
                };

                unsafe {
                    let _ = OleInitialize(None);

                    let data_obj_res = (|| -> windows::core::Result<IDataObject> {
                        if canonical_paths.len() == 1 {
                            let wide: Vec<u16> = std::ffi::OsStr::new(&canonical_paths[0])
                                .encode_wide()
                                .chain(std::iter::once(0))
                                .collect();
                            let item: IShellItem =
                                SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None)?;
                            item.BindToHandler(None, &BHID_DataObject)
                        } else {
                            let mut pidls: Vec<*mut ITEMIDLIST> =
                                Vec::with_capacity(canonical_paths.len());
                            for path_str in &canonical_paths {
                                let wide: Vec<u16> = std::ffi::OsStr::new(path_str)
                                    .encode_wide()
                                    .chain(std::iter::once(0))
                                    .collect();
                                if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(
                                    PCWSTR(wide.as_ptr()),
                                    None,
                                ) {
                                    if let Ok(pidl) = SHGetIDListFromObject(&item) {
                                        pidls.push(pidl);
                                    }
                                }
                            }

                            if pidls.is_empty() {
                                return Err(windows::core::Error::from_hresult(
                                    windows::Win32::Foundation::E_FAIL,
                                ));
                            }

                            let pidl_consts: Vec<*const ITEMIDLIST> =
                                pidls.iter().map(|p| *p as *const ITEMIDLIST).collect();
                            let item_array_res = SHCreateShellItemArrayFromIDLists(&pidl_consts);

                            // Free all allocated PIDLs
                            for pidl in pidls {
                                ILFree(Some(pidl));
                            }

                            let item_array: IShellItemArray = item_array_res?;
                            item_array.BindToHandler(None, &BHID_DataObject)
                        }
                    })();

                    match data_obj_res {
                        Ok(data_obj) => {
                            let _ = SHDoDragDrop(
                                None,
                                &data_obj,
                                None,
                                DROPEFFECT_COPY | DROPEFFECT_LINK,
                            );
                        }
                        Err(e) => {
                            tracing::warn!("Failed to bind Shell DataObject: {}", e);
                        }
                    }

                    OleUninitialize();
                    Ok(())
                }
            })
            .await
            .map_err(|e| BbqError::Platform(format!("Drag task join failed: {}", e)))?
        }
        #[cfg(not(windows))]
        {
            let _ = raw_paths;
            Err(BbqError::NotSupported(
                "Native drag-out is not supported on this platform".to_string(),
            ))
        }
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

const WM_BBQ_HOTKEY_CMD: u32 = windows::Win32::UI::WindowsAndMessaging::WM_USER + 101;

enum HotkeyWorkerCmd {
    Register {
        id: i32,
        string_id: String,
        modifiers: u32,
        vk: u32,
        resp: std::sync::mpsc::Sender<BbqResult<()>>,
    },
    Unregister {
        id: i32,
        resp: std::sync::mpsc::Sender<BbqResult<()>>,
    },
    Shutdown,
}

struct WindowsHotkeyWorker {
    thread_id: u32,
    tx: std::sync::mpsc::Sender<HotkeyWorkerCmd>,
}

fn parse_hotkey_to_win32(def: &HotkeyDefinition) -> BbqResult<(u32, u32)> {
    if def.modifiers.is_empty() {
        return Err(BbqError::Validation(
            "Global hotkey must include at least one modifier key (Ctrl, Alt, Shift, or Win)"
                .to_string(),
        ));
    }

    let mut mods = windows::Win32::UI::Input::KeyboardAndMouse::MOD_NOREPEAT.0;
    for m in &def.modifiers {
        let m_lower = m.trim().to_lowercase();
        match m_lower.as_str() {
            "ctrl" | "control" => {
                mods |= windows::Win32::UI::Input::KeyboardAndMouse::MOD_CONTROL.0;
            }
            "alt" | "option" => {
                mods |= windows::Win32::UI::Input::KeyboardAndMouse::MOD_ALT.0;
            }
            "shift" => {
                mods |= windows::Win32::UI::Input::KeyboardAndMouse::MOD_SHIFT.0;
            }
            "win" | "super" | "cmd" | "command" | "meta" => {
                mods |= windows::Win32::UI::Input::KeyboardAndMouse::MOD_WIN.0;
            }
            _ => {
                return Err(BbqError::Validation(format!(
                    "Unsupported hotkey modifier: '{}'",
                    m
                )));
            }
        }
    }

    let key_upper = def.key.trim().to_uppercase();
    let vk = match key_upper.as_str() {
        "SPACE" => windows::Win32::UI::Input::KeyboardAndMouse::VK_SPACE.0 as u32,
        "RETURN" | "ENTER" => windows::Win32::UI::Input::KeyboardAndMouse::VK_RETURN.0 as u32,
        "TAB" => windows::Win32::UI::Input::KeyboardAndMouse::VK_TAB.0 as u32,
        "ESC" | "ESCAPE" => windows::Win32::UI::Input::KeyboardAndMouse::VK_ESCAPE.0 as u32,
        "BACKSPACE" => windows::Win32::UI::Input::KeyboardAndMouse::VK_BACK.0 as u32,
        "LEFT" => windows::Win32::UI::Input::KeyboardAndMouse::VK_LEFT.0 as u32,
        "UP" => windows::Win32::UI::Input::KeyboardAndMouse::VK_UP.0 as u32,
        "RIGHT" => windows::Win32::UI::Input::KeyboardAndMouse::VK_RIGHT.0 as u32,
        "DOWN" => windows::Win32::UI::Input::KeyboardAndMouse::VK_DOWN.0 as u32,
        "F1" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F1.0 as u32,
        "F2" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F2.0 as u32,
        "F3" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F3.0 as u32,
        "F4" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F4.0 as u32,
        "F5" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F5.0 as u32,
        "F6" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F6.0 as u32,
        "F7" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F7.0 as u32,
        "F8" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F8.0 as u32,
        "F9" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F9.0 as u32,
        "F10" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F10.0 as u32,
        "F11" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F11.0 as u32,
        "F12" => windows::Win32::UI::Input::KeyboardAndMouse::VK_F12.0 as u32,
        other if other.len() == 1 => {
            let Some(ch) = other.chars().next() else {
                return Err(BbqError::Validation(format!(
                    "Unsupported hotkey key: '{}'",
                    def.key
                )));
            };
            if ch.is_ascii_alphanumeric() {
                ch as u32
            } else {
                match ch {
                    '`' | '~' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_3.0 as u32,
                    '-' | '_' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_MINUS.0 as u32,
                    '=' | '+' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_PLUS.0 as u32,
                    '[' | '{' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_4.0 as u32,
                    ']' | '}' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_6.0 as u32,
                    ';' | ':' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_1.0 as u32,
                    '\'' | '"' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_7.0 as u32,
                    ',' | '<' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_COMMA.0 as u32,
                    '.' | '>' => {
                        windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_PERIOD.0 as u32
                    }
                    '/' | '?' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_2.0 as u32,
                    '\\' | '|' => windows::Win32::UI::Input::KeyboardAndMouse::VK_OEM_5.0 as u32,
                    _ => {
                        return Err(BbqError::Validation(format!(
                            "Unsupported hotkey key: '{}'",
                            def.key
                        )));
                    }
                }
            }
        }
        _ => {
            return Err(BbqError::Validation(format!(
                "Unsupported hotkey key: '{}'",
                def.key
            )));
        }
    };

    Ok((mods, vk))
}

struct WindowsHotkeyInner {
    worker: std::sync::Mutex<Option<WindowsHotkeyWorker>>,
    registered: std::sync::Mutex<std::collections::HashMap<String, (i32, HotkeyDefinition)>>,
    subscribers: Arc<std::sync::Mutex<Vec<HotkeyEventSink>>>,
    next_id: std::sync::atomic::AtomicI32,
}

impl Drop for WindowsHotkeyInner {
    fn drop(&mut self) {
        if let Ok(mut lock) = self.worker.lock() {
            if let Some(w) = lock.take() {
                let _ = w.tx.send(HotkeyWorkerCmd::Shutdown);
                unsafe {
                    let _ = windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                        w.thread_id,
                        WM_BBQ_HOTKEY_CMD,
                        windows::Win32::Foundation::WPARAM(0),
                        windows::Win32::Foundation::LPARAM(0),
                    );
                }
            }
        }
    }
}

impl WindowsHotkeyInner {
    fn ensure_worker(&self) -> BbqResult<WindowsHotkeyWorker> {
        let mut guard = self
            .worker
            .lock()
            .map_err(|e| BbqError::Platform(e.to_string()))?;
        if let Some(ref w) = *guard {
            return Ok(WindowsHotkeyWorker {
                thread_id: w.thread_id,
                tx: w.tx.clone(),
            });
        }

        let (cmd_tx, cmd_rx) = std::sync::mpsc::channel::<HotkeyWorkerCmd>();
        let (init_tx, init_rx) = std::sync::mpsc::channel::<u32>();
        let subscribers_clone = self.subscribers.clone();

        std::thread::Builder::new()
            .name("bbq-win-hotkey".to_string())
            .spawn(move || {
                unsafe {
                    let mut msg = windows::Win32::UI::WindowsAndMessaging::MSG::default();
                    let _ = windows::Win32::UI::WindowsAndMessaging::PeekMessageW(
                        &mut msg,
                        None,
                        0,
                        0,
                        windows::Win32::UI::WindowsAndMessaging::PM_NOREMOVE,
                    );
                }
                let thread_id = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };
                let _ = init_tx.send(thread_id);

                let mut id_map: std::collections::HashMap<i32, String> = std::collections::HashMap::new();

                loop {
                    while let Ok(cmd) = cmd_rx.try_recv() {
                        match cmd {
                            HotkeyWorkerCmd::Register {
                                id,
                                string_id,
                                modifiers,
                                vk,
                                resp,
                            } => {
                                let res = unsafe {
                                    windows::Win32::UI::Input::KeyboardAndMouse::RegisterHotKey(
                                        None,
                                        id,
                                        windows::Win32::UI::Input::KeyboardAndMouse::HOT_KEY_MODIFIERS(modifiers),
                                        vk,
                                    )
                                };
                                match res {
                                    Ok(_) => {
                                        id_map.insert(id, string_id);
                                        let _ = resp.send(Ok(()));
                                    }
                                    Err(e) => {
                                        let _ = resp.send(Err(BbqError::Platform(format!(
                                            "Hotkey registration failed with OS: {}",
                                            e
                                        ))));
                                    }
                                }
                            }
                            HotkeyWorkerCmd::Unregister { id, resp } => {
                                id_map.remove(&id);
                                let res = unsafe {
                                    windows::Win32::UI::Input::KeyboardAndMouse::UnregisterHotKey(
                                        None,
                                        id,
                                    )
                                };
                                let _ = resp.send(res.map_err(|e| BbqError::Platform(e.to_string())));
                            }
                            HotkeyWorkerCmd::Shutdown => {
                                for (id, _) in id_map.drain() {
                                    unsafe {
                                        let _ = windows::Win32::UI::Input::KeyboardAndMouse::UnregisterHotKey(
                                            None,
                                            id,
                                        );
                                    }
                                }
                                return;
                            }
                        }
                    }

                    let mut msg = windows::Win32::UI::WindowsAndMessaging::MSG::default();
                    let ret = unsafe {
                        windows::Win32::UI::WindowsAndMessaging::GetMessageW(
                            &mut msg,
                            None,
                            0,
                            0,
                        )
                    };

                    if ret.0 <= 0 {
                        break;
                    }

                    if msg.message == windows::Win32::UI::WindowsAndMessaging::WM_HOTKEY {
                        let id = msg.wParam.0 as i32;
                        if let Some(str_id) = id_map.get(&id) {
                            let sinks = subscribers_clone
                                .lock()
                                .map(|g| g.clone())
                                .unwrap_or_else(|e| e.into_inner().clone());
                            for sink in sinks {
                                sink(str_id.clone());
                            }
                        }
                    }
                }
            })
            .map_err(|e| BbqError::Platform(format!("Failed to spawn hotkey worker thread: {}", e)))?;

        let thread_id = init_rx
            .recv_timeout(std::time::Duration::from_secs(2))
            .map_err(|e| BbqError::Platform(format!("Hotkey thread init timeout: {}", e)))?;

        let worker = WindowsHotkeyWorker {
            thread_id,
            tx: cmd_tx.clone(),
        };
        *guard = Some(WindowsHotkeyWorker {
            thread_id,
            tx: cmd_tx,
        });

        Ok(worker)
    }
}

#[derive(Clone)]
pub struct WindowsHotkey {
    inner: Arc<WindowsHotkeyInner>,
}

impl Default for WindowsHotkey {
    fn default() -> Self {
        Self {
            inner: Arc::new(WindowsHotkeyInner {
                worker: std::sync::Mutex::new(None),
                registered: std::sync::Mutex::new(std::collections::HashMap::new()),
                subscribers: Arc::new(std::sync::Mutex::new(Vec::new())),
                next_id: std::sync::atomic::AtomicI32::new(1),
            }),
        }
    }
}

impl std::fmt::Debug for WindowsHotkey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let count = self.inner.registered.lock().map(|r| r.len()).unwrap_or(0);
        f.debug_struct("WindowsHotkey")
            .field("registered_count", &count)
            .finish()
    }
}

#[async_trait]
impl PlatformHotkey for WindowsHotkey {
    async fn register(&self, hotkey: &HotkeyDefinition) -> BbqResult<()> {
        let (modifiers, vk) = parse_hotkey_to_win32(hotkey)?;

        // Check if already registered under same ID with identical parameters
        {
            let reg = self
                .inner
                .registered
                .lock()
                .map_err(|e| BbqError::Platform(e.to_string()))?;
            if let Some((_id, existing)) = reg.get(&hotkey.id) {
                if existing == hotkey {
                    return Ok(());
                }
            }
            // Check duplicate shortcut registered under another ID
            for (id, (_numeric_id, existing)) in reg.iter() {
                if id != &hotkey.id && existing.display_str == hotkey.display_str {
                    return Err(BbqError::Platform(format!(
                        "Hotkey '{}' is already in use by another action",
                        hotkey.display_str
                    )));
                }
            }
        }

        // Unregister existing if updating
        let _ = self.unregister(&hotkey.id).await;

        let numeric_id = self
            .inner
            .next_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let worker = self.inner.ensure_worker()?;

        let (resp_tx, resp_rx) = std::sync::mpsc::channel();
        worker
            .tx
            .send(HotkeyWorkerCmd::Register {
                id: numeric_id,
                string_id: hotkey.id.clone(),
                modifiers,
                vk,
                resp: resp_tx,
            })
            .map_err(|e| BbqError::Platform(e.to_string()))?;

        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                worker.thread_id,
                WM_BBQ_HOTKEY_CMD,
                windows::Win32::Foundation::WPARAM(0),
                windows::Win32::Foundation::LPARAM(0),
            );
        }

        resp_rx
            .recv_timeout(std::time::Duration::from_millis(1500))
            .map_err(|e| BbqError::Platform(format!("Hotkey registration timeout: {}", e)))??;

        if let Ok(mut reg) = self.inner.registered.lock() {
            reg.insert(hotkey.id.clone(), (numeric_id, hotkey.clone()));
        }

        Ok(())
    }

    async fn unregister(&self, id: &str) -> BbqResult<()> {
        let numeric_id = {
            let mut reg = self
                .inner
                .registered
                .lock()
                .map_err(|e| BbqError::Platform(e.to_string()))?;
            reg.remove(id).map(|(num, _)| num)
        };

        if let Some(num) = numeric_id {
            if let Ok(worker) = self.inner.ensure_worker() {
                let (resp_tx, resp_rx) = std::sync::mpsc::channel();
                let _ = worker.tx.send(HotkeyWorkerCmd::Unregister {
                    id: num,
                    resp: resp_tx,
                });
                unsafe {
                    let _ = windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                        worker.thread_id,
                        WM_BBQ_HOTKEY_CMD,
                        windows::Win32::Foundation::WPARAM(0),
                        windows::Win32::Foundation::LPARAM(0),
                    );
                }
                let _ = resp_rx.recv_timeout(std::time::Duration::from_millis(1000));
            }
        }

        Ok(())
    }

    async fn is_registered(&self, id: &str) -> BbqResult<bool> {
        if let Ok(reg) = self.inner.registered.lock() {
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
        if let Ok(mut subs) = self.inner.subscribers.lock() {
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
