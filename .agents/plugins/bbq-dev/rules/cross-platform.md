# BBQ Cross-Platform Guidelines

## 1. Supported Platforms
BBQ targets three major desktop platforms:
- **Windows**: Windows 10/11 (x86_64, aarch64), Win32 API, WinRT SMTC, Win32 raw input / global hotkeys.
- **macOS**: macOS 12+ (x86_64, aarch64), AppleScript / CoreGraphics display geometry, sandboxed media/notification permissions.
- **Linux**: X11 and Wayland (x86_64), FreeDesktop notifications, MPRIS media player D-Bus signals, compositor-dependent window positioning.

## 2. Platform Capability Truthfulness
Never assume full capability support across all platforms. Use the established platform capability contract in `bbq_core::PlatformCapabilities`:

| Feature | Windows | macOS | Linux (X11) | Linux (Wayland) |
| :--- | :--- | :--- | :--- | :--- |
| **Global Hotkey** | Supported | Unavailable | Unavailable | Unavailable |
| **Window Positioning** | Supported | Supported | Supported | CompositorDependent |
| **Always-on-top / Docking** | Supported | Supported | Supported | CompositorDependent |
| **Clipboard Live Push** | Supported | Passive | Passive | Passive |
| **Clipboard History** | Supported | Supported | Supported | Supported |
| **Media Playback Control** | Supported | PermissionRequired | Supported | Supported |
| **Media Events** | Supported | Unavailable | Passive | Passive |
| **Timeline / Seek** | Supported | Unavailable | Unavailable | Unavailable |
| **Notifications** | Supported | Supported | Supported | Supported |
| **Launch at Login** | Supported | Supported | Supported | Supported |
| **Display Geometry** | Supported | Supported | Supported | CompositorDependent |
| **Display Change Events** | Supported | Unavailable | Unavailable | Unavailable |

## 3. Platform Isolation Rules
- Never use OS-specific APIs in shared modules. Keep them strictly enclosed in `crates/platform/src/<os>.rs`.
- Do not make changes for one operating system that break another operating system's build or runtime tests.
- When native APIs are unavailable on a platform (e.g. Wayland absolute positioning or macOS global hotkey hooks), degrade gracefully with clear fallback behavior or informative UI status.
