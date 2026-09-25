---
name: bbq-cross-platform
description: >-
  Verifies cross-platform capability matrix consistency, platform API isolation, and multi-OS parity across Windows, macOS, and Linux.
---

# BBQ Cross-Platform Verification Skill

Use this skill when introducing platform-dependent functionality or reviewing OS capability contracts.

## Verification Checklist

### 1. Platform Isolation Check
- Confirm all OS-specific API calls are guarded by `#[cfg(...)]` attributes:
  - `#[cfg(windows)]` for Win32 / WinRT APIs
  - `#[cfg(target_os = "macos")]` for AppleScript / CoreGraphics
  - `#[cfg(target_os = "linux")]` for zbus / D-Bus / X11 / Wayland
- Shared domain types in `bbq-core` must remain strictly platform-agnostic.

### 2. Platform Capability Matrix Audit
Ensure any changes to capability reporting in `crates/platform` accurately reflect the truth:
- Global Hotkey: Supported on Windows; Unavailable on macOS & Linux.
- Media Control: Supported on Windows & Linux; PermissionRequired on macOS.
- Media Timeline: Supported on Windows; Unavailable on macOS & Linux.
- Window Positioning: Supported on Windows, macOS, and X11; CompositorDependent on Wayland.
- Notifications: Supported on all platforms.
- Launch at Login: Supported on all platforms.

### 3. Frontend Capability Guards
Verify that frontend components (e.g. `SettingsWidget.tsx`, `MediaWidget.tsx`, `HotkeysWidget.tsx`) check platform capabilities and show truthful status badges (`.bbq-capability-badge`) rather than failing silently or crashing.
