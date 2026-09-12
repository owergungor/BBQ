## Description
Briefly describe the change and the rationale behind it.

## Architectural Boundaries Check
- [ ] No direct OS API calls in the frontend.
- [ ] Platform-specific code is isolated in `crates/platform`.
- [ ] No polling loops (`setInterval` / continuous sleep loops).
- [ ] No sensitive user data is logged.
- [ ] Unit and integration tests added where appropriate.

## Testing & Verification
Describe how this was tested (OS, commands run, UI verification).
