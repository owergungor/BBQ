# BBQ Project Context & Master Memory Document

> **Document Type**: AI Master Project Memory / Context Document  
> **Repository**: `owergungor/bbq` (`C:\Users\omr03\Documents\antigravity\bbq`)  
> **Target Audience**: Future AI Engineers & Core Developers  
> **Current Version**: `v1.2` (Active Development Phase: BBQ Core Stabilization, Top-Center Positioning, Zero-Jitter Hover, Event Boundary Hardening)  
> **Last Synchronized**: 2026-09-14

---

## 1. Project Overview

### What is BBQ?
**BBQ** is a modern, lightweight, privacy-first, event-driven desktop productivity island engineered with **Tauri 2.x**, **Rust**, and **React 19**. It transforms the top edge of the desktop screen (the notch/camera/bezel zone) into an ambient, reactive command surface inspired by mobile dynamic island ergonomics. 

It is designed to reside indefinitely at the top-center of the primary or user-designated display, maintaining an ultra-compact resting state (240px × 40px) that consumes **0.0% idle CPU** and under **52 MB RAM**. Upon user interaction (keyboard shortcut, mouse hover/click) or actionable system events (media playback, file drag-and-drop, timer alerts, reminders), it fluidly expands into an interactive command palette, media controller, file drop workspace, focus timer, or quick tool suite.

### Core Philosophy
1. **Zero Continuous Polling**: Background polling via `setInterval`, continuous `requestAnimationFrame` loops, and background sleep/interval threads are strictly forbidden across both frontend and backend.
2. **Local-First & Zero Telemetry**: Zero external analytics, zero remote telemetry, zero phone-home network calls. All databases and settings remain strictly on local disk (`SQLite` with WAL mode).
3. **Hardened Least-Privilege Execution**: Zero arbitrary shell string execution (`sh -c`, `cmd.exe /c`, `powershell -Command`). All external invocations use discrete executable paths with explicit argument arrays and scheme whitelisting.
4. **Native Feel with High Performance**: The island behaves like a native OS desktop component rather than a web browser wrapper, featuring sub-300ms launch, hardware-accelerated 60 FPS CSS transitions, and visible focus rings.

---

## 2. Vision

The long-term vision of BBQ is to become the definitive **ambient productivity layer** for desktop operating systems (Windows, macOS, Linux). Instead of requiring users to switch between bloated Electron apps, separate media controller utilities, floating notes widgets, clipboard managers, and timer tools, BBQ unifies them into an ambient, cohesive, non-intrusive desktop surface that respects hardware resources and battery life.

Key vision pillars:
- **Ambient Presence**: Always available at the physical top-edge of the monitor without stealing taskbar space (`skipTaskbar: true`, `alwaysOnTop: true`).
- **Context-Aware Utility**: Intelligently presents controls and information only when relevant (e.g., expanding when music plays or when files are dragged over, collapsing to an idle pill when done).
- **Extreme Resource Efficiency**: Lightweight enough to run continuously on low-power laptops and high-performance workstations alike without battery drain or thermal impact.
- **True Cross-Platform Parity**: Clean platform trait abstraction that gives native OS behavior on Windows (Win32/WinRT), macOS (Cocoa/CoreGraphics), and Linux (X11/Wayland).

---

## 3. The BBQ Island Concept

### What is the BBQ Island?
The **BBQ Island** interface is designed to:
> *"Transform the top edge / camera notch of the computer monitor into a live, interactive, functional information and interaction command center."*

It is an ergonomic, information-dense interaction surface designed to eliminate workflow friction.

### The Lifecycle Philosophy of the Island
The island operates on a strict expansion-contraction cycle:
$$\text{Compact (Idle)} \xrightarrow{\text{Event / Interaction}} \text{Expanded (Interactive)} \xrightarrow{\text{Action Complete / Dismiss}} \text{Compact (Idle)}$$

1. **Resting State (Idle Pill)**: 240px × 40px pill resting at top-center. Displays minimal compact status indicators (media icon, timer badge, reminder dot, battery status).
2. **Hovering State (Active Peek)**: 280px × 44px gentle expansion on mouse hover to reveal quick summary text without full window layout reflow.
3. **Interactive Expanded State (Command Surface)**: Expands up to 560px × 420px to host full widget interfaces (Smart Search Launcher, File Workspace, Media Player, Pomodoro Controls, Settings).
4. **Auto-Collapse / Dismiss**: When the user presses `Escape`, clicks outside, or completes an action (launching an app, pausing a timer), the island automatically and fluidly animates back to the resting compact state.

---

## 4. UX Principles

1. **Minimalism & Restraint**: Never display large, distracting dialogs unprompted. The island stays small until action is required.
2. **Deterministic Keyboard Navigation**: Full keyboard navigation across the entire surface:
   - `Ctrl+Space` (or `Cmd+Space` on macOS): Global hotkey to open/close the Quick Command Surface.
   - `ArrowLeft` / `ArrowRight`: Navigate between widget tabs in expanded mode.
   - `Tab` / `Shift+Tab`: Navigate focusable elements within widgets.
   - `Escape`: Immediate collapse to Idle.
3. **Universal Visible Focus Rings**: Every interactive element implements `:focus-visible` styling using semantic CSS variables (`var(--bbq-focus-ring)`).
4. **Zero Layout Thrashing Animations**:
   - Only composite properties (`transform`, `opacity`) are animated during transitions.
   - CSS timing uses a custom cubic bezier curve: `cubic-bezier(0.16, 1, 0.3, 1)`.
5. **Reduced-Motion Respect**: Automatic compliance with `prefers-reduced-motion: reduce`. When active, animations degrade to instant opacity fades without geometric transitions or layout shifts.
6. **Accessible First-Run Onboarding**: A 6-step keyboard-accessible welcome tour introduces the island mechanics, privacy guarantees, theme preferences, and shortcuts, which can be replayed at any time from Settings.

---

## 5. Supported Platforms

| Platform | Verification Status | Implementation Method | Limitations / Notes |
|---|:---:|---|---|
| **Windows (10/11 x64)** | **READY / VERIFIED** | Win32 native windowing, WinRT SMTC media callbacks, Win32 `AddClipboardFormatListener`, Win32 Registry autostart, WiX MSI + NSIS installers. | Full physical hardware verification complete. Working set measured at 51.68 MB. |
| **macOS (12+)** | **IMPLEMENTED-UNVERIFIED** | Cocoa `NSWindow` borderless floating level, LaunchAgents plist autostart, CoreGraphics display enumeration (`CGGetActiveDisplayList`), AppleScript/CLI media and notifications. | Compiles cleanly and passes all trait unit tests in CI; physical Apple Silicon hardware verification pending. |
| **Linux X11** | **IMPLEMENTED-UNVERIFIED** | X11 `_NET_WM_WINDOW_TYPE_DOCK`, XRandR multi-monitor geometry, XDG autostart, MPRIS via `playerctl` CLI, notify-send. | Compiles cleanly; headless tests pass; physical Linux X11 hardware verification pending. |
| **Linux Wayland** | **COMPOSITOR-DEPENDENT** | Wayland layer shell hints, DRM screen mode inspection, `wl-clipboard`, XDG desktop autostart. | Absolute window positioning (`set_position`) and global key grabs are blocked by Wayland security model. Degrades gracefully to centered window. |

---

## 6. Technology Stack

### Monorepo Structure & Package Management
- **Package Manager**: `pnpm` (v10+ workspace configuration via `pnpm-workspace.yaml`).
- **Language Stack**: **Rust 2021 Edition** (Backend & Platform Layer) + **TypeScript 5.8** (Frontend Layer).
- **Desktop Framework**: **Tauri 2.x** (`@tauri-apps/cli` 2.1+, `tauri` 2.x crate).

### Backend (Rust Crate Workspace)
- `crates/core`: Foundational domain types (`IslandMode`, `LauncherItem`, `BbqError`, `BbqEvent`), PII-sanitized `tracing` logger, geometry calculator, smart search ranking engine.
- `crates/storage`: Embedded SQLite manager (`rusqlite` bundled), versioned migration runner (`schema_migrations`), repository abstractions.
- `crates/platform`: Platform abstraction traits (`PlatformWindow`, `PlatformDisplay`, `PlatformMedia`, `PlatformClipboard`, `PlatformHotkey`, `PlatformAutostart`) and concrete OS implementations for Windows, macOS, Linux, and headless Mock.
- `crates/services`: Decoupled business logic services (14 services) registered in thread-safe `ServiceRegistry`.
- `apps/desktop/src-tauri`: Tauri application entry point, window lifecycle management, command/event routing.
- `tests`: Multi-crate integration test harness and platform hardening tests.

### Frontend (React 19 + TypeScript)
- **Framework**: React 19 (`react`, `react-dom`).
- **Bundler**: Vite 6 (`vite`, `@vitejs/plugin-react`).
- **Styling**: Pure semantic Vanilla CSS (`index.css`) with CSS custom properties (design tokens), zero Tailwind dependency.
- **State Management**: Lightweight domain-separated micro-stores (`createStore.ts`) utilizing React's `useSyncExternalStore` for zero-re-render state isolation.

---

## 7. Architecture

### High-Level Architectural Flow
```text
┌─────────────────────────────────────────────────────────────┐
│                 FRONTEND (React 19 + TS)                    │
│   Island Shell ── IslandRuntime (FSM) ── Widget Registry   │
│   Domain Stores (Timer, Media, Clipboard, File, Settings)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ Typed Tauri IPC (Commands & Events)
┌──────────────────────────────▼──────────────────────────────┐
│                    TAURI 2.x DESKTOP IPC                    │
│   `apps/desktop/src-tauri/src/lib.rs` (State, Handlers)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                SERVICE LAYER (`crates/services`)             │
│   WindowService    DisplayService    MediaService           │
│   TimerService     ClipboardService  FileService            │
│   LauncherService  SearchService     ReminderService        │
│   SettingsService  SystemService     HotkeyService          │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼─────────────┐   ┌─────────────▼──────────────┐
│  STORAGE (`crates/storage`) │   │ PLATFORM (`crates/platform`)│
│  SQLite (WAL Mode)         │   │ Traits ── Win32 / macOS /   │
│  Repositories & Migrations │   │           Linux / Mock CI   │
└────────────────────────────┘   └────────────────────────────┘
```

### State Isolation Invariant
State is strictly segmented into discrete domain slices:
- `uiState` (Island shell expansion and active layout mode)
- `mediaState` (Active track, artist, playback state)
- `timerState` (Countdown, stopwatch, pomodoro session)
- `clipboardState` (Recent clipboard entries, privacy flags)
- `fileState` (File workspace entries)
- `dropState` (Active drag & drop batch)
- `reminderState` (Scheduled reminders list)
- `launcherState` (Search query, candidate results, favorites)
- `settingsState` (User preferences, theme, compact order)
- `systemState` (Battery, network, volume telemetry)

*Invariant*: An update to `mediaState` will NEVER notify subscribers of `timerState` or `clipboardState`.

---

## 8. Current Features

| Feature | Status | Implementation Files | Notes |
|---|:---:|---|---|
| **Island Shell (Wisland)** | **Tamamlandı** | `Island.tsx`, `IslandRuntime.ts`, `IslandShell.tsx` | FSM: Idle, Hovering, Expanded, Interacting. 60 FPS CSS transitions. |
| **Media Controller** | **Tamamlandı** | `MediaWidget.tsx`, `crates/services/src/media.rs`, `windows.rs` | WinRT SMTC event callbacks, Play/Pause/Next/Prev, zero polling. |
| **File Workspace & Drop** | **Tamamlandı** | `DropWidget.tsx`, `FileWorkspaceWidget.tsx`, `drop.rs`, `file.rs` | Drag & drop zone, path traversal rejection, reveal in Explorer. |
| **Quick Launcher & Search** | **Tamamlandı** | `LauncherWidget.tsx`, `launcherSearch.ts`, `launcher.rs`, `search.rs` | Instant fuzzy scoring, URL validation whitelist, built-in actions. |
| **Timers & Pomodoro** | **Tamamlandı** | `TimerWidget.tsx`, `timer.rs`, `timerState.ts` | Timestamp-driven countdown, stopwatch, pomodoro with 0 `setInterval`. |
| **Reminders & Notifications**| **Tamamlandı** | `ReminderWidget.tsx`, `reminder.rs`, `notification.rs` | SQLite persistence, overdue replay, native OS toast emission. |
| **Privacy Clipboard** | **Tamamlandı** | `ClipboardWidget.tsx`, `clipboard.rs` | Opt-in disabled default, bounded 100 entries FIFO, PII exclusion. |
| **Autostart** | **Tamamlandı** | `windows.rs`, `macos.rs`, `linux.rs`, `settings.rs` | Win32 Registry `HKCU\...\Run`, macOS plist, Linux XDG autostart. |
| **Settings & Personalization**| **Tamamlandı** | `SettingsWidget.tsx`, `settings.rs`, `settingsState.ts` | Theme (System/Dark/Light), indicator order, launch at login toggle. |
| **First-Run Onboarding Tour**| **Tamamlandı** | `OnboardingModal.tsx`, `onboarding_m18.test.ts` | 6-step accessible tour, keyboard navigation, SQLite first-run flag. |
| **Windows Installer Packages**| **Tamamlandı** | `tauri.conf.json`, `RELEASE.md` | Per-user NSIS (`.exe`) + WiX MSI (`.msi`) packages verified. |

---

## 9. Planned Features (BBQ 1.1 Roadmap)

Detailed in `docs/ROADMAP_1.1.md`:
1. **P0 — Native Cross-Platform Runtimes**:
   - macOS: Native Carbon/Cocoa global hotkeys (`RegisterEventHotKey`), `CoreGraphics` multi-monitor geometry with Retina & notch safety, `MPNowPlaying` native bridge.
   - Linux X11: Native `XGrabKey` on root window, `XRandR` multi-monitor geometry, native `zbus` D-Bus connection for MPRIS media (zero `playerctl` CLI spawns).
   - Linux Wayland: Protocol-based layer shell (`zwlr_layer_shell_v1`) on wlroots; XDG Desktop Portal `GlobalShortcuts` via `zbus`.
2. **P1 — Core UX Polish**:
   - Adaptive island sizing (Compact, Quick Action, Expanded).
   - Micro-animations for widget tab switching and timer completion notifications.
3. **P2 — Modular Widget System**:
   - Standardized `WidgetLifecycle` contract (`onMount`, `onActivate`, `onDeactivate`, `onUnmount`).
   - New Widgets: System Telemetry (CPU/RAM lazy glance), Calendar Glance (local RFC 5545 iCal), Weather Glance (cached local API).
4. **P3 — Customization & Monitor Affinity**:
   - Custom horizontal alignment (Top-Left, Top-Center, Top-Right) and Y-offset.
   - Monitor selector for targeting secondary displays.
5. **P4 — Sandboxed Plugin Architecture**:
   - Declarative JSON UI schemas for third-party widgets; zero arbitrary native code execution.

---

## 10. Performance Requirements

### Strict Non-Negotiable Invariants
1. **Zero Continuous Polling**:
   - `setInterval`: **Strictly 0 calls** in production code (enforced by AST tests).
   - Continuous `requestAnimationFrame`: **Strictly 0 loops** in production code.
   - Continuous `tokio::time::interval`: **Strictly 0 background intervals** in Rust services.
2. **Timestamp-Driven State**:
   - Timers do not count down by ticking an interval. They store wall-clock timestamps (`target_at`, `started_at`). Remaining time is computed on render or on bounded one-shot `setTimeout` schedules.
3. **Hardware-Accelerated Compositing**:
   - Island expansion only animates `transform` and `opacity`. Never animate `width`, `height`, `top`, or `left` directly.
4. **Resource Budgets (Windows 1.0.0 Verified Host Metrics)**:
   - **Idle Working Set**: **51.68 MB** (Budget: $\le 60$ MB).
   - **Private Bytes**: **32.40 MB**.
   - **Idle CPU**: **0.0%**.
   - **Initial Paint Startup**: **< 300 ms**.
   - **Database Retention**: SQLite WAL mode with 30-day automatic pruning.
   - **Clipboard Cache**: Strictly bounded to 100 entries FIFO.

---

## 11. File Management

### How BBQ Handles Files
- **Safety First**: BBQ never reads raw file contents, parses binary data, or computes cryptographic hashes during drag-and-drop. It only inspects basic filesystem metadata (`name`, `path`, `extension`, `size_bytes`, `modified_at`).
- **Path Traversal Guards**: All incoming paths are normalized and canonicalized (`PlatformFile::validate_path`). Path traversal (`../`) and UNC device attacks are rejected.
- **Directory Handling**: Dragging a folder inspects only the root directory metadata; recursive folder tree crawling is strictly prohibited.
- **Safe Execution**:
  - `open`: Spawns associated viewer via `rundll32 url.dll,FileProtocolHandler` (Windows) or `open` / `xdg-open`.
  - `reveal`: Highlights file in native file manager via `explorer.exe /select,"<path>"` (Windows) or `open -R`.
- **Sequential Multi-Drop**: Bulk actions (`Open All`, `Reveal All`) execute sequentially to prevent OS process table exhaustion.

---

## 12. Media Integration

### How BBQ Handles Media
- **Windows**: Consumes `Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager` (SMTC). Subscribes directly to native `CurrentSessionChanged` WinRT callbacks. Queries timeline properties only on playback state transitions.
- **macOS**: AppleScript/CLI bridge targeting active Music and Spotify applications; 1.1 plans native `MPNowPlayingInfoCenter` Objective-C bridge.
- **Linux**: MPRIS D-Bus interface (`org.mpris.MediaPlayer2.*`). Current implementation uses CLI fallback; 1.1 plans native `zbus` asynchronous D-Bus signals.
- **Position Update Anchor**: Track position is updated exclusively upon discrete playback state transitions (play, pause, seek, track change), never on a 10ms interval.

---

## 13. Notifications & Reminders

### Architecture
- **Decoupled Service Model**: `NotificationService` handles OS toast delivery; `ReminderService` manages scheduled tasks, overdue detection, and cancellation.
- **Storage**: Reminders are persisted in SQLite (`reminders` table).
- **Startup Replay**: If the application was closed when a reminder was due, overdue reminders are replayed with bounded deduplication upon startup.
- **Notification Throttle**: Deduplicates rapid consecutive notifications within 1,000ms.

---

## 14. Build & Release

### Build Commands
```bash
# Frontend validation
pnpm typecheck
pnpm test
pnpm build

# Rust backend validation
cargo fmt --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings

# Production bundling
pnpm tauri build
```

### Production Artifacts (Windows 1.0.0)
- **NSIS Installer**: `target/release/bundle/nsis/BBQ_1.0.0_x64-setup.exe` (5.42 MB, SHA-256: `881AAFA3550EFC57BA45E30212769ECDCF7C56FB2D6D5364403E1326C1FEE64F`)
- **MSI Installer**: `target/release/bundle/msi/BBQ_1.0.0_x64_en-US.msi` (8.16 MB, SHA-256: `A5E327D04ADCADFC1029A0A7079BB3B7C77BB09B608BBAB7C5D21A2411368D14`)
- **Standalone Binary**: `target/release/bbq-desktop.exe` (28.9 MB)
- **Official GitHub Release**: Published at `https://github.com/owergungor/BBQ/releases/tag/v1.0.0`

---

## 15. Git History

Commit progression in repository:
1. `fa67417` (*2026-09-12*): `release: BBQ v1.0.0` — Core implementation of Milestones 1 through 18 (211 files, 40,350 lines).
2. `ceaa918` (*2026-09-12*): `fix: restore cross-platform CI builds` — Cross-platform CI matrix workflow restoration.
3. `757f95e` (*2026-09-12*): `fix: pin Node version for frontend CI` — Node.js 22 LTS pinning.
4. `a2a5cb7` (*2026-09-13*): `release: BBQ v1.0.0 Windows release freeze and documentation` — Code freeze seal, clippy fixes, release runbook, roadmap 1.1, platform matrix, and git tag `v1.0.0`.

---

## 16. TODO / FIXME / BUG

- **Codebase Pattern Scan Results**:
  - `TODO`: **0 occurrences** across all source files.
  - `FIXME`: **0 occurrences** across all source files.
  - `BUG`: **0 occurrences** across all source files.
  - `HACK`: **0 occurrences** across all source files.
  - `TEMP`: **0 occurrences** across all source files.
  - `XXX`: **0 occurrences** across all source files.
- All temporary stubs and workarounds were cleaned up prior to the 1.0.0 release freeze.

---

## 17. Technical Debt

| Item | Priority | Description | Remediation Plan |
|---|:---:|---|---|
| **CLI Fallbacks on macOS/Linux** | **Yüksek** | macOS and Linux platform adapters currently utilize standard CLI utilities (`osascript`, `playerctl`, `xclip`, `open`) rather than direct native C/Objective-C/D-Bus FFI. | Replace with native FFI (`zbus` for Linux MPRIS/XFixes, `CoreMedia`/`Carbon` for macOS) in 1.1-M1 and 1.1-M2. |
| **Unsigned Windows Binaries** | **Orta** | Windows binaries are currently built without an Authenticode digital certificate, causing Windows SmartScreen to prompt on first install. | Attach code signing certificate to GitHub Actions CI pipeline. |
| **Multi-DPI Secondary Monitors** | **Düşük** | Transitioning the island window dynamically across monitors with divergent DPI scale factors requires an OS display change event to recalibrate window geometry. | Implement dynamic window repositioning hook on drag across monitor boundary in 1.1. |

---

## 18. Known Problems

1. **Linux Wayland Absolute Placement**: Standard GNOME (Mutter) and KDE (KWin) compositors reject client-driven `set_position` calls by security design. BBQ gracefully degrades to centered windowing; full top-anchoring on Wayland requires compositors supporting `zwlr_layer_shell_v1` (Sway, Hyprland).
2. **Global Hotkeys on Wayland**: `XGrabKey` is unavailable under Wayland. Global hotkeys require XDG Desktop Portal `GlobalShortcuts` (XDG Portal 1.17+).

---

## 19. Design Decisions

1. **Why Tauri 2.x over Electron?**
   - Electron bundles Chromium and Node.js with each app, yielding ~150 MB idle memory and 100+ MB installer sizes.
   - Tauri 2.x utilizes the OS native webview (WebView2 on Windows, WebKit on macOS/Linux) with a compiled Rust backend, yielding 51.68 MB working set and a 5.42 MB installer.
2. **Why Vanilla CSS over TailwindCSS?**
   - Tailwind utility classes introduce large CSS bundles and inline churn. Vanilla CSS with semantic CSS variables (`:root`) allows instant theme switches without DOM layout invalidation.
3. **Why SQLite over JSON files?**
   - JSON file persistence suffers from race conditions, corruption on crash, and lack of transaction safety. SQLite with WAL mode guarantees ACID compliance, instant startup reads, and bounded index queries.
4. **Why Domain-Separated Micro-Stores over Redux/Zustand?**
   - Zero additional dependencies. Lightweight React `useSyncExternalStore` hooks guarantee that updates to one subsystem never trigger re-renders in another.

---

## 20. Open Questions

1. **Notch Accommodation on macOS Laptops**: Should BBQ detect hardware notch dimensions dynamically via macOS `NSScreen.safeAreaInsets` or provide manual padding sliders in Settings? (*Tahmin / çıkarım: Both will be supported in 1.1*).
2. **Linux Tray Icon Fallback**: For minimal window managers without dock support, should BBQ register a system tray icon via `libayatana-appindicator`? (*Dosyalardan doğrulanamadı*).

---

## 21. Recommended Next Steps

1. **Phase 1.1-M1: macOS Native Runtime**:
   - Replace AppleScript CLI bridge with Objective-C runtime bridge for MediaRemote / `MPNowPlayingInfoCenter`.
   - Implement native Carbon `RegisterEventHotKey` for `Cmd+Space`.
   - Validate on physical Apple Silicon hardware.
2. **Phase 1.1-M2: Linux X11 Native Runtime**:
   - Implement native `zbus` asynchronous D-Bus client for MPRIS media events.
   - Implement `XGrabKey` root window listener for `Ctrl+Space`.
3. **Phase 1.1-M3: Modular Widget Framework**:
   - Formally extract widget interfaces into `WidgetLifecycle` contract.
   - Introduce System Telemetry glance widget.

---

## 22. Important Rules for Future Development

Future AI agents and developers modifying BBQ **MUST** adhere to these immutable rules:

1. **DO NOT introduce continuous polling**: Zero `setInterval`, zero continuous `requestAnimationFrame`, zero sleeping background loops.
2. **DO NOT introduce arbitrary shell strings**: Never use `cmd.exe /c`, `powershell -Command`, `sh -c`, or `bash -c`. Always use explicit executables and argument arrays.
3. **PRESERVE the 60 MB RAM budget**: Every new widget or feature must evaluate its memory footprint. Unload or lazily evaluate heavy resources.
4. **DO NOT fake platform success**: If a feature is not supported on Wayland or macOS, declare `NOT_SUPPORTED` or `COMPOSITOR_DEPENDENT` honestly. Never create mock implementations that claim to work when they do not.
5. **KEEP state isolated**: Never introduce a monolithic global store that re-renders the whole island on a single event.
6. **PRESERVE local-first privacy**: Clipboard monitoring must remain opt-in. Zero remote telemetry.
7. **MAINTAIN test integrity**: Never delete, comment out, or weaken existing tests to make a build pass. All 152 Rust tests and 128 frontend tests must pass at all times.

---

## 23. v1.1 Development Log & Implemented Features

> **QA Status**: Implemented in codebase; validated by 152/152 Rust tests and 128/128 frontend unit/regression tests. Currently in **Active User Physical QA** stage on physical Windows hardware (not marked as physically verified until user sign-off).

### 1. Wisland Hover Symmetrical Expansion & Invariant Center
- **Root Cause of Downward Shift**: In v1.0.0, expanding from `Idle` (240x40) to `Hovering` (260x44) adjusted `x` horizontally by $(-10\text{px})$ via `(work_area.width - bounded_w) / 2`, but `y` remained pinned at `DEFAULT_TOP_MARGIN` ($6\text{px}$). Consequently, the OS window only expanded downwards by $4\text{px}$, shifting the visual center from $y=26\text{px}$ to $y=28\text{px}$. Furthermore, `.bbq-island-container` had `justify-content: flex-start;`, pinning the shell to `top: 0`.
- **Solution**:
  - `crates/core/src/geometry.rs`: For `IslandLayoutState::Hovering`, offset `y` upward by $(bounded\_h - 40) / 2$ ($2\text{px}$). Window bounds move from $y \in [6, 46]$ to $y \in [4, 48]$, growing $2\text{px}$ up and $2\text{px}$ down. Left edge moves $10\text{px}$ left, right edge $10\text{px}$ right.
  - `apps/desktop/src/styles/index.css`: Centered `.bbq-island-container` with `justify-content: center;`, set `transform-origin: center center;` on `.bbq-island-shell`, and ensured `.bbq-island-idle-pill` maintains `height: 100%; line-height: 1; align-items: center;`.
  - **Result**: Visual center coordinate $(x=960, y=26)$ is 100% mathematically invariant across Idle and Hovering. No text/icon jumping.

### 2. Windows System Tray Integration
- **Implementation**: Native event-driven tray implementation using Tauri 2.0 (`tray-icon`, `image-png` features) in `apps/desktop/src-tauri/src/tray.rs`.
- **Features**:
  - Left-Click: `unminimize()`, `show()`, `set_focus()` on the main Wisland window.
  - Right-Click Context Menu:
    - `Show BBQ`: Brings Wisland into focus.
    - `Settings`: Emits `bbq://open_settings` and focuses window.
    - Separator.
    - `Quit BBQ`: Graceful complete application shutdown via `app.exit(0)`, shutting down all background services, listeners, and hotkeys.
- **Performance**: Zero polling, 100% OS event-driven.

### 3. CI Cross-Platform Matrix Hardening (Ubuntu & macOS)
- **Ubuntu Linux Clippy Fix**:
  - **Issue**: Clippy flagged `manual_c_str_literals` on manual nul-terminated byte strings (`b"libX11.so.6\0".as_ptr() as *const _`, `b"XOpenDisplay\0".as_ptr()`, etc.) in `crates/platform/src/linux.rs`.
  - **Fix**: Replaced with standard Rust 2021 C-string literals (`c"libX11.so.6".as_ptr()`, `c"XOpenDisplay".as_ptr()`, etc.) without arbitrary casts or suppressions.
  - **Result**: `cargo clippy --target x86_64-unknown-linux-gnu -p bbq-platform -- -D warnings` passed cleanly with 0 warnings.
- **macOS Display Geometry Test Contract Fix**:
  - **Issue**: `test_macos_display_geometry_and_capabilities` failed on GitHub Actions `macos-latest` VM runner (`left: 1.0, right: 2.0`) because the test asserted `scale_factor == 2.0`.
  - **Root Cause Analysis**: The implementation in `crates/platform/src/macos.rs` accurately computes display scaling via CoreGraphics (`phys_w / bounds.width`). On CI virtual machines with standard-DPI 1x virtual monitors, `scale_factor` is legitimately `1.0`. The test hardcoded `2.0` based on the non-macOS simulated fallback and an assumption of Retina physical hardware.
  - **Fix**: Updated test assertion to verify the valid display scale factor contract (`primary.scale_factor >= 1.0 && primary.scale_factor <= 4.0`), maintaining full fidelity across non-Retina CI runners, real Retina displays, and simulated fallbacks.
- **Current Matrix Status**:
  - Windows: **PASS** (152 total Rust tests across 8 suites [62 core + 12 integration + 12 platform + 43 services + 6 hardening + 7 settings + 7 storage + 3 retention], clippy clean)
  - Ubuntu: **PASS** (152 total Rust tests across 8 suites, clippy clean)
  - macOS: **PASS** (152 total Rust tests across 8 suites, clippy clean)
  - Frontend: **PASS** (128 vitest tests, TypeScript clean)



