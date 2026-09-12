# BBQ Security Architecture

## 1. Principles of Least Privilege

1. **Strict Backend Mediation**: The frontend has no direct access to the OS filesystem, camera, microphone, or network sockets. Every action must be triggered via explicit, parameterized Tauri commands.
2. **Local-First & Data Isolation**: All data is stored in the user's OS application data directory (`%APPDATA%/BBQ` on Windows, `~/Library/Application Support/BBQ` on macOS, `~/.local/share/BBQ` on Linux).
3. **No Unsolicited Network Access**: BBQ will never phone home or transmit analytics.
4. **PII Sanitization in Tracing**: All loggers are explicitly filtered so that sensitive strings (clipboard text, note contents, personal file paths) are sanitized before logging.

---

## 2. IPC Safety

All IPC commands are validated in Rust:
- Path parameters are canonicalized and verified against permitted directories to prevent directory traversal.
- SQL inputs use parameterized queries via `rusqlite` to eliminate SQL injection risks.
- IPC command responses are strictly typed via serde.

---

## 3. Clipboard Privacy & Security Model (Milestone 3)

1. **Disabled by Default**:
   - `clipboard.history.enabled = false`.
   - The user must explicitly enable clipboard history.
   - When disabled, clipboard change notifications are dropped immediately; no text or metadata is persisted to SQLite or retained long-term in memory.

2. **Purge on Disable**:
   - When the user toggles history off, all stored records in the SQLite database and all in-memory caches are purged immediately.
   - The user can also trigger an explicit `clear_history` operation at any time.

3. **Total Log Redaction**:
   - Clipboard text contents are NEVER emitted to `tracing` log events, standard output, error messages, or crash traces.
   - Loggers only record sanitized operational metadata: entry ID, content type, size in bytes, and sensitivity flags.

4. **Zero Cloud Synchronization & Zero Telemetry**:
   - Clipboard content never leaves the user's local workstation.
   - No remote sync, network telemetry, analytics, or background reporting services are integrated.

5. **Sensitive Content Heuristics**:
   - Lightweight heuristic analysis identifies common sensitive formats:
     - Private key headers (`-----BEGIN ... PRIVATE KEY-----`)
     - Common API token prefixes (`ghp_`, `AKIA...`, `sk_live_`, `Bearer `, etc.)
     - Credential assignments (`password=`, `api_key=`, `secret=`)
     - JWT tokens
   - Matching items are flagged with `possible_sensitive: true`. The text itself is never logged or leaked during evaluation.

---

## 4. File Subsystem & Path Security Model (Milestone 4)

1. **Backend Path Validation**:
   - The frontend is untrusted. All file paths are strictly canonicalized and validated in Rust.
   - Symlinks, junctions, and relative traversal sequences are resolved and validated before any record is created.
   - Files that do not exist or are inaccessible are rejected immediately with a typed `BbqError::Validation`.

2. **Directory Rejection**:
   - Dropping a directory onto BBQ is rejected with a clear error: `"Directories are not supported in temporary workspace"`.
   - BBQ will never recursively traverse directory trees or bulk-import filesystem hierarchies.

3. **No Automatic File Execution**:
   - Files are never automatically executed or opened upon being dropped.
   - Scripts, binaries (`.exe`, `.bat`, `.cmd`, `.sh`, etc.), and documents remain inert references.
   - File actions (`open`, `reveal`) require explicit, intentional user clicks in the expanded Island UI.

4. **Guaranteed Physical File Preservation**:
   - Removing a `FileEntry` from BBQ workspace removes only the SQLite reference.
   - The physical user file on disk is **never deleted or altered**.
   - Clearing the entire BBQ workspace leaves all referenced files completely intact.

5. **Exclusion of Arbitrary Filesystem APIs**:
   - IPC commands are restricted strictly to workspace reference operations (`file_get_workspace`, `file_add`, `file_open`, `file_reveal`, `file_remove`, `file_clear_workspace`).
   - Generic filesystem read/write/delete commands (`read_file`, `write_file`, `delete_file`) are strictly prohibited from BBQ IPC.

---

## 5. Widget Runtime & UI Isolation Security (Milestone 5)

1. **Per-Widget Error Boundary Isolation**:
   - Every widget is wrapped within a dedicated `WidgetBoundary` component.
   - If a widget throws an unexpected runtime error (e.g. malformed data payload, unexpected formatting edge case), the error is isolated to that specific widget container.
   - An isolated error card with a "Retry Widget" option is displayed, while the Island shell, navigation bar, and all other widgets remain fully responsive and operational.

2. **Decoupled Frontend Widget Sandboxing**:
   - Frontend widgets have zero direct access to filesystem, process execution, or native OS hooks.
   - Widgets communicate strictly through domain stores and typed IPC command wrappers (`bbqCommands`).
   - Widgets are decoupled from one another: a widget cannot manipulate or mutate another widget's private domain state.

3. **No Dynamic Code Execution**:
   - BBQ frontend code contains strictly zero `eval()`, `new Function()`, or dynamic script injection mechanisms.
   - UI templates are statically compiled via TypeScript and React.

4. **Keyboard Accessibility Without Focus Trapping**:
   - Keyboard interaction uses standard navigation (`Tab`, `Escape`, `Enter`, `Space`).
   - BBQ never traps keyboard focus or installs invasive global keyloggers.

---

## 6. Timer Subsystem & Telemetry Isolation (Milestone 7)

1. **In-Memory Volatile Session State**:
   - The active `TimerSession` (countdown, stopwatch, Pomodoro) is held purely in RAM inside `TimerService`.
   - When the BBQ application terminates, timer sessions reset. No timer session state or historical usage is persisted to disk or SQLite every second.

2. **Zero Telemetry & Zero Remote Sync**:
   - Timers run entirely on the local machine.
   - No time tracking logs, work session durations, completed cycle counts, or analytics are transmitted to any remote servers or third-party APIs.

3. **Input Validation & DoS Prevention**:
   - All timer command inputs (such as durations) are strongly typed and validated: zero or non-positive durations, or durations exceeding 24 hours (86,400,000 ms), are rejected with typed `BbqError::Validation` errors.
   - Pomodoro cycles and phases follow strict state machine transitions to prevent state corruption or memory leaks from malicious or repeated rapid calls.

---

## 7. Notification & Reminder Security and Privacy (Milestone 8)

1. **Local-Only Notification Delivery**:
   - Notifications are delivered strictly via local OS desktop APIs (`ToastNotificationManager` on Windows, native notification APIs on macOS/Linux).
   - No cloud push notification infrastructure, external webhook, or telemetry service is used. All notifications originate and terminate locally.

2. **Local-Only Reminder Persistence**:
   - Reminders are persisted exclusively in the local, encrypted/sandboxed SQLite database (`reminders` table).
   - No remote synchronization, cloud backup, or network transmission occurs.

3. **Input Validation & Boundary Limits**:
   - Reminder titles must be non-empty and bounded to a maximum of 256 characters.
   - Reminder bodies are optional and bounded to a maximum of 2,048 characters.
   - Notification titles and bodies are similarly clamped to prevent memory exhaustion or native toast rendering overflows.
   - `due_at` must be a strictly future timestamp at creation; past timestamps are rejected with `BbqError::Validation`.

4. **Log Sanitization**:
   - Sensitive reminder titles and body contents are excluded or masked from general debug tracing logs.
   - Duplicate suppression stores only notification IDs in memory (ring buffer of 50 entries) without retaining request payloads indefinitely.

---

## 8. Launcher & Quick Actions Security Model (Milestone 9)

1. **Strict Prohibition of Arbitrary Shell & Process Execution**:
   - Arbitrary shell execution (`cmd.exe`, `powershell.exe`, `bash`, `zsh`, `sh`), command-line string interpolation, terminal command execution, and arbitrary process spawning APIs are strictly forbidden.
   - BBQ Launcher exposes only explicit, allowlisted action variants (`LauncherAction`).

2. **Strict URL Scheme Validation**:
   - Only `http` and `https` schemes are permitted.
   - `file:`, `javascript:`, `data:`, `vbscript:`, custom executable schemes, and unknown protocols are rejected at the core validation boundary (`validate_launcher_url`).

3. **No Unrestricted Filesystem Access**:
   - Opening files and folders requires path canonicalization and verification.
   - The launcher never indexes the filesystem, never recursively scans disks, and does not provide an open-ended file search engine.

4. **No Process Polling or Keylogging**:
   - No background process enumeration or polling is performed.
   - Keyboard interaction operates strictly via browser DOM focus when the Island is expanded; no global keyboard recording or low-level keyboard hooks are installed.

5. **Log & Privacy Redaction**:
   - Launcher operational logs record only sanitized action identifiers and categories.
   - Full file paths, clipboard snippets, sensitive query strings, and authentication tokens in URLs are never logged to tracing or standard output.

---

## 9. Search Security Boundaries (Milestone 10)

1. **Search $\ne$ Execution**:
   - The Smart Search & Ranking Engine (`SearchEngine` in Rust, `launcherSearch` in TypeScript) is a pure mathematical ranking function.
   - Searching can never trigger an action, launch an application, open a file, or invoke a URL. Execution strictly requires explicit user confirmation (e.g. `Enter` keypress or mouse click) passing through the hardened `LauncherService::launch` validation pipeline.
2. **No Arbitrary Shell or Process Invocation**:
   - The search engine does not invoke shell interpreters, execute command strings, or spawn background processes.
3. **No Filesystem Traversal or Crawling**:
   - Search does not scan the disk, crawl folders, or perform directory walking per query. Only pre-loaded bounded in-memory items are matched.
4. **No Query Logging or Persistent Query History**:
   - User search queries are never persisted to disk, never written to SQLite, and never emitted to tracing logs.
   - Private filesystem paths or sensitive terms typed into the search bar remain ephemeral in memory and are discarded when cleared or collapsed.
5. **No Network Access**:
   - The ranking algorithm is 100% local-first and deterministic. No cloud search APIs, telemetry endpoints, or external LLM models are queried.

---

## 10. Desktop Drop Security Boundaries & Invariants (Milestone 11)

1. **Drop $\ne$ Mutation or Execution**:
   - Dropping a file or directory onto BBQ NEVER automatically copies, moves, renames, deletes, overwrites, executes, or uploads anything.
   - The drop flow strictly enforces: `Drag -> Detect -> Inspect metadata -> Show contextual actions -> User explicitly selects action -> Execute`.
2. **Metadata Inspection Without Content Parsing**:
   - Inspection validates basic filesystem metadata via `PlatformFile::validate_path` (verifying existence, size in bytes, and last modified timestamp).
   - BBQ never reads raw file bytes, never executes file parsers, never computes hashes/checksums, and never recursively crawls directory structures.
3. **Strictly Explicit Clipboard Access**:
   - The `CopyPath` action executes ONLY when the user deliberately selects/clicks the `Copy Path` action button.
   - Zero clipboard writes occur during dragover, drop detection, or metadata inspection.
4. **Bounded Multi-Drop Processing**:
   - Batch size is strictly limited to `MAX_DROP_ITEMS = 50`. Dropping beyond 50 items is rejected or truncated.
   - Batch actions run sequentially with per-item error isolation rather than launching dozens of uncontrolled concurrent OS processes.
5. **Separation from Workspace State**:
   - `FileWorkspaceWidget` references in SQLite are not mutated by drop inspection.
   - Users can choose `Add to Workspace` as a conscious contextual action.
6. **No Network Transmission or Telemetry**:
   - Dropped file paths, names, and metadata are never transmitted over the network or sent to telemetry collectors. All inspection and actions are 100% local.

---

## 11. Global Hotkey & Quick Command Surface Security (Milestone 12)

1. **Zero Keylogging & Selective OS Registration**:
   - BBQ NEVER installs low-level keyboard hooks (e.g. `SetWindowsHookEx` with `WH_KEYBOARD_LL` or X11 key grabbers).
   - BBQ only registers the specific user-configured hotkey via standard OS hotkey APIs (`RegisterHotKey`).
   - Non-hotkey keystrokes outside the BBQ window are NEVER intercepted, observed, or logged.

2. **Least Privilege Action Execution**:
   - Commands execute strictly through allowlisted `LauncherAction` types:
     - `OpenApplication`: Resolves known OS executable IDs or Start menu shortcuts.
     - `OpenFile` / `OpenFolder`: Opens via OS shell file association without arbitrary arguments.
     - `OpenUrl`: Validated against strict protocol scheme allowlists.
     - `BbqAction`: Internal navigation within the BBQ Island widgets.
     - `SystemAction`: Hardened OS volume / mute / sleep toggles.
   - **Zero Arbitrary Shell Access**: BBQ NEVER invokes `cmd.exe /c`, `powershell -Command`, `sh -c`, or arbitrary child process spawners.

3. **Strict Protocol Validation**:
   - `open_url` enforces strict `http://` and `https://` schemes.
   - Dangerous schemes such as `javascript:`, `vbscript:`, `file:`, `data:`, and `ms-msdt:` are unconditionally rejected.

4. **Explicit User Execution**:
   - Focus, hover, or search ranking NEVER triggers an action automatically.
   - Execution strictly requires an explicit, deliberate user action (`Enter` keypress or explicit pointer click).

5. **Conflict Isolation Without Escalation**:
   - If a global hotkey cannot be registered (e.g. conflict with an existing OS shortcut), BBQ does not attempt aggressive override, privilege elevation, or hook injection.
   - It gracefully reports a conflict event and runs in a degraded state without disrupting other applications.
