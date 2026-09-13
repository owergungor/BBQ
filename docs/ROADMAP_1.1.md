# BBQ 1.1 Technical Roadmap & Cross-Platform Specification

> **Target Version**: BBQ 1.1  
> **Status**: APPROVED PLANNING SPECIFICATION  
> **Guiding Principle**: Maintain zero continuous polling, zero RAF loops, zero setInterval, bounded memory/CPU budgets, and strict security across all platforms.

---

## 1. Priority Hierarchy

Development in the 1.1 cycle follows strict prioritization:

1. **P0 — Cross-Platform Native Runtime**: Elevating macOS and Linux from trait-conforming builds to physical runtime verification with native OS bindings.
2. **P1 — Core Island UX & Accessibility**: Enhanced fluid transitions, micro-animations, keyboard navigation, and focus ergonomics.
3. **P2 — Modular Widget Architecture**: Formalized widget lifecycle, capability contracts, and expanded productivity widgets.
4. **P3 — Personalization & Customization**: Deep appearance controls, dimension scaling, monitor affinity, and hotkey rebinding.
5. **P4 — Sandboxed Extension Architecture**: Secure, declarative third-party widget capabilities without arbitrary code execution.

---

## 2. Platform Architecture & Deep Dive

### A. macOS Native Runtime (P0)

To transition macOS from CLI/AppleScript bridges to a first-class native desktop experience:

1. **Display Geometry & Multi-Monitor**:
   - **API**: `CoreGraphics` (`CGGetActiveDisplayList`, `CGDisplayBounds`, `CGDisplayPixelsWide`, `CGDisplayPixelsHigh`).
   - **Retina Scaling**: Calculate backing scale factor via `NSScreen.backingScaleFactor` (1.0 vs 2.0).
   - **Notch & Menu Bar Awareness**: Query `NSScreen.safeAreaInsets` and `NSStatusBar.systemStatusBar.thickness` to guarantee notch-safe top-center anchoring.
   - **Negative Coordinates**: Support multi-monitor coordinate virtual spaces where secondary monitors reside left or above the primary display.
2. **Global Hotkey Registration**:
   - **API**: Carbon Event Hotkey (`RegisterEventHotKey`) or modern `NSEvent.addGlobalMonitorForMatchingMasks`.
   - **Security / Permissions**: Detect and prompt for macOS Accessibility permissions (`AXIsProcessTrustedWithOptions`) only when hotkey registration fails.
3. **Media Session Integration**:
   - **API**: MediaRemote framework or `MPNowPlayingInfoCenter` via Objective-C runtime bridge.
   - **Event-Driven**: Listen for playback status notifications rather than polling player processes.
4. **Clipboard Integration**:
   - **API**: AppKit `NSPasteboard`.
   - **Lazy Interaction Model**: Because macOS pasteboard does not emit global push events, query `NSPasteboard.changeCount` strictly upon island hover or hotkey invocation.
5. **Autostart**:
   - **API**: `SMAppService.mainApp` (macOS 13+) or LaunchAgents plist (`~/Library/LaunchAgents/com.bbq.desktop.plist`).

---

### B. Linux X11 Native Runtime (P0)

1. **Display Geometry**:
   - **API**: `X11` / `XRandR` (`XRRGetScreenResourcesCurrent`, `XRRGetOutputInfo`, `XRRGetCrtcInfo`).
   - **Multi-Monitor**: Accurately track virtual desktop viewports, negative X/Y screen offsets, and primary display monitors.
   - **DPI**: Calculate DPI from millimeter physical dimensions (`XRRGetOutputInfo` mm_width/mm_height).
2. **Global Hotkey**:
   - **API**: `XGrabKey` on the root window for configured keycode and modifier masks (`Mod1Mask`, `ControlMask`, `Mod4Mask`).
   - **Event Loop**: Dedicated Tokio blocking task processing `XNextEvent` / `KeyPress`.
3. **Media Control (MPRIS over D-Bus)**:
   - **API**: Direct `zbus` asynchronous D-Bus connection.
   - **Signals**: Subscribe to `org.freedesktop.DBus.Properties.PropertiesChanged` on `org.mpris.MediaPlayer2.Player`.
   - **Zero Polling**: Complete elimination of external `playerctl` process spawns.
4. **Clipboard (Event-Driven)**:
   - **API**: XFixes extension (`XFixesSelectSelectionInput` for `CLIPBOARD`).
   - **Push Notifications**: Receive `XFixesSelectionNotifyEvent` when another window asserts clipboard ownership.
5. **Autostart**:
   - Standard XDG Desktop Entry (`~/.config/autostart/com.bbq.desktop.desktop`).

---

### C. Linux Wayland Capability Architecture (P0)

Wayland's security architecture restricts client applications from global surveillance, arbitrary window positioning, and unprivileged hotkey grabbing. BBQ will not use fragile workarounds.

1. **Window Positioning & Anchoring**:
   - **wlroots Compositors (Sway, Hyprland, Wayfire)**: Implement `zwlr_layer_shell_v1` to anchor the island surface at `ZWLR_LAYER_SHELL_V1_LAYER_TOP` with zero margins.
   - **GNOME (Mutter) & KDE (KWin)**: Standard top-level floating window with client geometry hints. Where absolute placement is unsupported, declare `NOT_SUPPORTED` and fall back to centered window.
2. **Global Hotkeys**:
   - **API**: XDG Desktop Portal `org.freedesktop.portal.GlobalShortcuts` via `zbus`.
   - If portal is absent or rejected by the user, report `NOT_SUPPORTED` and rely on window focus shortcuts.
3. **Clipboard**:
   - Subject to compositor permissions. Support `wlr-data-control` where available; gracefully degrade to internal clipboard history on restricted compositors.

---

### D. Island UX & Visual Polish (P1)

1. **Zero-Polling Fluid Dynamics**:
   - CSS transition curves (`cubic-bezier(0.16, 1, 0.3, 1)`) with GPU-accelerated compositing (`transform`, `opacity`).
   - Strictly 0 `setInterval` and 0 `requestAnimationFrame` loops.
2. **Focus Management & Accessibility**:
   - Robust tab traversal (`ArrowLeft` / `ArrowRight` between widgets, `Tab` within widgets).
   - High-contrast visible focus rings (`:focus-visible`).
   - Comprehensive `aria-live` announcements for timer completions and system alerts.
   - Automatic `prefers-reduced-motion` compliance without layout shift.
3. **Adaptive Island Dimensions**:
   - Compact Mode: 240px x 40px resting state.
   - Quick Action Mode: 360px x 56px input state.
   - Full Expanded Mode: Up to 560px x 420px dashboard state.

---

### E. Modular Widget System (P2)

In 1.1, all widgets will implement a standardized, strictly isolated lifecycle contract:

```typescript
export interface WidgetLifecycle<TState = unknown> {
  readonly id: string;
  readonly metadata: WidgetMetadata;
  readonly requiredCapabilities: CapabilityRequirement[];
  
  // Lifecycle Hooks
  onMount?(): void;
  onActivate?(): void;
  onDeactivate?(): void;
  onUnmount?(): void;
  
  // State & Boundaries
  getState(): TState;
  resetState(): void;
}
```

Planned Widgets for 1.1:
1. **Stopwatch & Pomodoro Enhancements**: Interval presets, cycle auto-advance, sound notification controls.
2. **Calendar Glance**: Local RFC 5545 / system calendar preview without cloud sync.
3. **Weather Glance**: Local cached weather via user-provided API key or system service (opt-in).
4. **Network & System Telemetry**: CPU load, memory utilization, battery health, connection status.

---

### F. Customization & Personalization (P3)

1. **Geometry & Position**:
   - Custom horizontal alignment (Top-Left, Top-Center, Top-Right).
   - Custom margin offsets (Y-offset from top edge, notch padding).
   - Preferred display selector for multi-monitor setups.
2. **Appearance Personalization**:
   - Corner radius adjustment (12px to 28px).
   - Glassmorphism opacity and blur intensity.
   - Custom accent color themes with automatic contrast validation (WCAG AA).
3. **Indicator Reordering**:
   - Drag-and-drop or keyboard reordering of compact status icons.
   - Per-widget disable toggles to completely unmount unused features.

---

### G. Sandboxed Plugin Architecture (P4)

Long-term design for secure third-party widgets:

1. **Security Invariants**:
   - Arbitrary native binary execution is **strictly forbidden**.
   - No filesystem access outside designated sandbox directories.
   - No direct network access without explicit user consent prompt.
2. **Execution Engine**:
   - Declarative UI manifest (JSON schema) rendered natively by BBQ components, or
   - Sandboxed Web Worker / QuickJS WASM engine with strictly typed IPC capability bridges.
3. **Permission Grants**:
   - Granular capability declarations: `clipboard:read`, `notifications:emit`, `media:control`.

---

## 3. Feature Breakdown Matrix

| Feature | Platform | Priority | Dependencies | Technical Approach | Risk | Test Strategy | Complexity | Target |
|---|:---:|:---:|---|---|:---:|---|:---:|:---:|
| **macOS Native Hotkey** | macOS | P0 | Carbon / Cocoa | `RegisterEventHotKey` + Carbon handler | Medium (Permissions) | Mocked Carbon + macOS CI | Medium | 1.1-M1 |
| **macOS Media Integration** | macOS | P0 | CoreMedia / NowPlaying | Native Objective-C runtime bridge | Low | Synthetic session events | Medium | 1.1-M1 |
| **macOS CoreGraphics Display** | macOS | P0 | `CoreGraphics.framework` | `CGGetActiveDisplayList` + safe area | Low | Coordinate boundary tests | Low | 1.1-M1 |
| **Linux X11 XGrabKey** | Linux X11 | P0 | `X11`, `x11-dl` | `XGrabKey` on root window | Medium (Key conflict) | Xvfb headless tests | Medium | 1.1-M2 |
| **Linux X11 XRandR Multi-Mon** | Linux X11 | P0 | `X11`, `Xrandr` | XRandR CRT / Output enumeration | Low | Virtual multi-head test | Medium | 1.1-M2 |
| **Linux X11 MPRIS Native D-Bus** | Linux X11 | P0 | `zbus` | Asynchronous D-Bus client | Low | DBus mock player daemon | Medium | 1.1-M2 |
| **Wayland Layer-Shell Protocol** | Linux Wayland | P0 | `wlr-layer-shell` | Wayland client layer shell protocol | High (Compositor divergence) | Headless Sway runner | High | 1.1-M3 |
| **Wayland Global Shortcuts** | Linux Wayland | P0 | `zbus`, XDG Portal | Desktop portal shortcuts API | Medium (Portal presence) | Portal mock response test | Medium | 1.1-M3 |
| **Accessible Focus Rings** | All | P1 | CSS Design Tokens | Universal `:focus-visible` styling | Low | Visual regression / DOM tests | Low | 1.1-M4 |
| **Widget Isolation Lifecycle** | All | P2 | Typescript Core | Strict `WidgetLifecycle` interface | Low | State churn & leak tests | Medium | 1.1-M5 |
| **Calendar Glance Widget** | All | P2 | Storage, iCal parser | Bounded local SQLite cache | Low | RFC 5545 parser unit tests | Medium | 1.1-M5 |
| **System Telemetry Widget** | All | P2 | `sysinfo` / OS APIs | Lazy on-demand polling on open | Low (CPU impact if loop) | Idle CPU benchmark | Medium | 1.1-M5 |
| **Monitor & Position Customizer** | All | P3 | Settings & Window Svc | Display selector & coordinate math | Medium (Multi-DPI shift) | Geometry matrix tests | Medium | 1.1-M6 |
| **Sandboxed Plugin Manifest** | All | P4 | JSON Schema | Declarative schema validation | Medium (Sandbox escape) | Fuzzing & permission tests | High | 1.1-M7 |

---

## 4. Milestone Schedule

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1.1-M1      │     │  1.1-M2      │     │  1.1-M3      │     │  1.1-M4      │     │  1.1-M5      │
│  macOS Native│ ──> │  Linux X11   │ ──> │  Linux Wayland│──> │  Island UX & │ ──> │  Modular     │
│  Runtime     │     │  Native      │     │  Portals     │     │  A11y Polish │     │  Widgets     │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

- **Milestone 1 (1.1-M1)**: macOS Native Runtime & Physical Hardware Sign-off.
- **Milestone 2 (1.1-M2)**: Linux X11 Native Runtime (`XGrabKey`, `XRandR`, `zbus` MPRIS).
- **Milestone 3 (1.1-M3)**: Linux Wayland Capability Architecture (Layer-shell, Desktop Portals).
- **Milestone 4 (1.1-M4)**: Island UX Polish, keyboard navigation, high-contrast themes.
- **Milestone 5 (1.1-M5)**: Widget Lifecycle Framework, System & Calendar Widgets.
- **Milestone 6 (1.1-M6)**: Geometry, Monitor & Position Personalization.
- **Milestone 7 (1.1-M7)**: Declarative Plugin Sandbox Specification & Prototype.

---

## 5. Technical Risk Register

| ID | Risk | Severity | Likelihood | Mitigation Strategy |
|---|---|:---:|:---:|---|
| **R-01** | Wayland compositor restricts window positioning | **High** | **High** | Do not fake success; declare `COMPOSITOR-DEPENDENT` and gracefully position as standard top-level window. |
| **R-02** | macOS accessibility permission denied for hotkeys | **Medium** | **Medium** | Graceful fallback banner directing user to System Settings; enable in-app hotkeys without crashing. |
| **R-03** | System telemetry widget polling drains battery | **High** | **Medium** | Zero background polling: telemetry is refreshed **strictly** when the widget expands and suspended immediately on collapse. |
| **R-04** | Multi-monitor DPI mismatch causes coordinate jump | **Medium** | **Medium** | Normalized physical vs logical coordinate translation layer in `crates/core/src/geometry.rs`. |
| **R-05** | Third-party plugin introduces remote security hazard | **Critical**| **Low** | Strict capability permissions, zero native execution, declarative JSON UI schemas only. |
