# BBQ Rust & Tauri Guidelines

## 1. Safe & Idiomatic Rust
- Adhere strictly to the workspace lint policy: `#![deny(warnings)]`, `#![warn(missing_debug_implementations)]`, and strict Clippy rules (`unwrap_used`, `panic`, `todo`, `dbg_macro`).
- Avoid `.unwrap()` and `.expect()` in production service code. Propagate errors via `BbqResult<T>` and `BbqError`.
- Only use `.unwrap()` or `.expect()` in `#[cfg(test)]` modules or where mathematically guaranteed and commented.

## 2. Asynchronous Architecture & Concurrency
- Never block Tokio worker threads or the Tauri main UI loop with long-running synchronous I/O or CPU-heavy loops. Use `tokio::task::spawn_blocking` when interfacing with synchronous OS filesystem APIs or legacy COM/Win32 APIs.
- Mutexes holding application state (`Mutex<Option<...>>`) must be held for minimal critical sections and never across `.await` points.
- Implement graceful cancellation and clean teardown in all background service loops (`Service::stop`).

## 3. Tauri Commands & IPC Design
- Tauri commands must remain small, single-purpose, and clearly documented.
- Return structured `Result<T, String>` where errors are sanitized strings safe for UI presentation.
- Never pass sensitive, unvetted raw CLI strings or full file paths to frontend unless explicitly dictated by UI contracts.
- Avoid passing massive data buffers across Tauri IPC. Prefer streaming, chunking, or ID-based queries.

## 4. Resource Allocation
- Avoid unnecessary `.clone()` and large memory allocations in frequent event handling paths.
- Reuse allocations with `Vec::with_capacity` when output sizes are known or bounded.
- Rely on existing dependencies in the Cargo workspace before considering adding external third-party crates.
