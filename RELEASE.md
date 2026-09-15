# BBQ v1.2.0 Release Documentation

> **Status**: Windows v1.2.0 **RELEASE FREEZE SEALED**  
> **Release Target**: Windows 10/11 x64  
> **Tag**: `v1.2.0` (Ready for tagging)

---

## 1. Executive Summary

BBQ v1.2.0 introduces comprehensive theming with 11 system accent colors, a custom hex color picker, an interactive hotkey recorder, 2x2 quick actions launcher layout, mouse wheel tab navigation, and permanent settings persistence hardening. All core requirements, platform integrations, installer packaging, and runtime invariants are physically validated on Windows 11 x64.

---

## 2. Release Artifacts

The production artifacts are generated via `pnpm build:desktop`:

| Artifact | Type | Path |
|---|---|---|
| `bbq-desktop.exe` | Release Standalone Binary | `target/release/bbq-desktop.exe` |

---

## 3. Verification & Test Summary

| Test Suite | Command | Result | Duration |
|---|---|---|---|
| **Rust Tests** | `cargo test` | **91 / 91 PASS** | ~1.5s |
| **Frontend Tests** | `pnpm test` | **181 / 181 PASS** | ~850ms |
| **Rust Linter** | `cargo clippy --all-targets -- -D warnings` | **0 warnings** | ~5.0s |
| **Rust Formatter** | `cargo fmt -- --check` | **PASS** | <1s |
| **TypeScript Typecheck** | `pnpm typecheck` | **0 errors** | ~3.0s |
| **Desktop Production Build** | `pnpm build:desktop` | **PASS** | ~60s |
| **Standalone Runtime Test** | `.\target\release\bbq-desktop.exe --version` | **PASS** | <1s |

---

## 4. Platform Support

- **Windows (10/11 x64)**: Physically verified on Windows 11 host.
- **macOS & Linux**: Trait implementations complete and verified in workspace.
