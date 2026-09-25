# BBQ Architecture Principles

## 1. Native Layer Integrity
- Keep the boundary between Tauri/Rust and frontend webview crisp and minimal.
- Core business logic, persistence, system metrics, hardware events, and OS integrations reside in Rust crates (`bbq-core`, `bbq-platform`, `bbq-services`, `bbq-storage`).
- The frontend (`apps/desktop`) acts as a reactive presentation and geometry shell.

## 2. IPC Minimization
- Never introduce high-frequency polling over the Tauri IPC boundary.
- Do not make repeated IPC round-trips for continuous state updates; use push-based event streams (`BbqEvent` -> `app.emit("bbq://...", ...)`) only when state actually transitions.
- Keep IPC command payloads concise and strictly typed through shared schemas in `packages/types`.

## 3. Platform Code Isolation
- Platform-specific system calls must reside in `crates/platform` under explicit conditional compilation attributes (`#[cfg(windows)]`, `#[cfg(target_os = "linux")]`, `#[cfg(target_os = "macos")]`).
- Never leak platform-specific structures or system APIs into higher-level crates (`bbq-core`, `bbq-services`, `bbq-storage`).
- All platforms must implement standard traits (`PlatformHotkey`, `PlatformDisplay`, `PlatformMedia`, `PlatformClipboard`, `PlatformNotification`, `PlatformSystem`, `PlatformFile`, `PlatformLauncher`). Provide truthful mock/fallback behavior where an OS lacks capability.

## 4. Minimal Abstraction and Dependencies
- Do not introduce superfluous wrappers, indirection layers, or foreign dependencies when existing stdlib or workspace crates suffice.
- Before adding any dependency to `Cargo.toml` or `package.json`, thoroughly verify if existing dependencies already solve the problem.
- Always document the explicit rationale before modifying established workspace contracts or directory layouts.
