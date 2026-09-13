# Changelog

All notable changes to BBQ are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-13 (Release Freeze)

### Added
- **First-Run Experience & Onboarding Tour**:
  - Interactive 6-step accessible welcome tour introducing island mechanics, hotkeys, privacy, and personalization.
  - Keyboard accessible navigation (`Escape` to skip, `Enter` / `Arrow` keys to advance).
  - Explicit first-run state detection persisted in local SQLite settings (`first_run_completed`, `onboarding_completed`).
  - Replay Welcome Tour action directly accessible from the Settings About tab.
- **Native OS Autostart Support**:
  - Native Windows Registry integration (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).
  - Native macOS LaunchAgent property list generation (`~/Library/LaunchAgents/com.bbq.desktop.plist`).
  - Native Linux XDG Autostart desktop entry (`~/.config/autostart/com.bbq.desktop.desktop`).
  - Clean mock capability provider for headless test environments.
- **Production Packaging & Bundle Infrastructure**:
  - Full Tauri 2 bundle configuration with per-user (`currentUser`) NSIS installer and standard MSI package for Windows.
  - Multi-resolution icon pipeline (`32x32`, `128x128`, `128x128@2x`, `icon.icns`, `icon.ico`).
  - Unified authoritative `1.0.0` version across Cargo workspace, Tauri configuration, desktop application, and shared packages.
- **About & Identity View**:
  - Dedicated About tab in Settings displaying version, license, local-first guarantee, and project source references.

### Changed
- **Version Unification**: All workspace crates, package manifests, and runtime metadata aligned to `1.0.0`.
- **Tauri Bundle Mode**: Activated production bundler with metadata, descriptions, copyright, and platform targets.
- **Settings Store**: Synchronized `start_at_login` changes with native `PlatformAutostart` implementation.

### Privacy
- **Privacy-First Defaults Maintained**: Clipboard history tracking is disabled by default upon initial launch.
- **Zero Remote Telemetry**: Strict zero-telemetry policy verified; no analytics or remote phone-home libraries.
- **Zero Network Activity**: No outbound network requests initiated by the application or onboarding flow.
- **PII-Sanitized Logging**: Rust backend logger sanitizes sensitive text before writing to debug files.

### Performance
- **Zero Polling Invariant Preserved**: 0 `setInterval`, 0 continuous `requestAnimationFrame`, and 0 background backend polling loops.
- **Bounded Resource Budgets**: Strictly enforced limits on clipboard history (100 items), search results (20 items), and SQLite retention (30 days).
- **Transient DOM Cleanup**: Onboarding modal completely unmounts from DOM upon completion with zero residual timers or subscriptions.

### Platform Support Classification
- **Windows**: **READY / VERIFIED** — Full native runtime verified on Windows 10/11 x64, including WinRT media transport, Win32 global hotkeys, per-user NSIS installer, MSI installer, and registry autostart.
- **macOS**: **IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING** — Native trait architecture implemented with LaunchAgents plist autostart, Cocoa windowing, and AppleScript/CoreGraphics bridge; physical hardware runtime validation pending.
- **Linux X11**: **IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING** — Native X11 trait architecture implemented with XRandR geometry, XDG autostart, and MPRIS/notify-send CLI adapters; physical hardware runtime validation pending.
- **Linux Wayland**: **COMPOSITOR-DEPENDENT / LIMITED** — Absolute positioning and global hotkeys restricted by Wayland security architecture; client gracefully degrades without crashes.

### Known Limitations
- **Linux Wayland**: Compositor-specific restrictions on global hotkey registration and absolute window placement on standard Wayland compositors (gracefully falls back to in-app shortcuts and standard window mode).
- **Display Selection**: Target display selection on multi-monitor setups requires a display change event or restart to reposition on certain legacy multi-DPI configurations.

---

## [0.1.0] - 2026-09-08

### Added
- Monorepo Architecture: pnpm workspace and Cargo multi-crate workspace setup.
- Core Crate (`crates/core`): Structured error management (`BbqError`), typed event bus architecture, safe configuration directory resolver, and PII-sanitized `tracing` logging.
- Storage Crate (`crates/storage`): Bundled SQLite integration with schema version migration runner and repository traits.
- Platform Abstraction Crate (`crates/platform`): Trait boundaries (`PlatformWindow`, `PlatformDisplay`, `PlatformClipboard`, `PlatformMedia`, `PlatformNotification`, `PlatformSystem`, `PlatformNetwork`) with Windows, macOS, Linux, and Mock implementations.
- Service Layer (`crates/services`): Decoupled lifecycle definitions (`init`, `start`, `stop`, `health_check`) and registry for all 14 core services.
- Desktop Application (`apps/desktop`): Tauri 2.x frameless island window, Vite + React 19 + TypeScript frontend with GPU-accelerated 60 FPS transitions and domain-separated state stores.
- Documentation: Comprehensive architecture, performance, platform, security, and development guides.
- CI / Quality Assurance: GitHub Actions workflow covering Linux, macOS, and Windows matrix.
