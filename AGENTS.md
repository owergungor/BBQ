# BBQ Agent Guidelines & Development Standards

Welcome to the **BBQ** (Lightweight, Cross-Platform Desktop Productivity Island) codebase. All AI agents working on this project must adhere to the rules, skills, and personas defined in the project-specific plugin:
👉 [`.agents/plugins/bbq-dev`](./.agents/plugins/bbq-dev/)

---

## Core Engineering Principles

### 1. Architecture
- **Preserve Native Integrity**: Core logic, SQLite storage, hardware metrics, and platform APIs belong in Rust crates (`bbq-core`, `bbq-platform`, `bbq-services`, `bbq-storage`).
- **Minimize IPC Overhead**: Keep Tauri commands small and IPC payloads bounded. Rely on event streams (`BbqEvent`) instead of frequent frontend-backend round-trips.
- **Isolate Platform Code**: All OS-specific code must stay inside `crates/platform/src/<os>.rs` guarded by `#[cfg(...)]`.

### 2. Performance & Resource Budgets
- **RAM Target**: <= 60 MB working set RAM (baseline: ~46 MB).
- **CPU Target**: ~0% idle CPU utilization.
- **Zero-Polling Policy**: Strict prohibition against `setInterval`, continuous `requestAnimationFrame` loops, and recursive `setTimeout` polling in production. Updates must be strictly event-driven.
- **Resource Lifecycles**: Always unsubscribe event listeners, cancel background timers, and enforce FIFO storage bounds (`MAX_DROP_ITEMS = 50`, `MAX_CLIPBOARD_MAX_ENTRIES = 100`).

### 3. Cross-Platform Parity
- Support Windows 10/11, macOS 12+, and Linux (X11 & Wayland).
- Never assume a capability exists everywhere. Consult the truthful platform matrix (`PlatformCapabilities`) and handle compositor-dependent (Wayland) or permission-required (macOS) states gracefully.

### 4. Rust & Tauri Standards
- Follow workspace linter rules: `#![deny(warnings)]`, strict Clippy warnings denied.
- Avoid `.unwrap()` and `.expect()` in production service code; use `BbqResult<T>`.
- Offload synchronous file I/O and legacy Win32/COM calls to `tokio::task::spawn_blocking`.
- Avoid unnecessary `.clone()` and memory allocations in frequent event loops.

### 5. Frontend Standards
- Use **Vanilla CSS** exclusively with centralized tokens from `apps/desktop/src/styles/index.css`. No TailwindCSS, CSS-in-JS, or ad-hoc utility classes.
- Ensure WCAG 2.1 AA contrast compliance across both Dark and Light themes.
- Status badges (`.bbq-capability-badge`) must communicate state through text labels, not color alone.
- Respect `reduced_motion` accessibility settings.

### 6. Sustainability & Clean Diff
- Make small, surgical, focused edits.
- Never rewrite working subsystems simply because an alternative syntax is preferred.
- Do not duplicate logic; reuse existing helpers across crates and models.

### 7. Testing Discipline
After every meaningful change, execute:
```bash
# Frontend
pnpm --filter @bbq/desktop test
pnpm --filter @bbq/desktop typecheck
pnpm --filter @bbq/desktop build

# Rust
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
```
Never delete, comment out, or relax existing test assertions to make a suite pass.

### 8. Specialized Reviewer Personas
Consult the dedicated reviewer personas in `.agents/plugins/bbq-dev/agents/`:
- **`rust-reviewer`**: Memory safety, async correctness, Tauri commands, resource lifecycles.
- **`performance-reviewer`**: RAM, CPU, zero-polling, render churn, leak prevention.
- **`cross-platform-reviewer`**: Windows, macOS, Linux X11/Wayland isolation and capability truthfulness.
- **`release-reviewer`**: Packaging hygiene, test gate enforcement, CI readiness.

### 9. Development Workflow
1. **Understand Before Modifying**: Read related source files and trace existing contracts.
2. **Plan Minimally**: Plan the smallest safe, clean modification.
3. **Verify Thoroughly**: Inspect `git diff`, run unit tests, and confirm zero newly introduced polling.
