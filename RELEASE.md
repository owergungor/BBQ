# BBQ v1.0.0 Release Documentation

> **Status**: Windows 1.0.0 **READY / RELEASE FREEZE SEALED**  
> **Release Target**: Windows 10/11 x64  
> **Tag**: `v1.0.0` (Ready for tagging)

---

## 1. Executive Summary

BBQ v1.0.0 marks the initial production release of the ambient desktop productivity island. Windows 1.0.0 has completed exhaustive quality assurance, performance profiling, and security auditing. All core requirements, platform integrations, installer packaging, and runtime invariants are physically validated on Windows 11 x64.

---

## 2. Release Artifacts & Checksums

The production artifacts were generated via `pnpm tauri build` using Tauri 2.x and WiX Toolset / NSIS:

| Artifact | Type | Size | SHA-256 Checksum |
|---|---|---|---|
| `BBQ_1.0.0_x64-setup.exe` | NSIS Per-User Installer | 5,687,115 bytes (5.42 MB) | `881AAFA3550EFC57BA45E30212769ECDCF7C56FB2D6D5364403E1326C1FEE64F` |
| `BBQ_1.0.0_x64_en-US.msi` | WiX MSI System Package | 8,556,544 bytes (8.16 MB) | `A5E327D04ADCADFC1029A0A7079BB3B7C77BB09B608BBAB7C5D21A2411368D14` |
| `bbq-desktop.exe` | Release Binary | 30,319,932 bytes (28.9 MB) | `F4817861345D1755157B03D9950D96368B2609F45012FD4D3B09D858E9422129` |

Artifact Locations:
- MSI: `target/release/bundle/msi/BBQ_1.0.0_x64_en-US.msi`
- NSIS: `target/release/bundle/nsis/BBQ_1.0.0_x64-setup.exe`
- Standalone Binary: `target/release/bbq-desktop.exe`

---

## 3. Verification & Test Summary

| Test Suite | Command | Result | Duration |
|---|---|---|---|
| **Rust Workspace Tests** | `cargo test --workspace` | **144 / 144 PASS** | ~1.5s |
| **Frontend Tests** | `pnpm test` (Vitest) | **124 / 124 PASS** | 626ms |
| **Rust Linter** | `cargo clippy --workspace --all-targets --all-features -- -D warnings` | **0 warnings** | ~3.3s |
| **Rust Formatter** | `cargo fmt --check` | **0 issues** | <1s |
| **TypeScript Typecheck** | `pnpm typecheck` | **0 errors** | ~3.0s |
| **Frontend Build** | `pnpm build` | **0 errors (301 KB JS / 38.8 KB CSS)** | 1.01s |
| **Tauri Packaging** | `pnpm tauri build` | **0 errors (MSI + NSIS)** | ~60s |

---

## 4. Platform Readiness Classification

| Platform | Status | Verification Note |
|---|---|---|
| **Windows (10/11 x64)** | **READY / VERIFIED** | Physically verified on Windows 11 host. Native WinRT SMTC, Win32 `RegisterHotKey`, `EnumDisplayMonitors` DPI-aware geometry, Registry autostart, NSIS/MSI clean install/uninstall verified. |
| **macOS** | **IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING** | Trait implementations complete (CoreGraphics display enumeration, LaunchAgents plist, AppleScript/CLI media and notifications). Hardware execution pending. |
| **Linux X11** | **IMPLEMENTED WHERE AVAILABLE / RUNTIME VALIDATION PENDING** | Trait implementations complete (XRandR multi-monitor geometry, XDG autostart, MPRIS playerctl, notify-send). Hardware execution pending. |
| **Linux Wayland** | **COMPOSITOR-DEPENDENT / LIMITED** | Absolute window positioning (`set_position`) and global key grabs are restricted by Wayland security architecture. Degrades gracefully to in-app hotkeys and standard windowing. |

---

## 5. Runtime Architecture & Performance Invariants

BBQ enforces strict architectural invariants to guarantee zero idle battery and CPU drain:

1. **Zero Continuous Polling**:
   - `requestAnimationFrame`: **0** loops in production frontend.
   - `setInterval`: **0** calls across entire desktop codebase.
   - `tokio::time::interval`: **0** continuous timers in backend services.
2. **Timestamp-Driven State**:
   - Timers (Countdown, Stopwatch, Pomodoro) compute elapsed/remaining time dynamically from wall-clock timestamps (`target_at`, `started_at`) using bounded one-shot `setTimeout` schedules.
3. **Event-Driven Platform Adapters**:
   - Windows Media: WinRT `CurrentSessionChanged` callbacks (zero polling).
   - Windows Clipboard: Win32 native message window with `AddClipboardFormatListener` and `WM_CLIPBOARDUPDATE`.
4. **Bounded Storage & Memory**:
   - SQLite WAL mode with 30-day retention pruning.
   - Clipboard history capped at 100 items FIFO.
   - Search query output capped at 20 items.
   - Idle private working set: ~51.6 MB (budget: <= 60 MB). Idle CPU: 0.0%.

---

## 6. Security Model & Audit Verification

- **Zero Shell Invocation**: `cmd.exe /c`, `powershell -Command`, `sh -c`, and `bash -c` are completely absent from the codebase.
- **Explicit Process Execution**: All child processes (`rundll32.exe`, `explorer.exe`, `open`, `xdg-open`) use explicit binary names and separated argument arrays.
- **Input & URL Validation**: Scheme whitelist strictly limited to `http`, `https`, and `mailto`. Potentially dangerous URI schemes (`file:///cmd.exe`, `powershell:`, `javascript:`) are rejected.
- **Path Traversal Protection**: File operations resolve and canonicalize paths; attempts to escape root boundaries are rejected.
- **Privacy First**: Clipboard history is **disabled by default**. Sensitive password managers, private credentials, and high-entropy secrets are automatically flagged or excluded. Zero remote telemetry.

---

## 7. Windows Clean Installation & Verification QA

1. **Installation**:
   - Run `BBQ_1.0.0_x64-setup.exe`.
   - Per-user installation into `%LOCALAPPDATA%\BBQ`. No UAC elevation required.
2. **Launch & Onboarding**:
   - Fresh state detected (`first_run_completed: false`).
   - 6-step interactive welcome tour renders smoothly over top-center island.
   - Keyboard accessible (`Escape` skips, `Enter` / `Arrows` navigate).
3. **Core Interactions**:
   - Global hotkey `Ctrl+Space` toggles the island cleanly.
   - Quick search, media playback controls, file workspace drop targets, and timer countdown operate as expected.
4. **Autostart**:
   - Toggling autostart creates `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BBQ`.
5. **Clean Uninstallation**:
   - Running the uninstaller removes `%LOCALAPPDATA%\BBQ` and clears registry autostart keys.
   - User database `%APPDATA%\com.bbq.desktop\bbq.sqlite` is preserved unless explicitly wiped.
