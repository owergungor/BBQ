# BBQ Platform Abstraction Guide

## 1. Abstraction Strategy

BBQ guarantees cross-platform consistency by encapsulating all OS-specific APIs behind Rust traits located in `crates/platform`.

```text
High-Level Services (e.g. WindowService, DisplayService)
                         │
                         ▼
             Platform Trait Interfaces
                         │
      ┌──────────────────┼──────────────────┐
      ▼                  ▼                  ▼
platform::windows  platform::macos    platform::linux
(Win32/WinRT)       (Cocoa/AppKit)     (Wayland/X11)
```

No platform conditionals (`#[cfg(windows)]`) are permitted inside high-level services or UI code.

---

## 2. Platform Matrix & Capabilities

### Windows
- **Display**: Win32 `EnumDisplayMonitors`, DPI awareness (`PerMonitorV2`), `WM_DPICHANGED`.
- **Window Management**: `WS_EX_TOPMOST`, `WS_EX_LAYERED`, `WS_EX_TOOLWINDOW` to prevent taskbar clutter and ensure seamless topmost anchoring.
- **Media (SMTC)**:
  - Uses `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`.
  - Subscribes to `CurrentSessionChanged` WinRT event callbacks without background polling.
  - Queries `GetPlaybackInfo()`, `TryGetMediaPropertiesAsync()`, and `GetTimelineProperties()`.
  - Transmits Play/Pause/Next/Previous commands via `TryPlayAsync`, `TryPauseAsync`, etc.

- **Clipboard (Win32 Event-Driven Listener)**:
  - Registers a hidden native message window (`HWND_MESSAGE`).
  - Calls `AddClipboardFormatListener(hwnd)` to receive OS push notifications.
  - Intercepts `WM_CLIPBOARDUPDATE` messages directly in the window procedure without background polling.
  - Inspects available formats (`CF_UNICODETEXT`, `CF_HDROP`, `CF_BITMAP`, `CF_DIB`) and reads text safely using `GlobalLock`/`GlobalUnlock`.
  - Unregisters listener cleanly on shutdown via `RemoveClipboardFormatListener(hwnd)`.
- **File & Workspace (`PlatformFile`)**:
  - `validate_path`: Normalizes Win32 paths, resolves junctions, strips extended `\\?\` prefix.
  - `open`: Invokes default associated application via `rundll32 url.dll,FileProtocolHandler` (non-blocking process spawn).
  - `reveal`: Launches `explorer.exe /select,"<path>"` highlighting the file in Explorer.

### macOS
- **Display**: `NSScreen`, Retina coordinate scaling, menu bar exclusion zones.
- **Window Management**: `NSWindowLevel` (Floating/Status window), spaces behavior (`NSWindowCollectionBehaviorCanJoinAllSpaces`).
- **Media (Now Playing)**:
  - Consumes system Now Playing / MediaRemote notifications.
  - Exposes playback status, track metadata, and media control endpoints.
  - Limitation: On macOS, certain sandbox entitlements may restrict direct third-party player control unless accessibility/media permissions are granted.
- **Clipboard (AppKit NSPasteboard)**:
  - Architecture: AppKit's `NSPasteboard` maintains a `changeCount` integer.
  - Limitation: macOS lacks a public asynchronous system-wide pasteboard push notification callback.
  - Polling Prohibition: Rather than running a high-frequency polling timer, BBQ evaluates pasteboard updates lazily on user interaction and window focus.
- **File & Workspace (`PlatformFile`)**:
  - `validate_path`: Path canonicalization, metadata inspection via standard filesystem.
  - `open`: Invokes `open <path>`.
  - `reveal`: Invokes `open -R <path>` to reveal and highlight in Finder.

### Linux
- **Window Server Detection**: Dynamic check for `WAYLAND_DISPLAY` vs `X11`.
- **Wayland Protocol**: Layer Shell protocol (`zwlr_layer_shell_v1`) via platform adapter to anchor at the top layer.
- **X11 Protocol**: `_NET_WM_WINDOW_TYPE_DOCK` with `_NET_WM_STATE_STAYS_ON_TOP`.
- **Media (MPRIS over D-Bus)**:
  - Listens for `org.mpris.MediaPlayer2.*` interfaces on the session bus.
  - Reacts to `org.freedesktop.DBus.Properties.PropertiesChanged` signals on `org.mpris.MediaPlayer2.Player`.
  - Emits play/pause/next/previous method calls via D-Bus without periodic player scanning.
- **Clipboard (X11 & Wayland Compositor Aware)**:
  - X11: Supports `XFixesSelectSelectionInput` for `CLIPBOARD` ownership changes.
  - Wayland: Subject to compositor security boundaries. Unprivileged clients under standard GNOME/KDE sessions are blocked from background snooping; privileged protocols (`wlr-data-control`, `ext-data-control`) are used where supported.
  - Graceful Degradation: If native push notification is unavailable, the adapter transitions to inactive/degraded rather than falling back to aggressive CPU-heavy polling loops.
- **File & Workspace (`PlatformFile`)**:
  - `validate_path`: Path canonicalization, metadata inspection.
  - `open`: Invokes `xdg-open <path>`.
  - `reveal`: Opens containing directory via `xdg-open <parent>`.

---

## 3. Platform Status Matrix (Milestone 5 Policy)

| Feature / Subsystem | Windows | macOS | Linux | Mock (CI) |
|---|---|---|---|---|
| **Window Anchoring & Shell** | Implemented | Partial | Partial | Implemented |
| **Display Enumeration & DPI** | Implemented | Untested | Untested | Implemented |
| **Media Service (SMTC/MPRIS)** | Implemented | Untested | Untested | Implemented |
| **Clipboard Push Listener** | Implemented | Untested | Untested | Implemented |
| **File Drag & Drop Acceptance** | Implemented | Untested | Untested | Implemented |
| **File Metadata Normalization** | Implemented | Untested | Untested | Implemented |
| **File Open (`file_open`)** | Implemented | Untested | Untested | Implemented |
| **File Reveal (`file_reveal`)** | Implemented | Untested | Untested | Implemented |
| **Workspace FIFO Limits (100)** | Implemented | Implemented | Implemented | Implemented |
| **Duplicate Suppression** | Implemented | Implemented | Implemented | Implemented |
| **Missing File Detection** | Implemented | Implemented | Implemented | Implemented |
| **Island State Machine** | Implemented | Untested | Untested | Implemented |
| **Widget Runtime & Registry** | Implemented | Untested | Untested | Implemented |
| **Keyboard Nav & Escape Collapse** | Implemented | Untested | Untested | Implemented |
| **Per-Widget Error Isolation** | Implemented | Implemented | Implemented | Implemented |
| **Reduced Motion Detection** | Implemented | Untested | Untested | Implemented |

---

## 4. Platform Limitations & Degraded States

- **Resilience**: If clipboard hooks, media sessions, or external file openers are unavailable, the corresponding service transitions gracefully to `Sleeping` or returns a typed `BbqError` without crashing the core process.
- **UI Graceful Fallback**: The Island gracefully displays the `BBQ` idle indicator.

---

## 5. Mock Provider for CI & Testing

`crates/platform::mock` provides an in-memory implementation of all platform traits, enabling 100% test coverage in headless CI runners without real display servers, native filesystem paths, or audio sinks:
- **MockMedia**: Simulates player open, playback change, metadata change, and player close.
- **MockClipboard**: Controllable simulation suite for text copied, consecutive duplicate copied, clipboard cleared, oversized contents, sensitive heuristics, and service unavailabilities.
- **MockFile**: In-memory simulation of file path validation, directory rejection, open and reveal invocation recording, and custom metadata injection.
