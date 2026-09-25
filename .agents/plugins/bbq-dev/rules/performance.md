# BBQ Performance Guidelines

## 1. Resource Budgets
- **Working Set RAM Target**: <= 60 MB under normal idle/active usage (baseline established at ~46 MB in M14).
- **Idle CPU Target**: ~0% CPU utilization when no user interactions or active countdown timers are executing.
- **Continuous Question**: For every new feature or modification, always ask: *"How much memory and CPU does this consume when running continuously in the background?"*

## 2. Zero-Polling Policy
- **No `setInterval` Loops**: Never introduce `setInterval` loops anywhere in production frontend code.
- **No Continuous `requestAnimationFrame`**: Never use continuous RAF loops for layout or state tracking. Animations must only run during active user gestures or transitions and stop immediately.
- **No Recursive `setTimeout`**: Never write recursive `setTimeout` pollers to check for external state changes.
- **Event-Driven Architecture**: Rely strictly on OS push events (WinRT media sessions, D-Bus signals, window focus changes, SQLite write events). One-shot timeouts are only acceptable for debounce, auto-collapse timeouts, or wall-clock synchronization when an active countdown timer is ticking.

## 3. UI Rendering & Re-render Budgets
- Prevent global React re-renders. Component state must be granular and decoupled using micro-stores (Zustand-like subscriptions or targeted selectors).
- Keep heavy computations, sorting of large collections, and regex search scoring off the main UI rendering thread or bounded strictly by limit parameters.
- In long lists (e.g. large clipboard history, file workspace), apply list virtualization or item bounds.

## 4. Leak Prevention & Resource Lifecycles
- Explicitly unsubscribe all window event listeners, Tauri event listeners, and DOM observers during component unmount.
- In Rust, ensure background tasks spawned via `tokio::spawn` or `tauri::async_runtime::spawn` have bounded lifecycles and cancellation tokens or clean channel termination.
- Watch out for memory buildup in storage caches: enforce SQLite WAL truncation, pragma auto-vacuum, and FIFO capacity bounds (`MAX_CLIPBOARD_MAX_ENTRIES`, `MAX_DROP_ITEMS`).
