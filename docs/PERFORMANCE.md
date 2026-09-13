# BBQ Performance Architecture & Guidelines

## 1. Core Performance Philosophy

BBQ is a background utility designed to sit on screen indefinitely. It must feel virtually costless in terms of CPU, GPU, memory, and battery consumption.

### Key Metrics
- **Idle CPU**: < 0.1% average.
- **Idle Memory**: < 60 MB total working set.
- **UI Refresh**: Solid 60 FPS target during transitions.
- **Startup Time**: < 300 ms to initial paint.

---

## 2. Prohibition of Polling

Continuous polling (`setInterval`, sleep loops checking states) is forbidden in BBQ.

### Architecture Comparison
| Anti-pattern (Forbidden) | BBQ Pattern (Mandatory) |
|---|---|
| `setInterval(checkClipboard, 500)` | OS clipboard sequence callbacks / hooks |
| `setInterval(checkMedia, 1000)` | OS Media Session / MPRIS event listeners |
| `setInterval(checkDisplay, 2000)` | `WM_DISPLAYCHANGE` / `GdkScreen` signals |
| `setInterval(checkBattery, 5000)` | OS Power status change notifications |

When an OS event listener is unavailable, the service transitions to `Sleeping` and only evaluates on explicit user interaction (lazy on-demand evaluation).

---

## 3. UI Rendering & 60 FPS Smoothness

### CSS Hardware Acceleration
Transitions must strictly target compositor properties:
- `transform: translate3d(x, y, 0)`
- `transform: scale(...)`
- `opacity: ...`

Avoid animating:
- `width` / `height` directly (causes layout recalculation across the DOM tree).
- `top` / `left` / `margin` (causes layout reflows).

### State Separation
Never use a monolithic global state. State is isolated into discrete domain slices:
- `uiState` (Island shell mode: IDLE, ACTIVE, EXPANDED)
- `mediaState` (playback status, track title)
- `timerState` (active countdowns)
- `clipboardState` (recent items)
- `systemState` (battery, network connectivity)
- `settingsState` (user configuration)

A change in media status will never trigger a rerender in the timer widget or clipboard viewer.

---

## 4. Media Performance Architecture (Milestone 2)

### Position Update Strategy
- **Zero High-Frequency Polling**: BBQ never polls media playback position on intervals (e.g. `setInterval(..., 10)` or `setInterval(..., 50)` are strictly prohibited).
- **Event-Driven Anchor**: Track position is updated exclusively when discrete state transitions occur (e.g., track start, pause, resume, seek).
- **Low-Precision Display**: The Island presents title, artist, album art, and status; sub-second playback position counters are avoided to keep CPU wakeups at near-zero.

### Memory & Album Art Discipline
- Artwork is represented as compact data URLs or lightweight references.
- Artwork is cached in memory per active session and released as soon as the session closes or track changes.
- Large image decoding loops are prohibited; no persistent SQLite storage of images is performed.

---

## 5. Clipboard Performance Architecture (Milestone 3)

### Zero-Polling Event Hooks
- **No Periodic Loops**: Polling clipboard state via `setInterval` or `GetClipboardSequenceNumber` timer loops is strictly prohibited.
- **Native OS Event Registration**:
  - Windows: Uses `AddClipboardFormatListener` attached to an `HWND_MESSAGE` hidden window receiving `WM_CLIPBOARDUPDATE`.
  - macOS: Lazy evaluation mode tied to user interaction; no high-frequency `changeCount` checking timers.
  - Linux: Compositor-aware push hooks where supported (e.g. X11 XFixes); fails gracefully without polling.

### Bounded Memory Limits
- **Maximum Text Size**: Text content is bounded at a hard limit of `64 KiB` (`MAX_CLIPBOARD_TEXT_SIZE`). Oversized clipboard content is sliced cleanly at a UTF-8 boundary rather than allocated unbounded in memory.
- **Bounded Previews**: Preview strings are capped at `150 characters` (`MAX_PREVIEW_LENGTH`), stripped of multi-line padding.
- **Bounded Storage Retention**: The SQLite table maintains a strict FIFO limit of `100 entries` (`clipboard.history.max_entries`), automatically deleting older items during insertion.
- **Zero Binary Bloat**: Binary clipboard items (images, file drop lists) are represented as lightweight metadata descriptors; no raw binary image or file payload is copied into memory or persisted to disk.

### Lightweight Deduplication
- Consecutive identical entries are detected via bounded string comparison against the most recent entry.
- Expensive full-history cryptographic hashing of huge buffers is completely avoided.

---

## 6. File Workspace Performance Architecture (Milestone 4)

### Zero File Copying & Zero Content Indexing
- **References Only**: Files are never copied to BBQ application caches. BBQ references files in-place on the user's filesystem.
- **Zero Content Reads**: BBQ never reads file bytes into memory to determine MIME types or sizes. Only standard filesystem metadata (`std::fs::metadata`) is read.
- **Large Files Cost Zero**: Adding a 10 GB ISO or 4K video incurs the exact same negligible overhead as adding a 4 KB text file.
- **No Background Watchers**: BBQ does not launch recursive filesystem directory watchers (`notify` / `ReadDirectoryChangesW`) or continuous scanners. Filesystem paths are checked only upon restoration or user-triggered interactions (`open`/`reveal`).

### Bounded Workspace Limits
- **Maximum 100 Entries**: Workspace capacity is capped at 100 entries FIFO. Excess entries have their BBQ SQLite records evicted automatically.
- **Zero Physical File Deletion**: Evicting or removing entries removes references from BBQ SQLite storage only. The underlying user files remain completely untouched.

### Lightweight Duplicate Detection
- Duplicates are detected without SHA-256 or buffer hashing.
- Combination checked: `normalized_path + file_size + modified_timestamp`.
- Re-dropping an existing file moves the reference to the newest position with zero duplicate rows.

---

## 7. Island Interaction Engine & Runtime Performance (Milestone 5)

### Zero Polling & Complete Timer Inventory
- **Zero `setInterval` Loops**: There are strictly zero periodic interval loops anywhere in the frontend codebase.
- **Zero `requestAnimationFrame` Continuous Loops**: No continuous JS rendering loops run in the background.
- **Discrete Timer Inventory**:
  1. `hoverDebounceTimeout` (150 ms): Debounces mouse leave events to eliminate edge jitter triggers when hovering across the Island borders.
  2. `autoCollapseTimeout` (6000 ms): Automatically collapses the Island from Expanded to Idle after 6 seconds of mouse absence without user activity.
- **Immediate Timer Cancellation**: All discrete timers are cleared immediately whenever a user interacts (click, keypress, tab selection) or when the component unmounts.

### Bounded Memory Caches
- **Recent Widgets History**: Capped at `10` entries max FIFO.
- **Event History Log**: Capped at `50` entries max FIFO.
- **Lazy Widget Execution**: Hidden widgets do not run rendering loops or perform unnecessary background IPC calls.

### Render Performance & Store Isolation
- **Domain Store Separation**: Domain stores (`uiStore`, `mediaStore`, `clipboardStore`, `fileStore`, `systemStore`, `timerStore`) are decoupled using `useSyncExternalStore`.
- **Zero Cross-Store Rerenders**: State changes in `mediaStore` do not notify `clipboardStore`, `fileStore`, or `timerStore` subscribers.
- **Hardware Acceleration**: Transitions leverage CSS `transform` (`translate3d`, `scale`) and `opacity` properties, minimizing browser reflow and layout recalculation costs.
- **Reduced Motion Support**: System accessibility preference `@media (prefers-reduced-motion: reduce)` is fully respected, zeroing transition durations and suppressing decorative animations.

---

## 8. Timer, Stopwatch & Pomodoro Performance Architecture (Milestone 7)

### Zero Continuous Backend Tick
- **No Periodic Rust Sleep/Tick Loops**: The backend never runs a 1-second interval loop to advance timer state or decrement counters.
- **No SQLite Tick Persistence**: Timer state is maintained strictly in-memory during execution. No database writes are performed as seconds tick down.
- **Authoritative Timestamp Calculations**: Time remaining or elapsed is derived directly on demand:
  - Countdown: `remaining_ms = max(target_at - now, 0)`
  - Stopwatch: `elapsed_ms = accumulated_duration + (now - started_at)`
  - Pomodoro: phase duration derived from `target_at - now`

### Single Scheduled Wake-Up
- When a countdown or Pomodoro phase is active, a single one-shot deferred sleep task is registered with the tokio runtime for the target expiration time.
- If paused, cancelled, or reset, the wake-up is aborted immediately via a cancellation channel.
- Zero CPU usage while running in background; zero polling loops.

### Bounded UI Display Scheduling
- **Zero `setInterval`**: The UI never uses `setInterval`.
- **Zero Continuous `requestAnimationFrame`**: No continuous RAF ticking loops exist.
- **Cancelable One-Shot Deadline Alignment**: The UI schedules a single `setTimeout` aligned with the boundary of the next whole second:
  `delay = Math.max(50, 1000 - (Date.now() % 1000))`
- The display loop runs ONLY while `TimerWidget` is rendered and `session.state === "Running"`. It is immediately cleared on pause, reset, mode change, widget deactivation, or component unmount.

---

## 7. Notification & Reminder Performance Guarantees (Milestone 8)

### Zero-Polling Architecture
1. **Forbidden Loop Architecture**:
   No periodic polling loops exist anywhere in `NotificationService` or `ReminderService`:
   ```rust
   // EXPLICITLY FORBIDDEN IN BBQ:
   loop {
       tokio::time::sleep(Duration::from_secs(1)).await;
       check_reminders();
   }
   ```
2. **Single One-Shot Wake-Up**:
   `ReminderService` calculates the nearest deadline across all scheduled reminders and schedules a single one-shot sleep task (`tokio::time::sleep`). While waiting for a reminder, the CPU usage of `ReminderService` is effectively **0.0%**.
3. **Rescheduling via Cancellation Channels**:
   When reminders are added, modified, or cancelled, any existing wake-up task is canceled via `oneshot::Sender<()>` and re-evaluated immediately. No busy-waiting occurs.
4. **Bounded In-Memory Collections**:
   - `NotificationService` bounded duplicate suppression is limited to a fixed ring buffer (50 notification IDs) with $O(1)$ amortized push and search.
   - `ReminderService` tracks active reminders in memory and updates the SQLite database only on discrete user actions (create, cancel, fire), never periodically.
5. **Bounded Startup Overdue Processing**:
   Overdue reminders on application launch are limited to a maximum of 10 notifications fired chronologically, avoiding notification storms or burst allocations.
6. **Frontend ReminderWidget Reactivity**:
   `reminderStore` subscribes to `bbq://reminder_changed` events and does not poll via IPC. The UI uses zero intervals (`setInterval: 0`) and recalculates relative remaining time only on event or interaction boundaries.

---

## 9. Launcher & Quick Actions Performance Architecture (Milestone 9)

### Zero-Polling & Zero-Indexing Guarantees
1. **No Background Filesystem Indexing**: The Launcher never scans disks, enumerates directories in the background, or runs crawler threads.
2. **No Process Process Polling**: The Launcher never enumerates running processes or polls for application state changes.
3. **No `setInterval` or continuous RAF**: The Launcher widget operates entirely on user input events (keystrokes and clicks) and discrete domain events.
4. **Bounded In-Memory Application Cache**: Native application discovery is lazy, bounded to a maximum of 100 items (`MAX_APPLICATIONS = 100`), and kept in memory without persistent disk scanning overhead.
5. **Bounded Recent & Favorites Storage**:
   - `launcher_recent` is capped at a strict bound of 50 items. Re-launching an existing item updates its timestamp and usage count in-place instead of creating duplicate records.
   - `launcher_favorites` is capped at 20 items and modified strictly via explicit user actions.
6. **Isolated Store & Search Performance**:
   - `launcherStore` utilizes `createDomainStore` and `useSyncExternalStore`. Keystrokes filter in-memory collections with zero backend IPC round-trips.
   - Updates to `launcherStore` are completely isolated and never trigger rerenders in other widget stores.

---

## 10. Search Performance (Milestone 10)

### $O(N)$ Bounded In-Memory Search
1. **Zero Disk I/O Per Query**: Every search query operates entirely on pre-loaded in-memory candidate collections. No SQLite queries, no filesystem access, and no IPC round-trips occur on keystrokes.
2. **Strictly Bounded Candidate Pool**:
   - Total search candidates are bounded ($N \le 170$, comprising built-in quick actions, max 50 recent items, max 20 favorites, and max 100 applications).
   - Worst-case algorithm complexity per keystroke is strictly $O(N \cdot L)$ where $L \le 128$ is the bounded query length and $N \le 170$.
3. **Bounded Result Limit**:
   - Output results are strictly limited to `MAX_SEARCH_RESULTS = 20`.
   - Frontend and backend never allocate or serialize unbounded result arrays.
4. **Zero-Polling & Stateless Execution**:
   - Search computation executes synchronously without background threads, worker loops, or interval timers.
   - Zero timers (`setInterval: 0`), zero continuous animation loops (`requestAnimationFrame: 0`).
5. **Deterministic Sub-Millisecond Latency**:
   - Both Rust `SearchEngine::search` and TypeScript `searchLauncherItems` complete within microseconds for typical queries, eliminating any requirement for debouncing or search caching.

---

## 11. Drag & Drop Performance & Zero-IPC Benchmarks (Milestone 11)

### Zero DragOver IPC Spam
- **Local-Only DragOver**: DragOver events fire continuously during drag gestures (up to 60+ times per second). BBQ handles dragover entirely inside the frontend React event loop (`e.preventDefault()`, `e.stopPropagation()`).
- **Benchmark**: In simulated tests of 100 continuous dragover events, exactly **0 IPC invocations** are generated, eliminating IPC queue starvation and backend event loop lag.

### Lightweight Metadata Inspection
- **Zero Content Reads**: BBQ never reads file contents, executes parsers, or generates file checksums/hashes during drop or inspection.
- **Zero Directory Tree Crawling**: Dropping a directory inspects only the root folder metadata (`size`, `modified_at`). BBQ never recursively traverses the filesystem.
- **Inspection Latency**: Metadata inspection completes in under 1ms per item via `PlatformFile::validate_path`.

### Bounded Multi-Drop & Controlled Execution
- **Strict Limit**: Drop batches are capped at `MAX_DROP_ITEMS = 50`.
- **Sequential Execution**: Multi-drop execution (`Open All`, `Reveal All`) runs sequentially with per-item error isolation. This avoids launching dozens of concurrent OS processes simultaneously, preventing OS process table exhaustion.
- **Zero Polling**: `DropService` employs zero polling loops (`setInterval: 0`, `tokio::time::interval: 0`). State updates are strictly event-driven.

---

## 12. Global Hotkey & Quick Command Surface Performance (Milestone 12)

### Zero-Polling & Event-Driven Hotkey Detection
- **OS Native Registration**: The global hotkey is registered directly with the OS message loop (Win32 `RegisterHotKey`, mock event sink).
- **Zero Polling**: Zero background polling loops (`tokio::time::interval: 0`, `std::thread::sleep: 0`, `setInterval: 0`).
- **Immediate Wakeup**: The OS notifies BBQ only when the registered key combination is pressed, keeping CPU usage at 0.0% while idle.

### Zero-IPC Keystroke Search
- **Local-First Mirroring**: The Quick Command Surface uses `searchLauncherItems` purely in-memory.
- **Zero Keystroke IPC**: Typing in the command search input triggers 0 Tauri IPC invocations, 0 SQLite queries, and 0 filesystem accesses.
- **Instant Response**: Smart search ranking evaluates all candidate items ($N \le 170$) in under 0.2ms per keystroke.

### Sub-Millisecond Island Activation
- **Direct Focus Transition**: Pressing the global hotkey immediately coordinates window unminimize, display, and OS focus, while transitioning the Island state machine to `Expanded` on the `launcher` widget in a single deterministic tick (< 5ms).
- **Toggle Efficiency**: Subsequent hotkey presses toggle back to `Idle` without animating unnecessary layout reflows.

### Bounded Memory Footprint
- **State Overhead**: `hotkeyStore` and `HotkeyService` maintain a tiny fixed footprint (< 1 KB RAM) consisting of the active hotkey definition and capabilities.

---

## 13. Production Release Benchmarks (v1.0.0) & 1.1 Sustainability Invariants

### v1.0.0 Verified Host Metrics (Windows 11 x64)
- **Idle Memory (WorkingSet)**: **51.68 MB** (Strict budget: <= 60.0 MB).
- **Idle Memory (PrivateBytes)**: **32.40 MB**.
- **Idle CPU**: **0.0%** (zero wakeups when resting in compact mode).
- **Active Loops**:
  - `setInterval`: **0**
  - Continuous `requestAnimationFrame`: **0**
  - Continuous `tokio::time::interval`: **0**
- **Test Invariant Suites**:
  - Frontend: 124 tests pass in ~600ms.
  - Rust Backend: 144 tests pass in ~1.5s.

### 1.1 Development Sustainability Rule
For every new feature proposed for 1.1 and beyond, developers must answer the Sustainability Question:

> **"Does this feature consume CPU cycles, GPU shaders, or RAM allocations while BBQ is in an idle compact state?"**

If the answer is **YES**, the design is rejected. The feature must be re-architected to be:
1. **Event-driven** (woken strictly by OS signals or user interactions),
2. **Lazy** (computed strictly upon widget activation/expansion), and
3. **Bounded** (strictly bounded cache retention and resource limits).

