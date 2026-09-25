---
name: bbq-audit
description: >-
  Audits BBQ codebase for polling violations (setInterval, requestAnimationFrame, recursive setTimeout),
  resource leaks, memory/CPU budget regressions, and architectural invariant violations.
---

# BBQ Audit Skill

Use this skill whenever verifying that a feature, milestone, or refactoring complies with BBQ's strict zero-polling, low-resource performance budgets.

## Audit Workflow

### 1. Polling Search
Run searches over the production frontend code (`apps/desktop/src/`, ignoring tests):

```bash
# Check for setInterval in production
grep -rn "setInterval" apps/desktop/src/ | grep -v "\.test\." | grep -v "__tests__"

# Check for requestAnimationFrame in production
grep -rn "requestAnimationFrame" apps/desktop/src/ | grep -v "\.test\." | grep -v "__tests__"

# Check for recursive setTimeout patterns
grep -rn "setTimeout" apps/desktop/src/ | grep -v "\.test\." | grep -v "__tests__"
```

**Verification Rule**:
- `setInterval`: Must be 0 in production logic (comments stating "NO setInterval" are allowed).
- `requestAnimationFrame`: Must be 0 in production continuous loops.
- `recursive setTimeout`: Must be 0 in production polling. Only wall-clock countdown ticks and one-shot debounce timers are permitted.

### 2. Rust Invariant Audit
Run cargo clippy with strict warnings:
```bash
cargo clippy --workspace --all-targets --all-features -- -D warnings
```
Check that no `unwrap()` or `expect()` calls have been introduced in production crate logic outside of tests.

### 3. Memory & CPU Checklist
- Ensure background listeners are torn down when components or services terminate.
- Verify that SQLite auto-vacuum and WAL checkpoints are preserved.
- Ensure that batch inputs are bounded by constants (`MAX_DROP_ITEMS`, `MAX_CLIPBOARD_MAX_ENTRIES`).
