# BBQ Sustainability & Engineering Discipline

## 1. Small, Focused Modifications
- Prefer surgical, well-understood, easily reviewable edits over sweeping rewrites or massive refactors.
- Do not rewrite working subsystems simply because an alternative syntax or paradigm seems marginally more convenient.
- Avoid introducing technical debt or "temporary workarounds" that bypass architecture invariants.

## 2. No Duplicate Logic
- Before implementing any utility or data transformation, search the codebase (`grep_search`) to check if a canonical helper already exists.
- Keep domain boundaries singular: for example, Drop Shelf path handling belongs in `bbq-services::drop`, and file workspace indexing belongs in `bbq-services::file`.

## 3. Public API & Contract Stability
- Changes to IPC event payloads (`BbqEvent`), command signatures, or database schemas must be carefully analyzed across all callers before editing.
- Always check usages in both Rust and TypeScript (`packages/types`, `apps/desktop/src/ipc/`) when touching shared data contracts.
- Flag any potential breaking change clearly in commit messages and documentation.
