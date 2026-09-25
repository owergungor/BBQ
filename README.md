# BBQ

> **Lightweight, Privacy-First Desktop Productivity Island**

BBQ brings the ambient, reactive ergonomics of a dynamic island to your desktop. Anchored unobtrusively at the top-center of your display, BBQ rests in a sleek compact pill and fluidly expands into a rich productivity command surface—featuring focus timers, quick application launching, system preferences, file workspace targets, reminders, clipboard history, Drop Shelf file staging, and media controls—without interrupting your workflow.

BBQ is built with **Tauri 2.x**, **Rust**, and **React 19**, engineered from the ground up for instantaneous response times, low working set memory (<= 60 MB), zero background battery drain, and uncompromised local-first privacy.

---

## What is BBQ?

BBQ transforms the unused top margin of your screen into an ambient multi-tool:
- **Dynamic Island Concept for Desktop**: An unobtrusive pill anchored at the top-center of your primary display presenting real-time status (timer countdowns, media playback, clipboard staging, or reminders).
- **Hardware-Accelerated Expansion**: Expands symmetrically on hover or click into an intuitive widget dashboard with 60 FPS transitions.
- **Privacy-First Architecture**: 100% offline and local-first. Zero telemetry, zero tracking, zero remote network calls, and all preferences stored locally in an embedded SQLite database (WAL mode).
- **Cross-Platform Target**: First-class support for Windows 10/11, macOS, and Linux desktop environments through truthful Rust platform abstractions.
- **Strict Performance Invariants**: Working set RAM target <= 60 MB, ~0% idle CPU utilization, and a strict zero-polling policy across both native and web layers.

---

## BBQ v2.0 Feature Set

BBQ v2.0 delivers production hardening, deep customization, modular IPC architecture, and reliable system integration:

### 1. Drop Shelf & Single-Instance File Forwarding
- **Drag-and-Drop Staging**: Stage files and folders onto the island for immediate workflow operations (reveal in file manager, open with default app, inspect metadata).
- **Single-Instance Forwarding**: Opening or dropping files onto secondary instances of BBQ safely forwards path arguments to the running primary island without duplicate processes.
- **Metadata-Only & Safe Storage**: Only bounded filesystem paths and metadata are retained (`MAX_DROP_ITEMS = 50`); underlying user files are never duplicated, altered, or moved unexpectedly.

### 2. Privacy-First Clipboard History
- **Disabled by Default**: Clipboard history recording is strictly opt-in, preserving user privacy out of the box.
- **Bounded Storage Retention**: FIFO history capped at configurable limits (`MAX_CLIPBOARD_MAX_ENTRIES = 100`) and automatic retention pruning (1–90 days).
- **Sensitive Content Masking**: Automatic regex detection for API tokens, private keys, passwords, and secrets with masked preview cards and protected visual indicators.
- **Zero Outbound Leaks**: No remote syncing, analytics, or logging of clipboard contents.

### 3. Focus Timer & Pomodoro
- **Modes**: Countdown, Stopwatch, and Pomodoro cycles with work/break phases.
- **Idle Invariant**: Mode switching never auto-starts sessions unexpectedly.
- **Quick Presets**: 1m, 5m, 10m, 15m, 25m, 45m, and 60m focus sessions, plus custom minute input.
- **Accessible Alerts**: Visual state badges and polite screen-reader announcements (`aria-live="polite"`) upon countdown completion.

### 4. Application & Workflow Launcher
- **Quick Actions Grid**: Fast access to Workspace, Downloads, Home, and system targets.
- **Fuzzy Search & Indexing**: Instant sub-millisecond search across applications and pinned targets.
- **Favorites & Recents**: Pin high-frequency tools with persistent ordering.

### 5. Media Controls & System HUD
- **Now Playing Display**: Native media track info and transport controls (Play/Pause, Next, Previous, Seek).
- **System Audio & Volume**: Master volume sliders with mute toggles and battery/network status indicators.

### 6. Personalization & Settings HUD
- **Appearance Modes**: Real-time switching between **Light**, **Dark**, and **System** themes.
- **Accent Colors**: 11 curated platform presets plus custom HEX input with dynamic WCAG 2.1 AA/AAA contrast verification.
- **Geometry Customization**: Real-time slider controls for compact island width (180px–640px) and height (36px–520px).
- **Deterministic Diagnostic Export**: "Copy Diagnostic Info" button generates sanitized, privacy-safe system metadata (OS, architecture, capabilities, layout dimensions) strictly excluding usernames, file paths, tokens, and clipboard text.
- **Strict Content Security Policy (CSP)**: Hardened production CSP restricting script, style, image, and IPC origins.

---

## Architecture Overview

BBQ follows a strict layered, decoupled architecture with zero cross-layer leakage:

```
┌────────────────────────────────────────────────────────┐
│                   React 19 Frontend                    │
│   (Domain State Stores, SVG Icons, CSS Token Theming)  │
│   Strict CSP: default-src 'self', script-src 'self'   │
└───────────────────────────┬────────────────────────────┘
                            │ Tauri 2 IPC (Commands & BbqEvent Streams)
┌───────────────────────────▼────────────────────────────┐
│              Modular Tauri Command Layer               │
│  (commands/{island, display, settings, media, ...})   │
├────────────────────────────────────────────────────────┤
│                   Rust Core Services                   │
│  (Window, Display, Timer, Hotkey, Drop, Clipboard)     │
├───────────────────────────┬────────────────────────────┤
│   Platform Abstractions   │       SQLite Storage       │
│  (Win32, Cocoa, X11/XDG)  │      (WAL Mode, Pruning)   │
└───────────────────────────┴────────────────────────────┘
```

- **Frontend (`apps/desktop`)**: React 19 + TypeScript + Vite. Exclusively uses centralized CSS tokens from `src/styles/index.css`. Zero Tailwind, zero CSS-in-JS, zero external state libraries.
- **IPC Modularization (`apps/desktop/src-tauri/src/commands/`)**: 69 commands partitioned into domain modules (`island.rs`, `display.rs`, `settings.rs`, `media.rs`, `clipboard.rs`, `files.rs`, `drop.rs`, `system.rs`, `timer.rs`, `reminders.rs`, `launcher.rs`, `hotkey.rs`).
- **Core Engine (`crates/core`)**: Pure domain models, geometry calculation, bounding invariants, and error definitions.
- **Platform Layer (`crates/platform`)**: Platform implementations isolated in OS-guarded modules (`windows.rs`, `macos.rs`, `linux.rs`, `mock.rs`) exposing uniform traits (`PlatformProvider`).
- **Services (`crates/services`)**: Business logic, bounded state, event emission, and lifecycle orchestration.
- **Storage (`crates/storage`)**: Bundled SQLite database in WAL mode with auto-migrations, corruption quarantine recovery, and transactional FIFO bounds.

---

## Platform Support & Truthful Capability Matrix

BBQ queries platform capabilities at startup and communicates availability truthfully:

| Capability | Windows (10/11) | macOS (12+) | Linux (X11) | Linux (Wayland) |
| :--- | :--- | :--- | :--- | :--- |
| **Window Positioning** | Supported | Supported | Supported | Compositor Dependent |
| **Global Hotkey** | Supported | Permission Required | Supported | Compositor Dependent |
| **Clipboard Live Events** | Supported | Passive / On-Demand | Supported | Supported |
| **Clipboard History** | Supported | Supported | Supported | Supported |
| **Media Controls** | Supported (SMTC) | Supported (NowPlaying) | Supported (MPRIS) | Supported (MPRIS) |
| **Native Notifications** | Supported | Supported | Supported (libnotify) | Supported (libnotify) |
| **Multi-Monitor DPI** | Supported | Supported | Supported | Supported |
| **Launch at Login** | Supported (Registry) | Supported (LaunchAgent)| Supported (Autostart)| Supported (Autostart)|

### Platform-Specific Limitations & Permissions

- **Linux (Wayland)**: Absolute window positioning and global hotkeys are compositor-dependent under Wayland protocols (`xdg-shell` / `wlr-layer-shell`). When running under GNOME Wayland or Sway, window placement relies on compositor placement rules.
- **macOS Permissions**: Global hotkey registration requires Accessibility permissions (`AXIsProcessTrusted`). Media controls may require System Events permissions depending on target playback clients.
- **Code Signing**: Nightly and open-source builds do not include proprietary Apple Developer ID notarization or Windows EV code-signing certificates. On Windows, SmartScreen warnings can be bypassed via "More info -> Run anyway". On macOS, gatekeeper quarantine can be cleared via `xattr -cr /Applications/BBQ.app`.

---

## Resource & Performance Invariants

BBQ enforces strict architectural invariants verified in automated test suites:
- **RAM Budget**: <= 60 MB practical working set RAM during compact idle state.
- **CPU Budget**: ~0% idle CPU utilization.
- **Zero-Polling Policy**: Strict prohibition against `setInterval`, continuous `requestAnimationFrame` loops, and recursive `setTimeout` polling. Updates are strictly event-driven.
- **Storage Bounds**: FIFO bounds strictly enforce `MAX_DROP_ITEMS = 50` and `MAX_CLIPBOARD_MAX_ENTRIES = 100` to prevent database bloat over time.
- **Reduced Motion**: Respects `prefers-reduced-motion` across all CSS transitions and animations.

---

## Development & Build Instructions

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **pnpm**: `>= 9.0.0`
- **Rust**: `>= 1.85.0` (`stable`)
- **Platform Dependencies**:
  - *Linux (Ubuntu/Debian)*: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev`
  - *Linux (Fedora)*: `webkit2gtk4.1-devel openssl-devel libayatana-appindicator-devel libdbus-devel`
  - *macOS*: Xcode Command Line Tools
  - *Windows*: Visual Studio C++ Build Tools

### Installation & Local Run
```bash
# Clone repository
git clone https://github.com/owergungor/bbq.git
cd bbq

# Install frontend dependencies
pnpm install

# Run frontend + desktop app in development mode
pnpm dev
```

---

## Testing & Quality Verification

Run the full verification suite across frontend and Rust crates:

```bash
# 1. Frontend automated tests (382 tests passing across 80 suites)
pnpm --filter @bbq/desktop test

# 2. TypeScript typecheck
pnpm --filter @bbq/desktop typecheck

# 3. Production frontend build
pnpm --filter @bbq/desktop build

# 4. Rust code formatting check
cargo fmt --all -- --check

# 5. Rust clippy with zero warnings denied
cargo clippy --workspace --all-targets --all-features -- -D warnings

# 6. Rust workspace tests (214 tests passing)
cargo test --workspace
```

---

## Packaging & Releases

BBQ uses standard Tauri 2 bundle tooling to generate production artifacts:

```bash
# Package production installer/bundle for the current platform
pnpm --filter @bbq/desktop tauri build
```

Generated production bundle formats:
- **Windows**: NSIS Single-User Installer (`.exe`) in `apps/desktop/src-tauri/target/release/bundle/nsis/`
- **macOS**: Application bundle (`.app`) and Apple Disk Image (`.dmg`) in `target/release/bundle/dmg/`
- **Linux**: Debian package (`.deb`) and AppImage in `target/release/bundle/deb/` and `target/release/bundle/appimage/`

### Continuous Integration (CI) Matrix

Every push and pull request to `main` executes the full GitHub Actions CI matrix:
- **Frontend / Lint**: Node 22, pnpm test, TypeScript typecheck, production frontend build.
- **Ubuntu 22.04**: Linux packaging (`.deb`, `.AppImage`), Rust format check, Clippy, workspace tests.
- **macOS 14 (Apple Silicon)**: macOS packaging (`.dmg`, `.app`), workspace tests.
- **Windows 2022**: Windows packaging (NSIS installer), workspace tests.

---

## License

BBQ is licensed under the [MIT License](LICENSE).
