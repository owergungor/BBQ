---
name: bbq-test
description: >-
  Executes the full BBQ test, typecheck, lint, and build verification pipeline across frontend and Rust crates.
---

# BBQ Test Skill

Use this skill to validate changes before creating git commits or opening pull requests.

## Full Verification Pipeline

### 1. Frontend Verification
Run in workspace root:
```bash
# Typecheck packages and desktop app
pnpm typecheck

# Run Node test runner across all desktop tests
pnpm test

# Build production bundle
pnpm build
```

### 2. Rust Workspace Verification
```bash
# Format check
cargo fmt --all -- --check

# Clippy check (denying warnings)
cargo clippy --workspace --all-targets --all-features -- -D warnings

# Run all workspace unit and integration tests
cargo test --workspace
```

### 3. Toolchain & Linker Handling
- **Windows Linker Configuration**: If `cargo test --workspace` fails due to MSVC linker environment discrepancies on Windows, use:
  ```bash
  RUSTFLAGS="-C link-self-contained=yes" cargo test --workspace
  ```
- **Linux Headless Environment**: On Linux systems lacking WebKit2GTK dev headers, the core and service crates can be tested directly with:
  ```bash
  cargo test -p bbq-core -p bbq-storage -p bbq-platform -p bbq-services
  ```
