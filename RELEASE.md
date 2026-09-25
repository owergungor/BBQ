# BBQ v2.0.0 Release Documentation

> **Status**: v2.0.0 **RELEASE FREEZE SEALED**
> **Release Target**: Windows 10/11 x64, macOS 12+ (Apple Silicon & Intel), Linux (X11 & Wayland)
> **Tag**: `v2.0.0` (Ready for tagging)

---

## 1. Executive Summary

BBQ v2.0.0 is the official General Availability (GA) release of the lightweight, cross-platform desktop productivity island built with Tauri 2 and Rust. It features a complete 9-widget HUD suite, native hardware metrics, truthful platform capability modeling, zero-polling reactive event streams, bounded memory usage (<= 60 MB RAM), and production installer bundles across Windows, macOS, and Linux.

---

## 2. Release Artifacts

The production packages are built and verified across the multi-platform CI matrix:

| Platform | Target Package | Format | Notes |
|---|---|---|---|
| **Windows** | `BBQ_2.0.0_x64-setup.exe` | NSIS Installer | Standalone currentUser installer, signed-ready, no PDBs/logs |
| **macOS** | `BBQ_2.0.0_aarch64.dmg` | Apple Disk Image | Self-contained `.app` bundle packaged in DMG |
| **Linux** | `BBQ_2.0.0_amd64.deb` | Debian Package | Standard Debian package with libwebkit2gtk dependencies |
| **Linux** | `BBQ_2.0.0_amd64.AppImage` | AppImage Bundle | Universal portable executable for Linux distributions |

---

## 3. Verification & Test Summary

| Test Suite | Command | Result |
|---|---|---|
| **Rust Tests** | `cargo test --workspace` | **116 / 116 PASS** |
| **Frontend Tests** | `pnpm test` | **404 / 404 PASS** |
| **Rust Linter** | `cargo clippy --workspace --all-targets --all-features -- -D warnings` | **0 warnings** |
| **Rust Formatter** | `cargo fmt --all -- --check` | **PASS** |
| **TypeScript Typecheck** | `pnpm typecheck` | **0 errors** |
| **Desktop Production Build** | `pnpm build` | **PASS** |

---

## 4. Platform Support & Capabilities

- **Windows 10/11 x64**: Native Global Hotkeys, Clipboard Viewer, Windows SMTC Media Controls, Toast Notifications.
- **macOS (12+)**: Native Global Hotkeys, Pasteboard monitoring, AppleScript Media Integration, User Notifications.
- **Linux (X11 & Wayland)**: FreeDesktop Notifications, MPRIS2 D-Bus Media, X11 Hotkeys & Positioning, Wayland portal integration.
