# BBQ Platform Support & Capability Matrix

> **Document Version**: 1.0.0 (Release Freeze)  
> **Last Verified**: 2026-09-13

This document provides the authoritative status of BBQ across supported operating systems and window environments. BBQ strictly distinguishes between code that is **verified on physical runtime hardware** versus code that is **implemented in cross-platform traits but awaiting physical hardware validation**.

---

## 1. Platform Status Classifications

- **Windows (10/11 x64)**: **READY / VERIFIED**
- **macOS (12+ Monterey / Ventura / Sonoma / Sequoia)**: **IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING**
- **Linux X11**: **IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING**
- **Linux Wayland**: **COMPOSITOR-DEPENDENT / LIMITED**

---

## 2. Definitive Platform Capability Matrix

| Capability | Windows (Win32 / WinRT) | macOS (Cocoa / AppKit) | Linux X11 (Xlib / XRandR) | Linux Wayland (wlroots / Mutter / KWin) |
|---|:---:|:---:|:---:|:---:|
| **Global Hotkey** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `NOT-SUPPORTED` |
| **Media (Playback & Metadata)** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` |
| **Notifications** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` |
| **Clipboard (Event-Driven)** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `COMPOSITOR-DEPENDENT` |
| **Autostart** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` |
| **File Open** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` |
| **File Reveal in Folder** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` |
| **Quick Launcher** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` |
| **Display Geometry** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `COMPOSITOR-DEPENDENT` |
| **Per-Monitor DPI** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `COMPOSITOR-DEPENDENT` |
| **Multi-Monitor Layouts** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `COMPOSITOR-DEPENDENT` |
| **Negative Coordinates** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `COMPOSITOR-DEPENDENT` |
| **Transparent Window** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `COMPOSITOR-DEPENDENT` |
| **Always on Top** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `COMPOSITOR-DEPENDENT` |
| **Absolute Positioning** | `VERIFIED` | `IMPLEMENTED-UNVERIFIED` | `IMPLEMENTED-UNVERIFIED` | `NOT-SUPPORTED` |

---

## 3. Detailed Subsystem Analysis by Platform

### A. Windows (Win32 / WinRT) — Status: READY / VERIFIED

- **Runtime Target**: Windows 10 (1809+) and Windows 11 (all editions), x64 architecture.
- **Window Management**:
  - Transparent, frameless top-center overlay window.
  - Native styles: `WS_EX_TOPMOST`, `WS_EX_LAYERED`, `WS_EX_TOOLWINDOW` (prevents taskbar clutter).
  - High-DPI awareness (`PerMonitorV2`).
- **Global Hotkey**:
  - Registered via Win32 `RegisterHotKey` with `MOD_CONTROL` + `VK_SPACE`.
  - Event loop processes `WM_HOTKEY` without continuous key polling.
- **Media Control (SMTC)**:
  - Consumes `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`.
  - Subscribes directly to `CurrentSessionChanged` WinRT callbacks.
  - Zero polling. Play, pause, next, previous dispatched asynchronously.
- **Clipboard**:
  - Hidden message window (`HWND_MESSAGE`) registered via `AddClipboardFormatListener`.
  - Reacts to `WM_CLIPBOARDUPDATE` messages.
  - Reads text formats safely with `GlobalLock`/`GlobalUnlock`.
- **Autostart**:
  - Configures `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BBQ` via Win32 Registry API.
- **File System & Launcher**:
  - Opens files via `rundll32 url.dll,FileProtocolHandler <path>`.
  - Reveals files via `explorer.exe /select,"<path>"`.

---

### B. macOS (Cocoa / AppKit) — Status: IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING

- **Window Management**:
  - Frameless `NSWindow` with `NSWindowStyleMaskBorderless`.
  - Window level: `NSStatusWindowLevel` / `NSFloatingWindowLevel`.
  - Collection behavior: `NSWindowCollectionBehaviorCanJoinAllSpaces`.
- **Global Hotkey**:
  - Target implementation: Carbon `RegisterEventHotKey` or Cocoa `NSEvent.addGlobalMonitorForEvents`.
  - Current Status: Trait interface declared; fallback in-app shortcuts active until native Carbon runtime validation on macOS hardware.
- **Media Control**:
  - Current Implementation: CLI bridge to `osascript` targeting Music and Spotify apps.
  - Target 1.1 Implementation: CoreMedia / `MPNowPlayingInfoCenter` via native Objective-C runtime bridge.
- **Clipboard**:
  - Current Implementation: CLI bridge to `pbcopy` and `pbpaste`.
  - Limitation: macOS lacks asynchronous pasteboard push notifications. BBQ uses lazy on-demand queries when the island gains focus.
- **Autostart**:
  - Generates LaunchAgent property list at `~/Library/LaunchAgents/com.bbq.desktop.plist`.
- **Display Geometry**:
  - Uses `CoreGraphics` (`CGGetActiveDisplayList`, `CGDisplayBounds`).
  - Supports Retina 2.0x scale factor calculation and menu bar exclusion offset (`y = 25`).

---

### C. Linux X11 — Status: IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING

- **Window Management**:
  - Window type: `_NET_WM_WINDOW_TYPE_DOCK` with `_NET_WM_STATE_STAYS_ON_TOP`.
  - Composite extension for transparent Alpha channel backing.
- **Global Hotkey**:
  - Target implementation: X11 `XGrabKey` on root window with `XEvent` loop.
  - Current Status: Trait interface declared; fallback in-app shortcuts active until native X11 hardware testing.
- **Media Control**:
  - Current Implementation: CLI bridge to `playerctl`.
  - Target 1.1 Implementation: Direct D-Bus client connecting to `org.mpris.MediaPlayer2.*` interfaces.
- **Clipboard**:
  - Current Implementation: CLI bridge to `xclip` / `xsel`.
  - Target 1.1 Implementation: `XFixesSelectSelectionInput` for `CLIPBOARD` atom selection changes.
- **Autostart**:
  - Generates standard XDG autostart desktop entry at `~/.config/autostart/com.bbq.desktop.desktop`.
- **Display Geometry**:
  - Uses `XRandR` display enumeration for multi-monitor geometry, screen bounding boxes, and physical DPI calculation.

---

### D. Linux Wayland — Status: COMPOSITOR-DEPENDENT / LIMITED

- **Core Architectural Limitation**:
  - Wayland security architecture fundamentally restricts client applications from positioning themselves at absolute screen coordinates (`set_position`), querying global mouse cursor coordinates, or capturing global keyboard shortcuts (`XGrabKey` equivalent does not exist in core Wayland).
- **Absolute Positioning**:
  - **NOT-SUPPORTED** in standard Wayland.
  - **COMPOSITOR-DEPENDENT**: On wlroots-based compositors (Sway, Wayfire, Hyprland), positioning requires the `zwlr_layer_shell_v1` protocol extension. On GNOME (Mutter) and KDE (KWin), external window rules or compositor extensions are mandatory.
- **Global Hotkey**:
  - **NOT-SUPPORTED** via direct key grabbing.
  - Requires the desktop portal `org.freedesktop.portal.GlobalShortcuts` (XDG Desktop Portal 1.17+).
- **Clipboard**:
  - **COMPOSITOR-DEPENDENT**: Background clipboard snooping is blocked by design. Supported via `wlr-data-control` on wlroots compositors; degraded to explicit focused-paste on standard GNOME/KDE sessions.
- **Graceful Degradation Policy**:
  - BBQ does **not** employ hacky workarounds or fake implementations.
  - If a Wayland capability is denied by the compositor, the subsystem cleanly reports `NotSupported` or `Degraded`, falling back to standard centered window placement and in-app shortcuts.
