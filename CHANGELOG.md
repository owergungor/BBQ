# Changelog

## [2.6.0] - 2026-10-07

### Added
- Native SVG download icon (downward-pointing arrow + tray) for all download launcher items.
- Custom theme-compatible dropdown menus (`ThemeSelect`) for Island Position and Auto Update with keyboard navigation and boundary collision detection.
- Explicit fully opaque transparency option (0% transparency / 100% opacity) with solid theme surface rendering (`data-opaque="true"`).
- Context-aware right-click menu actions for active media (Play/Pause, Next Track), running timers (Pause/Resume), and drop shelf items (Clear Drop Shelf).
- Automated regression scanner ensuring 100% English UI and zero user-facing Turkish characters.

### Improved
- Island compact width horizontal symmetrical centering relative to display bounds across all supported widths [180, 640].
- Streamlined Compact Width and Compact Height range controls to eliminate horizontal overflow in settings.
- Modernized context menu layout with v2.6 badge, clear action hierarchy, and seamless dark/light theme integration.
- Polished notification and timer display strings to natural, concise English.

## [2.0.0] - 2026-09-26

### Added
- Official General Availability (GA) release of BBQ desktop productivity island.
- Cross-platform support across Windows 10/11, macOS 12+, and Linux (X11 & Wayland).
- Full suite of 9 HUD widgets: Drop Shelf, File Workspace, Clipboard, Media, System, Quick Launcher, Timer/Pomodoro, Reminders, and Settings.
- Truthful platform capability model with graceful degradation for compositor-dependent or permission-restricted environments.
- Comprehensive privacy-first diagnostics export tool with zero sensitive data leakage.
- Strict Content Security Policy (CSP) and modular Tauri IPC command handlers.

### Improved
- Memory working set bounded to <= 60 MB RAM (typically ~46 MB) with 0% idle CPU utilization.
- Zero-polling architecture eliminating all periodic intervals in favor of native push event streams.
- Database recovery and quarantine pipeline for SQLite WAL reliability.
- WCAG 2.1 AA accessibility contrast and screen-reader status announcements across all widgets.

---

## [1.2.0] - 2026-09-15

### Added
- Theme Switcher
- Custom Accent Color Picker
- 11 System Accent Colors
- Custom Hotkey Recorder
- Custom Timer Presets
- Launcher 2x2 layout
- Mouse wheel tab navigation
- Compact size sliders
- Modern switch controls

### Improved
- Timer mode switching
- Hover geometry
- Interaction handling
- Launcher layout
- Theme/accent system
- Settings UI
- persistence

### Fixed
- Timer auto-start on mode switch
- Hotkey recorder Ctrl+Space limitation
- Launcher overflow
- Settings persistence
- Welcome/onboarding restart regression
- Custom accent color loss
- hover jitter
- outside-click interaction

---

## [1.0.0] - 2026-09-13

### Added
- Initial production release of BBQ desktop productivity island.
- Frameless ambient window with hardware-accelerated transitions.
- Core widget suite: Launcher, Timer, Reminders, File Workspace, Media Controls, Clipboard, and Settings.
- Local SQLite database persistence (WAL mode) and native OS platform abstractions.
