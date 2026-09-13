# BBQ Architecture

## 1. System Overview

BBQ is a cross-platform desktop productivity island running on **Windows**, **macOS**, and **Linux**. It lives at the top of the display and adapts between idle, active, expanded, and interacting modes.

```text
                    BBQ
                     │
          ┌──────────┴──────────┐
          │                     │
       FRONTEND              BACKEND
          │                     │
     React / TS                Rust
          │                     │
      UI Layer             Core Layer
          │                     │
          └──────── IPC ────────┘
                                │
                         Service Layer
                                │
                       Platform Abstraction
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
          Windows             macOS              Linux
                                             (X11 / Wayland)
```

---

## 2. Architectural Layers

### Frontend (UI Layer)
- **Technology**: React 19 + TypeScript + Vite.
- **Responsibilities**:
  - Render the Island shell and adaptive widgets.
  - Coordinate 60 FPS transitions via CSS hardware acceleration (`transform`, `opacity`).
  - Manage user interactions.
- **Strict Boundary**: The frontend NEVER directly calls filesystem, window APIs, or OS hooks. All communications occur via typed Tauri IPC invocations and event subscriptions.

### IPC Layer
- **Tauri Commands**: Request-response calls with typed arguments and serialized JSON errors (`Result<T, String>`).
- **Tauri Events**: Push notifications from Rust backend to frontend (e.g., `media_changed`, `clipboard_changed`, `display_changed`).
- Avoids untyped strings; mirrors Rust domain events.

### Core Layer (`crates/core`)
- Centralized error handling (`BbqError`).
- Strongly typed event system (`BbqEvent`).
- Platform-safe directory management (`config`, `data`, `cache`, `logs`).
- Structured logging via `tracing` with PII redaction.

### Storage Layer (`crates/storage`)
- Embedded SQLite using bundled `rusqlite` (no runtime C dependency issues).
- Versioned migrations table (`schema_migrations`) executed on app startup.
- Repository pattern isolating SQL queries from business logic.

### Service Layer (`crates/services`)
- 14 modular services registered in a thread-safe `ServiceRegistry`.
- Implemented in Foundation Milestone:
  - `DisplayService`: Display enumeration, primary display lookup, scale awareness.
  - `WindowService`: Island window centering on primary/target monitor, always-on-top, size coordination.
  - `SettingsService`: Persistent user configuration backed by SQLite.
  - `StorageService`: Central SQLite database manager, migrations runner, and connection lifecycle.
- Implemented in Milestone 2:
  - `MediaService`: Event-driven, zero-polling media session management.
    - Operates strictly across the `PlatformMedia` abstraction.
    - Lifecycle: `Sleeping` when idle or no media is playing; wakes to `Active` when playback starts; returns to `Sleeping` on pause/stop.
    - Multi-Player Selection: Deterministically selects active player (`Playing` > `Paused` > `First available`).
    - Capabilities-driven: Reports supported controls (`can_play`, `can_pause`, `can_go_next`, `can_go_previous`, `can_seek`, `can_change_volume`).
- Architectural Boundary Contracts (Interfaces prepared for future milestones):
  - `FileService`, `ClipboardService`, `LauncherService`, `TimerService`, `NotesService`, `BookmarkService`, `NetworkService`, `SystemService`, `NotificationService`.
- Each service implements the `Service` lifecycle trait (`init()`, `start()`, `stop()`, `status()`).
- Failure isolation: Failure in one service will never crash the BBQ core.

### Platform Abstraction Layer (`crates/platform`)
- High-level services only depend on Rust traits:
  - `PlatformWindow`
  - `PlatformDisplay`
  - `PlatformClipboard`
  - `PlatformMedia`
  - `PlatformNotification`
  - `PlatformSystem`
  - `PlatformNetwork`
- Concrete OS implementations:
  - `platform/windows`: Win32 / Windows Runtime APIs.
  - `platform/macos`: Cocoa / AppKit / macOS notifications.
  - `platform/linux`: X11 & Wayland detection with portal/DBus fallbacks.
  - `platform/mock`: In-memory implementation for unit testing and CI without display servers.

---

## 3. Dependency Policy

Dependencies are strictly controlled:
1. Prefer standard library and platform-native APIs.
2. Evaluate binary size, compile overhead, and security profile before adding any crate.
3. No telemetry or heavy analytics packages permitted.

---

## 4. Media Subsystem Architecture (Milestone 2)

### Architecture
```text
MediaService (crates/services)
      │
      ▼
PlatformMedia Trait (crates/platform)
      │
 ┌────┼─────────────┬─────────────┐
 ▼    ▼             ▼             ▼
Win  macOS         Linux         Mock
SMTC Now Playing   MPRIS         In-Memory (Tests & CI)
```

### Event Flow
1. **Platform Event**: OS triggers native callback (`CurrentSessionChanged`, MPRIS `PropertiesChanged`, macOS Now Playing notification).
2. **PlatformMedia Adapter**: Normalizes native metadata into `bbq_core::MediaEvent`.
3. **MediaService**: Updates internal session cache, computes deterministic active player, transitions service state (`Sleeping` <-> `Active`), and notifies event sinks.
4. **Tauri IPC**: Emits `bbq://media_changed` or `bbq://media_playback_state` to the frontend.
5. **Frontend `mediaStore`**: Updates React state, smoothly transitioning Island presentation between idle pill and media banner.

### Deterministic Player Selection
When multiple players exist concurrently:
1. **Actively Playing**: Any session with `PlaybackState::Playing` takes highest priority.
2. **Paused / Most Recently Active**: Paused sessions take second priority.
3. **First Available**: Fallback to first available enumerated session.

---

## 5. Clipboard Subsystem Architecture (Milestone 3)

### Architecture
```text
ClipboardService (crates/services)
       │
       ▼
PlatformClipboard Trait (crates/platform)
       │
 ┌─────┼──────────────┬──────────────┐
 ▼     ▼              ▼              ▼
Win   macOS          Linux          Mock
Win32 AppKit/Cocoa   X11/Wayland    In-Memory (Tests & CI)
Format Listener
```

### Event Flow
```text
Native OS Clipboard Change
          ↓
PlatformClipboard Adapter (WM_CLIPBOARDUPDATE on Win32, push listener where supported)
          ↓
Normalize into ClipboardEntry (bounded text up to 64 KiB, 150-char preview, sensitive heuristic)
          ↓
Deduplicate (consecutive duplicate content ignored without expensive hashing)
          ↓
Is History Enabled?
  ├── NO:  Do NOT persist. Do NOT retain long-term. Transition to Sleeping.
  └── YES: Persist to SQLite (table `clipboard_entries`, max 100 entries FIFO).
          ↓
Emit `bbq://clipboard_changed` to Frontend via Tauri IPC
          ↓
Frontend `clipboardStore` updates state. Island UI reflects entry only when activated.
```

### Privacy & Storage Model
- **Disabled by Default**: `clipboard.history.enabled = false`. The user must explicitly opt in.
- **Immediate Purge**: Toggling history from enabled to disabled automatically purges all stored database entries and memory cache.
- **Zero Raw Binaries**: Images and file drops are recorded solely as lightweight metadata summaries; no binary blobs or image buffers are stored in SQLite.
- **Sensitive Data Tagging**: Lightweight pattern heuristics flag credentials (API tokens, private keys, passwords) with `possible_sensitive: true` without ever logging or leaking content.

---

## 6. File Subsystem & Island Drop Zone Architecture (Milestone 4)

### Architecture
```text
                  Frontend (Island Drop Zone)
                             │
                             ▼
                     Tauri IPC Layer
                             │
                             ▼
                  FileService (crates/services)
                             │
                             ▼
                  PlatformFile Trait (crates/platform)
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
     Windows               macOS                Linux
(ShellExecute/Explorer)    (open)             (xdg-open)
```

### Reference-Only Workspace Model
- **Zero File Copying**: BBQ stores only references to existing user files. Files remain strictly at their original filesystem locations (e.g. `Desktop/report.pdf`).
- **Zero File Deletion**: Removing a `FileEntry` from BBQ removes only the database record from SQLite; the underlying user file is **never deleted**.
- **Zero Content Indexing**: BBQ never reads entire file contents or generates thumbnails; it records metadata only (path, name, extension, MIME type, size, modified timestamp).

### Event & Drop Flow
```text
OS Drag over BBQ Island
        ↓
Tauri window or WebView drop event receives file path
        ↓
IPC `file_add(path, source)`
        ↓
FileService validates path via PlatformFile
        ↓
Normalize metadata & detect duplicates (normalized path + size + modified_at)
        ├── If duplicate: move existing entry to newest position (monotonic created_at)
        └── If directory: reject with clear validation error
        ↓
Insert FileEntry into SQLite (`file_entries`, max 100 entries FIFO)
        ↓
Emit `bbq://file_added` & `bbq://file_workspace_changed`
        ↓
Frontend `fileStore` updates state; Island UI reflects drop with GPU animations
```

### Path Security & Explicit Actions
- All paths are validated in Rust via `canonicalize` / normalized separators.
- Directories are rejected with an explicit error.
- Files are **never automatically opened or executed**. Execution of files requires an explicit user action via `file_open` or `file_reveal`.
- Only 6 typed IPC commands are exposed:
  - `file_get_workspace`
  - `file_add`
  - `file_open`
  - `file_reveal`
  - `file_remove`
  - `file_clear_workspace`
- Arbitrary filesystem read, write, or delete APIs are strictly excluded.

---

## 6. Milestone 5: Island Interaction Engine & Widget Runtime

```text
                    Island Shell
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
            Media    Clipboard    Files
              │          │          │
              └──────────┼──────────┘
                         ▼
                   Widget Runtime
```

### State Machine Architecture
The BBQ Island UI is driven by an authoritative finite state machine (`islandState.ts` & `IslandRuntime.ts`) eliminating scattered boolean flags:
- **`Idle`**: Minimal pill view (`BBQ` or compact summary).
- **`Hovering`**: Compact interactive preview on mouse hover with glow and subtle elevation.
- **`Expanded`**: Full widget view with semantic tab navigation.
- **`DraggingOver`**: Hardware-accelerated drop target highlight when dragging a file.
- **`Transitioning`**: Guard state during active CSS transitions.

### State Transitions
```text
Idle ──(mouse enter)──> Hovering ──(click / Enter)──> Expanded ──(mouse leave + inactivity)──> Idle
Idle ──(drag enter)───> DraggingOver ──(drop)────────> Expanded (Files tab active)
DraggingOver ──(drag leave)──> Idle
Expanded ──(Escape)───> Hovering/Compact ──(Escape)──> Idle
Expanded ──(click outside)──> Idle
```

### Widget Runtime & Registry
- **Decoupled Architecture**: Widgets do not import or call other services directly.
- **Contract (`WidgetDefinition`)**: `id`, `title`, `icon`, `priority`, `canActivate`, `render`, `lifecycle` (`idle`, `loading`, `ready`, `error`, `unavailable`).
- **Active Widgets**: `files`, `clipboard`, `media`.
- **Declared Future Widgets**: `timer`, `notes`, `bookmarks`, `network`, `system`, `launcher`.
- **Error Isolation**: Each widget renders within a dedicated `WidgetBoundary`. If an unhandled exception occurs in one widget (e.g. malformed preview), only that widget displays an error recovery card with a Retry button; the Island shell and all other widgets continue running unaffected.

### Priority Hierarchy
When multiple background events and interactions occur simultaneously, widget focus resolves strictly by:
1. **User interaction** (Manual click/tab selection sets `userLockedWidget = true`) [100]
2. **Drag & drop** (File drop activates Files widget) [90]
3. **Active media** (Media playback wakes Media widget only if user has not locked another widget) [80]
4. **Clipboard event** (New copy item updates clipboard preview) [70]
5. **File event** (File added/removed updates file count) [60]
6. **System widget** (Hardware telemetry metrics) [50]
7. **Timer widget** (Countdown / Stopwatch / Pomodoro) [40]
8. **Background widgets** [30]
9. **Idle** [10]

---

## 7. Milestone 7: Timer, Stopwatch & Pomodoro Quick Tool

```text
                     TimerService
                          │ (In-memory, Timestamp Truth)
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
    Countdown         Stopwatch         Pomodoro
   (target_at)    (started_at+accum)   (Work/Breaks)
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │ (bbq://timer_changed)
                          ▼
                     timerStore
                          │
                     TimerWidget
        (Bounded, cancelable next-second repaint)
```

### Core Architecture & Timestamp Source of Truth
`TimerService` coordinates precision timing with **zero continuous background loops**:
- **Timestamps as Source of Truth**:
  - Countdown: `target_at = now + duration; remaining = max(target_at - now, 0)`
  - Stopwatch: `elapsed = accumulated_duration + (now - started_at)`
  - Pomodoro: phase sequence driven by `target_at = now + phase_duration`
- **Derived Snapshots**: The backend does NOT tick every second. `remaining_ms` is computed on-demand on state queries and discrete state change events (`bbq://timer_changed`).
- **Single Scheduled Wake-Up**: When a countdown or Pomodoro phase starts, a single one-shot `tokio::time::sleep` wake-up task is scheduled for `target_at`. If the user pauses, resets, or cancels, the one-shot task is cancelled via a cancel channel / abort. When the delay expires, the timer transitions exactly once to `Completed` and fires `TimerCompleted`.

### Pomodoro State Machine
Pomodoro executes a strict 4-cycle sequence:
```text
Work (25m) ──> ShortBreak (5m) ──> Work (25m) ──> ShortBreak (5m)
     ▲                                                 │
     │                                                 ▼
LongBreak (15m) <── Work (25m) <── ShortBreak (5m) <── Work (25m)
```
- Tracks `completed_cycles` and current `pomodoro_work_count` (1–4).
- On phase completion: emits `TimerCompleted`, advances to next phase, and emits `TimerPhaseChanged`.
- LongBreak completion resets the cycle counter and increments `completed_cycles`.

### TimerWidget Lifecycle & Bounded UI Scheduling
- Visible ONLY when active or in compact island pill.
- When `session.state === "Running"`, schedules a bounded, cancelable `setTimeout` targeting the exact next whole-second boundary (`1000 - (Date.now() % 1000)`).
- Cancelled immediately when paused, reset, completed, deactivated, or unmounted.
- Zero `setInterval`, zero infinite `requestAnimationFrame` loops.
- Registered in `WidgetRegistry` with priority **40**.
- Respects `userLockedWidget`: background timer changes never hijack user-selected tabs.

---

## 12. Notification & Reminder Subsystem (Milestone 8)

Milestone 8 introduces a decoupled notification and reminder architecture adhering strictly to zero-polling principles:

```text
┌─────────────────────────────────────────────────────────────┐
│                      TimerService                           │
└──────────────────────────────┬──────────────────────────────┘
                               │ (TimerCompleted event)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Application Event Coordinator               │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    NotificationService                      │
│   - Bounded in-memory duplicate suppression (max 50 IDs)    │
│   - Capabilities reporting                                  │
│   - Emits bbq://notification_changed                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     PlatformNotification                    │
│   - Windows: WinRT ToastNotificationManager / ToastXml      │
│   - macOS: Native user notification capability / adapter    │
│   - Linux: Native notification adapter (graceful fallback)  │
│   - Mock: In-memory notification capture for tests          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       ReminderService                       │
│   - In-memory collection of active Reminders                │
│   - Local SQLite persistence (reminders table migration v4) │
│   - Calculates nearest due_at timestamp                     │
│   - Single cancelable tokio wake-up (oneshot channel)       │
│   - Bounded overdue startup recovery (max 10 notifications) │
│   - Emits bbq://reminder_changed                            │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               │ (due_at reached)             │ (IPC / Events)
               ▼                              ▼
      NotificationService               reminderStore
               │                              │
               ▼                              ▼
        OS Notification                 ReminderWidget
                                     (Priority 35 in Island)
```

### Notification Architecture
- **Separation of Concerns**: `NotificationService` handles *only* delivering local desktop notifications. It owns no timer state, performs no SQLite queries, and does not poll the OS.
- **Platform Notification Trait**: `PlatformNotification` abstracts OS notifications:
  - `WindowsNotification`: Uses Windows Runtime (`windows` crate) `ToastNotificationManager` and Toast XML templates with app identifier fallback.
  - `MacOSNotification`: Capability detection and native notification invocation.
  - `LinuxNotification`: Common desktop notification capability reporting and fallback.
  - `MockNotification`: Deterministic in-memory capture of notifications for test assertions without OS side effects.
- **Duplicate Suppression**: Bounded in-memory queue (`VecDeque`, capacity 50) prevents duplicate notifications with identical IDs from spamming the user within a short window.

### Reminder Architecture & Single Cancelable Wake-Up
- **Timestamp Source of Truth**: Reminders use authoritative epoch millisecond timestamps (`due_at`).
- **Nearest-Deadline Scheduling**: `ReminderService` schedules a single asynchronous sleep task targeting the earliest `due_at` among scheduled reminders:
  ```rust
  let (tx, rx) = oneshot::channel();
  // Spawn a one-shot wake-up targeting the nearest deadline
  tokio::select! {
      _ = sleep(duration) => { fire_due_reminders(); }
      _ = rx => { /* cancelled due to earlier reminder creation or cancellation */ }
  }
  ```
- **Zero-Polling Guarantee**: No `loop { sleep(1s); check_reminders(); }` exists. When a reminder is created, cancelled, or fired, the nearest deadline is recalculated and the existing sleep task is cleanly aborted/cancelled via the `oneshot` channel.
- **Overdue Startup Recovery**: On service initialization, overdue scheduled reminders are identified and fired up to a strict bound (maximum 10 notifications) in chronological order to prevent notification storms, and their state is transitioned to `Fired`.
- **Timer Integration via Event Coordinator**: `TimerService` does NOT directly call `NotificationService`. Instead, the application setup layer listens for `TimerCompleted` domain events and translates them into appropriate notifications (`NotificationCategory::Timer` or `NotificationCategory::Pomodoro`).

---

## 13. Launcher & Quick Actions Subsystem (Milestone 9)

Milestone 9 introduces a lightweight, security-hardened Launcher and Quick Actions subsystem integrated directly into the BBQ Island:

```text
┌─────────────────────────────────────────────────────────────┐
│                       LauncherWidget                        │
│   - Search input (auto-focused on open)                     │
│   - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape) │
│   - Favorites, Recent, and Built-in Quick Actions           │
│   - Accessibility: role="combobox", role="listbox", hints   │
│   - Island priority: 45                                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ (IPC Commands & Events)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      LauncherService                        │
│   - Registry of built-in BBQ and System quick actions       │
│   - Bounded recent actions (max 50, SQLite v005_launcher)   │
│   - Bounded favorites (max 20, SQLite v005_launcher)        │
│   - Lazy bounded application cache (max 100)                │
│   - Action & URL validation (http/https only, no shell)     │
│   - Emits bbq://launcher_changed events                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      PlatformLauncher                       │
│   - Windows: Safe ShellExecuteW API, Win32 LockWorkStation  │
│   - macOS: Capability reporting & native Launch Services    │
│   - Linux: Capability reporting & desktop open mechanisms   │
│   - Mock: Deterministic test capture                        │
└─────────────────────────────────────────────────────────────┘
```

### Strict Security Boundaries
BBQ Launcher is strictly NOT a generic shell or command executor:
- **No Arbitrary Execution**: Arbitrary shell execution (`cmd.exe`, `powershell.exe`, `bash`, `zsh`, `sh`) and process spawning APIs are strictly forbidden.
- **URL Scheme Allowlist**: Only `http` and `https` schemes are permitted. Schemes such as `file:`, `javascript:`, `data:`, `vbscript:`, and arbitrary executable schemes are rejected at the core validation boundary.
- **Controlled File/Folder Targets**: Files and folders are verified to exist, path canonicalized, and validated against FileService boundaries before opening.
- **No Background Filesystem Crawling**: No recursive disk traversal, no indexing daemons, no process polling, no keylogger hooks. Search operations query only the bounded in-memory items collection.

### Core Domain Model & Platform Abstraction
- `LauncherAction`: Strongly typed enum (`OpenApplication`, `OpenFile`, `OpenFolder`, `OpenUrl`, `SystemAction`, `BbqAction`).
- `SystemActionType`: Explicit allowlisted system actions (`OpenSettings`, `ToggleMute`, `OpenDownloads`, `OpenHome`, `ShowDesktop`, `LockScreen`).
- `BbqActionType`: Built-in BBQ tools (`OpenSettings`, `OpenClipboard`, `OpenReminders`, `OpenTimer`, `OpenSystem`, `OpenMedia`).
- `PlatformLauncher`: Trait providing native OS execution for supported capabilities without constructing raw shell command strings. On Windows, `ShellExecuteW` and `LockWorkStation` are used.

### Storage & Retention
- Migration `v005_launcher`: Creates `launcher_recent` and `launcher_favorites` tables.
- Bounded capacity: Recent history is capped at 50 items with duplicate updates on re-launch; Favorites are capped at 20 items.

### Widget Priority & Island Interaction
- Launcher widget priority is set to **45**, precisely positioned in the hierarchy:
  `System (50) > Launcher (45) > Timer (40) > Reminder (35)`
- Respects `userLockedWidget` to ensure background notifications never steal focus from the launcher.

---

## 14. Smart Search & Suggestions (Milestone 10)

Milestone 10 transforms Launcher's substring search into a lightweight, deterministic, local-first, bounded, and zero-polling **Smart Search & Ranking Engine**:

```text
query
  ↓
normalize & validate (max 128 chars, max 16 tokens, lowercase, collapse whitespace)
  ↓
candidate collection (in-memory, bounded, deduplicated by item_id)
  ↓
multi-tier matching (Exact > Prefix > Token > Keyword > Fuzzy > Subtitle)
  ↓
bounded context boosts (Favorite +120, Recent +80, Usage min(100, sqrt(count)*10), Recency min(50, 24h decay))
  ↓
deterministic tie-breaker (score DESC -> tier DESC -> favorite DESC -> usage DESC -> recency DESC -> id ASC)
  ↓
bounded top-N results (max 20 items)
  ↓
LauncherWidget
```

### Deterministic Multi-Tier Matching
Scoring follows a strict mathematical hierarchy guaranteeing that match quality always dominates context bonuses:
1. **Exact Title (+1000)**: Complete normalized match against `item.title`.
2. **Title Prefix (+700)**: Title starts with the normalized search query.
3. **Token Title (+500)**: All query tokens exist within `item.title`.
4. **Keyword Match (+450 exact, +400 prefix)**: Match against curated multilingual/alias keywords.
5. **Fuzzy Title Match (+300)**: Deterministic ordered subsequence matching on `item.title`.
6. **Subtitle Match (+200 exact, +150 prefix, +100 token)**: Matches against `item.subtitle`.

### Invariant & Bounded Context Boosts
Context boosts enhance ranking only between comparable match qualities:
- **Favorite Boost (+120)**: Applied to favorite items.
- **Recent Boost (+80)**: Applied to recently launched items.
- **Bounded Usage Bonus (max +100)**: Sublinear growth `min(100, floor(sqrt(usage_count) * 10))` prevents high-usage items from dominating.
- **Bounded Recency Bonus (max +50)**: Decays linearly over 24 hours.
- **Core Invariant**: A poor fuzzy match with maximum usage (300 + 100 = 400) **can never** overtake an exact title (1000), title prefix (700), or token match (500).

### Context-Aware Empty Query Suggestions
When the search input is empty, deterministic suggestions are presented in strict order:
1. Favorites (ordered by usage count and last used)
2. Recent items (ordered by recency)
3. Frequently used built-ins
4. Default BBQ quick actions (alphabetical by ID)

### Zero-Overhead & Local-First Boundaries
- **Stateless SearchEngine**: Platform-independent pure functions; no filesystem, SQLite, network, or OS APIs invoked during search.
- **No Heavy Search / AI Dependencies**: Pure Rust and pure TypeScript implementations with zero external ranking libraries or LLM calls.
- **Bounded Output**: Strictly capped at `MAX_SEARCH_RESULTS = 20` items.

---

## 15. Universal Drag & Drop + Smart File Actions (Milestone 11)

Milestone 11 transforms BBQ Island into a safe, lightweight desktop drop zone and smart file actions hub:

```text
Drag
  ↓ (local-only dragover; 0 IPC calls)
Detect
  ↓ (window drop event or webview drop)
Inspect metadata (PlatformFile::validate_path; zero content reads, zero hashing, zero tree crawl)
  ↓
Show contextual actions (Open, Reveal, CopyPath, AddToWorkspace)
  ↓
User explicitly selects action
  ↓ (bounded sequential execution; MAX_DROP_ITEMS = 50)
Execute
```

### Safety Boundaries & Explicit Action Contract
- **Zero Automatic Side-Effects**: Dropping a file or directory onto BBQ NEVER automatically copies, moves, deletes, overwrites, executes, or uploads anything.
- **Safe Metadata Inspection**: Only checks basic filesystem attributes (`exists`, `size_bytes`, `modified_at`, extension classification). File content is never read, hashed, or parsed.
- **Strictly Explicit CopyPath**: The file path is copied to the system clipboard **only** when the user explicitly clicks or triggers the `Copy Path` action. Zero clipboard writes occur during dragover, drop, or inspection.
- **Workspace Separation & Preservation**: `FileWorkspaceWidget` provides manual management of user-referenced files in SQLite. Dropping onto the Island inspects the files in `DropWidget` and offers `AddToWorkspace` as an explicit action, preserving existing user workflows without auto-inserting behind their back.

### Bounded Multi-Drop & Process Control
- **Item Limit**: Drop batches are strictly capped at `MAX_DROP_ITEMS = 50`.
- **Sequential Execution**: Multi-drop batch actions (e.g. `Open All`, `Reveal All`) are executed sequentially with error isolation to prevent OS process table exhaustion and uncontrolled parallel IPC/task spawning.

### Interaction & Priority Hierarchy
- Drop Zone holds priority **90** in the Island Interaction Engine, ensuring that active file drop interactions immediately surface:
  `Drop (90) > Files (85) > Clipboard (80) > Media (70) > System (50) > Launcher (45) > Timer (40) > Reminder (35)`
- **Zero DragOver IPC Spam**: DragOver events are handled purely locally within the frontend/Island state machine (`e.preventDefault()`), eliminating IPC latency and message queue pollution.

---

## 16. Global Hotkey + Quick Command Surface (Milestone 12)

Milestone 12 introduces a global, OS-registered hotkey and keyboard-first command surface that integrates directly with the BBQ Island Interaction Engine and Smart Search:

```text
Global Hotkey (Ctrl+Space / Cmd+Space)
  │
  ▼
PlatformHotkey Trait (Platform abstraction)
  │
  ▼
HotkeyService (crates/services #17)
  │
  ▼ (Tauri event: bbq://hotkey_triggered + Window unminimize/show/focus)
Island FSM & Window Runtime
  │
  ▼ (Expands Island directly to "launcher", userLockedWidget: true)
Quick Command Surface (Frontend / LauncherWidget)
  │
  ▼ (Purely in-memory smart search; 0 keystroke IPC)
Smart Search Engine (searchLauncherItems)
  │
  ▼ (Keyboard navigation: ArrowUp/Down, Home, End, Escape)
Target Selection (App / File / Folder / URL / BBQ Action / System Action)
  │
  ▼ (Explicit user Enter or Click)
LauncherService::launch_action
  │
  ▼
Island transitions to Idle
```

### Key Architectural Invariants
1. **Strict Platform Abstraction**:
   - High-level services only interact with `Arc<dyn PlatformHotkey>`.
   - Windows uses OS hotkey registration hooks; macOS and Linux report honest capability status; Mock platform provides full test simulation for triggers and conflicts.
2. **Default & Configurable Hotkey**:
   - Default: `Ctrl+Space` on Windows and Linux, `Cmd+Space` on macOS.
   - Configurable through `SettingsService` (`AppSettings.global_hotkey`).
   - Backed by the existing general key-value `settings` SQLite table (0 schema migration overhead).
3. **Graceful Degradation & Conflict Handling**:
   - If another application holds the shortcut, `HotkeyService` degrades to `ServiceState::Failed` with a descriptive message and emits `bbq://hotkey_conflict`.
   - Zero application crash or launch abort on hotkey conflict.
4. **Window Focus & Island State Coordination**:
   - Backend hotkey listener coordinates window unminimize, display, and OS focus, then emits `bbq://hotkey_triggered`.
   - `IslandRuntime` activates the `launcher` widget, acquires `userLockedWidget = true`, and transitions the Island FSM to `Expanded`.
   - Subsequent hotkey presses toggle the Island back to `Idle`.
5. **Zero-Keystroke-IPC & Deterministic Smart Search**:
   - Keystrokes in the command surface are evaluated 100% in-memory via `searchLauncherItems`.
   - Zero IPC latency, zero background thread polling, and zero message queue thrashing during search.
6. **Hardened Least Privilege Execution**:
   - Reuses hardened `LauncherService::launch_action`.
   - Arbitrary shell strings, `cmd.exe /c`, `powershell`, and raw `Command::new` are strictly forbidden.
   - URLs require strict `http://` or `https://` schemes.

---

## 11. Version 1.0.0 Release Freeze & 1.1 Architectural Evolution

### 1.0.0 Invariant Seal
- **Platform Invariant**: Windows 1.0.0 is verified and sealed. Zero arbitrary shell executions (`sh -c`, `bash -c`, `cmd.exe /c`, `powershell -Command`).
- **Scheduling Invariant**: Zero continuous background loops (`setInterval = 0`, continuous `requestAnimationFrame = 0`, `tokio::time::interval = 0`).
- **Resource Invariant**: Bounded memory footprint (WorkingSet <= 60 MB, actual 51.68 MB) and bounded database retention (30 days, 100 clipboard entries).

### 1.1 Architectural Targets
- **Native OS Runtime Parity**: Direct platform binding transitions for macOS (`CoreGraphics`, `MPNowPlaying`, `RegisterEventHotKey`) and Linux (`XRandR`, `zbus` MPRIS, `XGrabKey`, `zwlr_layer_shell_v1`).
- **Formalized Widget Lifecycle**: Introduction of `WidgetLifecycle` interface ensuring strict isolation, memory cleanup, error boundaries, and capability gating.
- **Sandboxed Extension System**: Long-term declarative extension model with zero arbitrary code execution and strict capability permissions.

