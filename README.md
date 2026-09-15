# BBQ

> **Lightweight, Privacy-First Desktop Productivity Island**

BBQ brings the ambient, reactive ergonomics of a dynamic island to your desktop. Anchored unobtrusively at the top-center of your display, BBQ rests in a sleek compact pill and fluidly expands into a rich productivity command surface—featuring focus timers, quick application launching, system preferences, file workspace targets, reminders, and media controls—without interrupting your workflow.

BBQ is built with **Tauri 2.x**, **Rust**, and **React 19**, engineered from the ground up for instantaneous response times, low memory consumption (< 60 MB), zero background battery drain, and uncompromised local-first privacy.

---

## What is BBQ?

BBQ transforms the unused top margin of your screen into an ambient multi-tool:
- **Dynamic Island Concept for Desktop**: An unobtrusive pill anchored at the top-center of your monitor displaying real-time status (timer countdown, media playback, or reminders).
- **Hardware-Accelerated Expansion**: Expands symmetrically on hover or click into an intuitive widget dashboard with 60 FPS transitions.
- **Privacy-First Architecture**: 100% offline and local-first. Zero telemetry, zero tracking, zero remote network calls, and all preferences stored locally in an embedded SQLite database.
- **Cross-Platform Target**: First-class support for Windows 10/11, macOS, and Linux desktop environments through native Rust platform abstractions.
- **Resource Efficiency & Lightweight**: Idle memory footprint under 60 MB, zero idle CPU usage, and zero polling loops.

---

## v1.2.0 Features

BBQ v1.2.0 delivers deep customization, modern controls, interaction polish, and rock-solid persistence:

- **Timer: Countdown / Stopwatch / Pomodoro**: Full timer suite with explicit start/pause/resume/reset controls and idle mode switching guarantees (never auto-runs unexpectedly).
- **Custom Timer Presets**: Quick-select presets for 1m, 5m, 10m, 15m, 25m, 45m, and 60m focus sessions.
- **Global Hotkey**: Summon or dismiss the island instantly from any application across your operating system.
- **Custom Hotkey Recorder**: Interactive recorder in Settings supporting multi-modifier shortcuts (e.g. `Ctrl+Shift+B`, `Ctrl+Alt+Space`, `Alt+Shift+B`, `Win+Shift+B`).
- **Mouse Wheel Tab Navigation**: Effortless widget switching by scrolling the mouse wheel over the island header, with debounced boundary clamping.
- **Launcher 2x2 Quick Actions**: Streamlined 2x2 grid for essential system targets (Files & Workspace, Downloads, Home Directory, Lock Screen) engineered to fit without overflow.
- **Theme Switcher**: Instant switching between **Light**, **Dark**, and **System** appearance modes with real-time DOM token updates.
- **Light / Dark / System**: Dynamic theme detection synchronizing with your operating system preferences.
- **Modern Switch Controls**: Smooth, accessible toggle controls replacing legacy checkbox elements.
- **Compact Size Sliders**: Real-time slider controls for compact island width (180px–480px) and height (36px–54px).
- **11 System Accent Colors**: System Blue (default), Red, Green, Orange, Yellow, Pink, Purple, Indigo, Teal, Mint, and Cyan.
- **Custom Accent Color Picker**: Real-time hex color input and dynamic picker calculating complementary hover, glow, and subtle opacity tokens.
- **Light/Dark Accent Mapping**: All 11 system presets map directly to platform-accurate Light and Dark hex values.
- **Persistent Settings**: Synchronous `localStorage` caching paired with an asynchronous SQLite database guarantees zero flash on startup and complete persistence across app restarts.
- **Onboarding Persistence**: Completed welcome tours are remembered permanently; the app immediately opens to the normal idle island on subsequent launches.
- **System Tray**: Native tray icon with quick actions (Show/Hide, Preferences, Restart, Quit).
- **Hover / Interaction Improvements**: Symmetrical 4-directional hover expansion around the visual center, zero cursor jitter, zero outer halos/shadows, and deterministic outside-click dismissal via `composedPath()`.

---

## Architecture Overview

BBQ follows a strict layered, decoupled architecture ensuring separation of concerns, high testability, and maintainability:

```
┌────────────────────────────────────────────────────────┐
│                   React 19 Frontend                    │
│   (Domain State Stores, SVG Icons, CSS Token Theming)  │
└───────────────────────────┬────────────────────────────┘
                            │ Tauri 2 IPC (Commands & Events)
┌───────────────────────────▼────────────────────────────┐
│                    Rust Service Layer                  │
│  (Window, Display, Timer, Hotkey, Settings, Launcher)  │
├───────────────────────────┬────────────────────────────┤
│   Platform Abstractions   │       SQLite Storage       │
│  (Win32, Cocoa, X11/XDG)  │      (WAL Mode, Bundled)   │
└───────────────────────────┴────────────────────────────┘
```

- **Frontend (`apps/desktop`)**: React 19 + TypeScript + Vite. Standalone CSS custom properties for theming; zero heavy styling frameworks.
- **Desktop Runtime (`apps/desktop/src-tauri`)**: Tauri 2 application bootstrap, system tray management, transparent frameless window creation.
- **Services (`crates/services`)**: Domain business logic and lifecycle management for all desktop features.
- **Platform Abstraction (`crates/platform`)**: Clean Rust traits (`PlatformWindow`, `PlatformDisplay`, `PlatformHotkey`, `PlatformAutostart`, `PlatformMedia`, `PlatformNotification`) abstracting OS differences.
- **Storage (`crates/storage`)**: Bundled SQLite database with automated migration runner and typed repositories.
- **Core (`crates/core`)**: Domain models, error handling, layout geometry calculators, and DPI-aware coordinate math.

---

## System Requirements

| Operating System | Requirements |
| :--- | :--- |
| **Windows** | Windows 10 (version 1809+) or Windows 11 (x64 / ARM64). WebView2 Runtime (standard on Windows 10/11). |
| **macOS** | macOS 12 Monterey or later (Apple Silicon & Intel). |
| **Linux** | Modern 64-bit Linux distribution with `glibc >= 2.31`, `WebKitGTK 4.1`, and `libayatana-appindicator3`. |

---

## Development Setup

### Prerequisites
- **Node.js**: `>= 22.6.0`
- **pnpm**: `>= 9.0.0`
- **Rust**: `>= 1.85.0` (`stable-x86_64-pc-windows-msvc` on Windows)

### Installation
```bash
# Clone repository
git clone https://github.com/owergungor/bbq.git
cd bbq

# Install frontend dependencies
pnpm install
```

### Running Locally (Development Mode)
```bash
# Start frontend dev server and Tauri application
pnpm dev
```

---

## Testing & Quality Verification

BBQ adheres to rigorous automated testing across the entire stack:

```bash
# Run all frontend tests (181 passed across 80 suites)
pnpm test

# Run TypeScript typechecks (0 errors)
pnpm typecheck

# Run all Rust unit and integration tests (91 passed)
cargo test

# Run Rust linter with strict warning policy (0 warnings)
cargo clippy --all-targets -- -D warnings

# Check Rust code formatting (PASS)
cargo fmt -- --check
```

---

## Production Build

To build the standalone release executable without dev server dependencies:

```bash
# Build desktop production binary (embedded web assets, no localhost dependency)
pnpm build:desktop
```

The production executable is generated at:
```
target/release/bbq-desktop.exe
```

---

## Privacy & Resource Efficiency

- **Zero Outbound Telemetry**: No analytics libraries, crash reporters, or tracking beacons.
- **Zero Polling Loops**: Timers and animations rely strictly on system clock deltas and event triggers; zero idle CPU spin.
- **Minimal Memory Footprint**: Typically runs under 60 MB RAM in compact idle state.
- **Local Storage**: All user settings, clipboard entries, and reminders remain exclusively on your local machine in `%LOCALAPPDATA%/BBQ/bbq.db`.

---

## License

BBQ is licensed under the [MIT License](LICENSE).
