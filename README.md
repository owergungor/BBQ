# BBQ

> A lightweight, privacy-first, cross-platform desktop productivity island.

BBQ transforms the top edge of your desktop into an ambient, reactive command surface inspired by dynamic island ergonomics. It expands seamlessly into productivity tools, global search, media playback controls, file drop targets, system telemetry, and customizable widget suites without interrupting your workflow.

BBQ is built with **Tauri 2.x**, **Rust**, and **React 19**, engineered from the ground up for extreme performance, low resource consumption, and uncompromised user privacy.

---

## Key Features

- **Ambient Desktop Island**: Rests discretely at the top of your display, expanding fluidly on user interaction or actionable events.
- **First-Run Onboarding**: 30-second interactive welcome tour explaining island mechanics, hotkeys, privacy, and widget customization.
- **Privacy-First Clipboard History**: Fully opt-in, bounded local retention (up to 100 entries), zero background telemetry, and strictly local SQLite persistence.
- **Media & Audio Controls**: Native OS media session integration with playback toggles and track progress.
- **Smart Quick Launcher**: Instant keyboard-driven application launcher and command palette.
- **Pomodoro & Focus Timers**: Integrated timers with phase transitions and subtle desktop audio cues.
- **Native OS Autostart**: Clean, platform-native registry/agent startup without shell scripts or wrapper daemons.
- **Accessible & Responsive**: Full keyboard navigation, visible focus rings, native dark/light/system theme inheritance, and reduced motion awareness.

---

## Platform Support Matrix

BBQ runs natively on Windows, macOS, and Linux. Below is the honest breakdown of capabilities across platforms:

| Feature / Capability | Windows (10/11) | macOS (12+) | Linux (X11) | Linux (Wayland) |
| :--- | :---: | :---: | :---: | :---: |
| **Window Positioning (Top Center)** | ✅ Native Win32 | ✅ Native Cocoa | ✅ EWMH / X11 | ⚠️ Compositor-dependent (Layer Shell) |
| **Always-on-Top / Overlapped** | ✅ Native | ✅ Native | ✅ Supported | ⚠️ Restricted by some Wayland compositors |
| **Global Hotkey (`Ctrl+Space`)** | ✅ RegisterHotKey | ✅ Carbon / CGEvent | ✅ XGrabKey | ⚠️ Requires desktop portal / shortcut protocol |
| **Media Session Metadata** | ✅ WinRT GSMTC | ✅ MPNowPlaying | ✅ MPRIS DBus | ✅ MPRIS DBus |
| **Clipboard Monitoring** | ✅ Opt-in (Win32) | ✅ Opt-in (NSPasteboard) | ✅ Opt-in (X11 selection) | ⚠️ Compositor clipboard portal required |
| **Native Autostart** | ✅ HKCU Run Registry | ✅ LaunchAgents Plist | ✅ XDG Autostart `.desktop` | ✅ XDG Autostart `.desktop` |
| **System Resource Telemetry** | ✅ sysinfo / Win32 | ✅ sysinfo / Darwin | ✅ sysinfo / procfs | ✅ sysinfo / procfs |
| **Local SQLite Persistence** | ✅ %APPDATA% | ✅ ~/Library/Application Support | ✅ ~/.config or XDG_DATA_HOME | ✅ ~/.config or XDG_DATA_HOME |

> [!NOTE]
> On Linux Wayland sessions, global positioning and hotkeys rely on modern compositor protocols (e.g. `wlr-layer-shell`, XDG Desktop Portals). When unsupported by the desktop compositor, BBQ gracefully falls back to normal window mode and application-scoped shortcuts.

---

## Requirements

- **Windows**: Windows 10 (version 1809+) or Windows 11 (x64 / ARM64). WebView2 Runtime (pre-installed on Windows 10/11).
- **macOS**: macOS 12 Monterey or later (Apple Silicon & Intel).
- **Linux**: Modern 64-bit Linux distribution with `glibc >= 2.31`, `WebKitGTK 4.1`, and `libayatana-appindicator3`.

## Release & Verification Status

- **Windows (10/11 x64)**: **Runtime Verified** on physical Windows 11 host. Clean installation, NSIS packaging, startup, autostart registry, and memory benchmarks (51.68 MB) certified.
- **macOS (12+)**: **Build Verified** via cross-platform CI matrix (`macos-latest`). Physical runtime testing on Apple Silicon / Intel pending.
- **Linux (X11 / Wayland)**: **Build Verified** via cross-platform CI matrix (`ubuntu-latest`). Physical runtime testing across distros pending.
- **Code Signing**: Currently **Unsigned** (Ad-hoc developer build). Windows Defender SmartScreen may show an "Unknown Publisher" prompt; macOS Gatekeeper requires right-click -> Open until an Apple Developer ID certificate is applied.

---

## Installation

### Windows Installer (NSIS)
Download the `BBQ_1.0.0_x64-setup.exe` installer from the release assets:
1. Run the installer.
2. The installer runs in **per-user mode** (`currentUser`), requiring no Administrator privileges.
3. Automatically installs to `%LOCALAPPDATA%\BBQ` and creates a Start Menu shortcut.
4. Launch BBQ from the Start Menu or desktop shortcut.

### macOS (.dmg / .app)
1. Download `BBQ_1.0.0_universal.dmg`.
2. Drag `BBQ.app` into your `Applications` directory.
3. Launch `BBQ.app`. Grant Accessibility permissions if prompted for global hotkey handling.

### Linux (AppImage / Deb)
```bash
chmod +x BBQ_1.0.0_amd64.AppImage
./BBQ_1.0.0_amd64.AppImage
```

---

## First Launch & Onboarding Experience

When launching BBQ for the first time on a clean system:
1. **Fresh State Detection**: BBQ detects the absence of user configuration in SQLite and marks `first_run_completed: false`.
2. **Welcome Tour**: An interactive 6-step onboarding tour automatically appears over the island:
   - **Step 1: Welcome**: Introduction to the ambient desktop command surface.
   - **Step 2: The Island**: Explanation of dynamic expanding states and compact status indicators.
   - **Step 3: Quick Actions**: Global launcher (`Ctrl+Space`) and navigation keys.
   - **Step 4: Privacy Guarantee**: Explicit notice that clipboard tracking is **OFF by default** and all storage is strictly local.
   - **Step 5: Personalization**: Theme picker (System / Dark / Light) and reduced motion preferences.
   - **Step 6: Ready**: Final confirmation and transition to standard mode.
3. **Dismissal & Replay**: The onboarding tour is fully keyboard accessible (`Escape` to skip, `Enter` / `Arrow` keys to navigate). It can be replayed at any time from **Settings → About → Replay Welcome Tour**.

---

## Core Hotkeys & Navigation

| Shortcut | Scope | Action |
| :--- | :--- | :--- |
| `Ctrl + Space` (Win/Linux) / `Cmd + Space` (macOS) | Global | Toggle BBQ Island expand / collapse |
| `Escape` | App | Collapse island / dismiss modal / cancel action |
| `Tab` / `Shift + Tab` | App | Accessible keyboard navigation across interactive elements |
| `ArrowLeft` / `ArrowRight` | App | Switch tabs in expanded navigation bar |
| `Enter` / `Space` | App | Activate selected item / trigger button |

---

## Privacy & Security Architecture

BBQ is built with a strict **Zero-Telemetry, Local-First** security model:
- **No Analytics / Telemetry**: BBQ contains zero analytics trackers, telemetry libraries, or remote phone-home beacons.
- **No Background Network Activity**: The application does not issue remote HTTP/HTTPS requests. All operations execute strictly on the local machine.
- **Opt-In Sensitive Capabilities**: Clipboard history tracking is **disabled by default**. When explicitly enabled, history is capped at a strict budget (100 entries, 30 days retention) and passwords / sensitive types are excluded where platform hints allow.
- **Local SQLite Database**: All state (settings, bookmarks, history) is encrypted at rest by your OS user permissions and stored locally in `%APPDATA%\com.bbq.desktop\bbq.db` (Windows) or `~/Library/Application Support/com.bbq.desktop/bbq.db` (macOS).
- **PII-Sanitized Logging**: Rust backend tracing sanitizes clipboard text, file paths, and passwords before writing to any log stream.

---

## Autostart Behavior

BBQ provides an integrated **Launch at Login** preference:
- **Windows**: Manages a standard entry in `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`.
- **macOS**: Manages a user LaunchAgent property list in `~/Library/LaunchAgents/com.bbq.desktop.plist`.
- **Linux**: Manages an XDG Autostart desktop file in `~/.config/autostart/com.bbq.desktop.desktop`.
- **Native Implementation**: Autostart uses native platform APIs without spawning shell wrappers, batch scripts, or background daemon processes.

---

## Uninstall Policy

Uninstalling BBQ cleans up application binaries, Start Menu shortcuts, and autostart registry entries.

> [!IMPORTANT]
> **Non-Destructive User Data Policy**: In accordance with desktop application best practices, uninstalling BBQ **does NOT delete your user database or settings** (`bbq.db`). If you wish to completely remove all BBQ user data after uninstalling, manually delete the configuration folder:
> - **Windows**: `%APPDATA%\com.bbq.desktop`
> - **macOS**: `~/Library/Application Support/com.bbq.desktop`
> - **Linux**: `~/.config/com.bbq.desktop` or `~/.local/share/com.bbq.desktop`

---

## Troubleshooting & Known Limitations

### Frequently Encountered Issues

1. **Island does not appear on secondary monitor**:
   - By default, BBQ docks to the primary display. You can select your preferred target monitor under **Settings → Display → Target Display**.
2. **Global Hotkey collision (`Ctrl+Space`)**:
   - If another application has exclusively registered `Ctrl+Space`, BBQ gracefully indicates hotkey conflict in settings. You can reassign the global hotkey shortcut under **Settings → General → Global Hotkey**.
3. **Media session title shows "Unknown"**:
   - Ensure your media player supports OS-standard media keys and metadata (e.g. Windows GSMTC, macOS MPNowPlayingInfoCenter, or Linux MPRIS DBus).

---

## Development & Build Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v22.x or higher, LTS)
- [pnpm](https://pnpm.io/) (v9.x or higher)
- [Rust](https://www.rust-lang.org/) (1.78.x or higher, stable toolchain)
- Platform C++ build tools (Visual Studio C++ Build Tools on Windows, Xcode CLI on macOS)

### Monorepo Structure
```text
BBQ/
├── apps/
│   └── desktop/               # Tauri 2 application shell & React UI
├── crates/
│   ├── core/                  # BBQ domain models, error handling, events, settings
│   ├── storage/               # SQLite pool, schema migrations runner, repository traits
│   ├── platform/              # Native OS traits (Windows, macOS, Linux, Mock)
│   └── services/              # Decoupled domain services and lifecycle registry
├── packages/
│   └── types/                 # Shared TypeScript interfaces for IPC and stores
├── tests/                     # Integration and regression test suite
└── .github/                   # CI workflows and matrix validations
```

### Local Development Commands
```bash
# 1. Install all monorepo dependencies
pnpm install

# 2. Verify Rust codebase
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace

# 3. Verify TypeScript and frontend tests
pnpm typecheck
pnpm test
pnpm build

# 4. Run desktop application in dev mode
pnpm dev

# 5. Build production desktop installer
pnpm --filter @bbq/desktop tauri build
```

---

## License

BBQ is open-source software licensed under the [MIT License](LICENSE).
Copyright (c) 2026 BBQ Team.
