# BBQ Testing Requirements

## 1. Post-Modification Verification
After every non-trivial change, execute the relevant verification pipeline:
- **Frontend**:
  - `pnpm --filter @bbq/desktop test`
  - `pnpm --filter @bbq/desktop typecheck`
  - `pnpm --filter @bbq/desktop build`
- **Rust**:
  - `cargo fmt --all -- --check`
  - `cargo clippy --workspace --all-targets --all-features -- -D warnings`
  - `cargo test --workspace` (or crate-specific tests if platform headers restrict certain crates).

## 2. Invariant & Regression Guard Testing
- Every bug fix or new behavior must be accompanied by a targeted unit or integration test.
- Write tests that exercise actual implementation logic rather than merely asserting on hardcoded constants.
- **Never Weaken Existing Tests**: Never delete, comment out, or relax existing test assertions simply to make a failing suite pass. If a test fails, diagnose and fix the underlying implementation.

## 3. Platform-Independent Verification
- Use `bbq-platform::MockPlatform` and mock service traits to write cross-platform test suites that can execute predictably on any host OS or in headless CI runners.
