# BBQ Development Guide

## Environment Setup

### Required Tools
- [Node.js](https://nodejs.org/) (version 20+)
- [pnpm](https://pnpm.io/) (version 9+)
- [Rust](https://rustup.rs/) (version 1.78+)
  - Components: `rustfmt`, `clippy`

### OS-Specific Setup
- **Windows**: [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) runtime (pre-installed on Windows 10/11) and C++ Build Tools.
- **Linux**: WebKitGTK and development libraries:
  ```bash
  sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```
- **macOS**: Xcode Command Line Tools.

---

## Daily Commands

```bash
# Install dependencies
pnpm install

# Check Rust codebase
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
cargo fmt --all -- --check

# Check TypeScript frontend
pnpm typecheck
pnpm build

# Run BBQ Desktop in development mode
pnpm dev
```
