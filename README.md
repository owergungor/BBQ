# BBQ

[![CI](https://github.com/owergungor/BBQ/actions/workflows/ci.yml/badge.svg)](https://github.com/owergungor/BBQ/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/owergungor/BBQ?include_prereleases&sort=semver)](https://github.com/owergungor/BBQ/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> A lightweight desktop island for quick access to your apps, media, files, clipboard, timers, and system tools.

BBQ brings the ambient, reactive ergonomics of a dynamic island to your desktop. Anchored at the top of your display, it rests in a compact pill and expands into a productivity command surface on demand.

---

## Features

- **Launcher**: Fast application and workspace search with pinned favorites.
- **Clipboard History**: Privacy-first clipboard history with sensitive content masking.
- **Media Controls**: Native now-playing HUD and transport controls.
- **Drop Shelf**: Drag-and-drop staging area for fast file operations.
- **Timers**: Focus countdown, stopwatch, and Pomodoro modes.
- **System Monitor**: Audio, battery, and system status indicators.
- **Customizable Island**: Adjustable dimensions, compact mode, and screen positioning.
- **Themes & Transparency**: Dark, light, and system themes with custom accent colors.
- **Auto Update**: Integrated update checks and release notifications.
- **Privacy First**: Fully offline, zero telemetry, local-first SQLite storage.
- **Cross-Platform**: Truthful native integrations across Windows, macOS, and Linux.

---

## Platforms

BBQ supports:

- **Windows x64** (Windows 10 / 11)
- **macOS Apple Silicon** (macOS 12+)
- **Linux** (X11 & Wayland)

Pre-built binaries are available from [GitHub Releases](https://github.com/owergungor/BBQ/releases/latest).

### Standard Artifacts

- `win-x64-setup.exe` - Windows installer
- `win-x64.zip` - Windows portable package
- `mac-arm64.dmg` - macOS disk image
- `mac-arm64.app.zip` - macOS standalone app archive

---

## Quick Start

Download the installer or archive for your platform from the [latest release](https://github.com/owergungor/BBQ/releases/latest).

To run from source:

```bash
pnpm install
pnpm dev
```

---

## Development

Built with Tauri, Rust, React, TypeScript, and SQLite.

### Commands

```bash
# Install dependencies
pnpm install

# Run desktop app in development
pnpm dev

# Build production frontend
pnpm build

# Run automated tests
pnpm test
```

For platform prerequisites and detailed setup instructions, see the [Development Guide](docs/DEVELOPMENT.md).

---

## Project Links

- [Releases](https://github.com/owergungor/BBQ/releases)
- [Issues](https://github.com/owergungor/BBQ/issues)
- [Architecture](docs/ARCHITECTURE.md)
- [Platform Support](docs/PLATFORM_SUPPORT.md)
- [Development Guide](docs/DEVELOPMENT.md)

---

## License

Released under the [MIT License](LICENSE).
