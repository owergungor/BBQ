# BBQ Release Process & Verification Runbook

> **Scope**: Official release engineering runbook for BBQ releases.  
> **Applicability**: Version 1.0.0+

---

## 1. Release Lifecycle Overview

Every BBQ release adheres to a four-phase release lifecycle:

```text
┌─────────────────┐     ┌─────────────────────┐     ┌────────────────────┐     ┌───────────────────┐
│  Phase 1:       │     │  Phase 2:           │     │  Phase 3:          │     │  Phase 4:         │
│  Code Freeze &  │ ──> │  Full Artifact      │ ──> │  Clean OS Install  │ ──> │  Sealing &        │
│  Audit          │     │  Validation         │     │  Verification      │     │  Tag Release      │
└─────────────────┘     └─────────────────────┘     └────────────────────┘     └───────────────────┘
```

---

## 2. Phase 1: Code Freeze & Invariant Audit

Before cutting any release, code changes are strictly restricted to release-blocking defect fixes.

### Audit Checklist:
1. **Zero TODO / FIXME / Dead Code**:
   - Run workspace pattern searches for `TODO`, `FIXME`, `HACK`, `XXX`.
   - Ensure test mocks remain strictly confined to test crates (`tests/`, `crates/platform/src/mock.rs`).
2. **Zero Shell Execution**:
   - Verify that `cmd.exe /c`, `powershell -Command`, `sh -c`, and `bash -c` are completely absent.
   - Verify that all `std::process::Command::new` calls invoke explicit binaries with discrete argument slices.
3. **Zero Continuous Polling**:
   - Verify `0` calls to `setInterval` in frontend.
   - Verify `0` calls to continuous `requestAnimationFrame` in frontend.
   - Verify `0` calls to continuous `tokio::time::interval` in backend services.
4. **Version Synchronization**:
   - `package.json` (root)
   - `apps/desktop/package.json`
   - `packages/types/package.json`
   - `Cargo.toml` (`workspace.package.version`)
   - `apps/desktop/src-tauri/tauri.conf.json` (`version`)
   - Run `cargo test -p bbq-integration-tests test_version_consistency_and_packaging_metadata` to guarantee zero version drift.

---

## 3. Phase 2: Full Artifact Validation Suite

Run each of the following commands sequentially and ensure **0 errors and 0 warnings**:

```bash
# 1. Frontend Typecheck
pnpm typecheck

# 2. Frontend Unit & Integration Tests
pnpm test

# 3. Frontend Production Compilation
pnpm build

# 4. Rust Workspace Formatting
cargo fmt --check

# 5. Rust Workspace Check
cargo check --workspace

# 6. Rust Workspace Tests
cargo test --workspace

# 7. Rust Clippy Strict Linting
cargo clippy --workspace --all-targets --all-features -- -D warnings

# 8. Tauri Production Bundling
pnpm tauri build
```

---

## 4. Phase 3: Packaging & Binary Verification

Verify that production bundles are generated in `target/release/bundle/`:

### Artifact Checklist & Standardized Release Naming:
Release artifacts must strictly follow the standardized naming convention:

| Platform / Architecture | Standardized Artifact | Format | Description |
|---|---|---|---|
| **macOS ARM64** | `mac-arm64.app.zip` | Zip Archive | Zipped `.app` bundle preserving symlinks and signatures |
| **macOS ARM64** | `mac-arm64.dmg` | Apple Disk Image | Self-contained Drag-to-Applications installer DMG |
| **Windows x64** | `win-x64-setup.exe` | NSIS Installer | Standalone currentUser installer |
| **Windows x64** | `win-x64.zip` | Zip Archive | Standalone portable executable zip |
| **Linux (x64)** | `*.deb`, `*.AppImage` | Debian / AppImage | Native Linux distribution packages |

### SHA-256 Hash Verification:
SHA256 checksums must be computed **after** renaming into standardized artifacts:
```powershell
Get-FileHash target\release\release-artifacts\* -Algorithm SHA256
```
or on macOS/Linux:
```bash
shasum -a 256 target/release/release-artifacts/*
```

---

## 5. Phase 4: Clean Install & Uninstall Verification QA

Execute the installer on a clean target machine (or test profile):

1. **Install Execution**:
   - Run `BBQ_<version>_x64-setup.exe`.
   - Confirm per-user install succeeds into `%LOCALAPPDATA%\BBQ` without UAC elevation prompt.
2. **First-Run Experience**:
   - Verify that the 6-step onboarding tour appears over the top-center island.
   - Press `Escape` or complete the tour to confirm state persistence in `%APPDATA%\com.bbq.desktop\bbq.sqlite`.
3. **Island Interactions**:
   - Press `Ctrl+Space` to toggle the island.
   - Verify launcher search, media controls, timer, and file drop surface.
4. **Autostart**:
   - Toggle "Launch at login" in Settings.
   - Verify `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BBQ` is created.
5. **Uninstall**:
   - Run the uninstaller from Windows "Add or Remove Programs".
   - Verify program files and autostart registry entries are cleanly removed.
   - Verify user preferences database is preserved.

---

## 6. Release Tagging Convention

Once all validations pass:

```bash
git tag -a v1.0.0 -m "Release BBQ v1.0.0"
git push origin v1.0.0
```

> **Note**: Git tags are never created or pushed automatically by automated subagents; they require explicit human approval and execution.
