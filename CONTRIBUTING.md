# Contributing to BBQ

Thank you for your interest in contributing to BBQ! This guide outlines the development standards, architectural boundaries, and workflow.

---

## Architectural Non-Negotiables

1. **No Unnecessary Polling**: Do not introduce `setInterval` loops or high-frequency polling tasks. Services must be event-driven or sleep when inactive.
2. **Strict Platform Abstraction**: Never scatter `#[cfg(target_os = ...)]` or `if (platform === 'win32')` across application logic or UI code. Platform-specific logic belongs exclusively in `crates/platform`.
3. **Privacy & Local-First**: BBQ operates offline and locally. Never transmit telemetry or user content over the network.
4. **Resilient Failure Boundaries**: A failure in one service (e.g. Media) must never take down the app.
5. **No PII Logging**: Sensitive data (clipboard contents, notes, file paths) must NEVER be logged via `tracing`.

---

## Development Workflow

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Rust stable toolchain with `clippy` and `rustfmt`

### Setup

```bash
git clone https://github.com/BBQ/BBQ.git
cd BBQ
pnpm install
```

### Pre-commit Verification

Before submitting a Pull Request, all automated checks must pass:

```bash
# Rust checks
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
cargo fmt --all -- --check

# Frontend checks
pnpm typecheck
pnpm build
```

---

## Pull Request Guidelines

- Ensure your branch is up to date with `main`.
- Include unit/integration tests for any new functionality.
- Update relevant documentation in `docs/`.
- Ensure all CI checks pass.
