# BBQ Security & Integrity Rules

## 1. Input Sanitization & CLI Defense
- Never execute external strings, user inputs, or CLI arguments via a shell interpreter (`sh -c`, `bash -c`, `cmd.exe /c`, `powershell`).
- For single-instance CLI forwarding, reject any argument beginning with `-` (flags) or arbitrary URL schemes (`http://`, `https://`, `ftp://`).
- Always check that filesystem paths exist and canonicalize them using safe stdlib APIs before ingestion.
- Enforce strict bounded capacity limits (`MAX_DROP_ITEMS = 50`, `MAX_CLIPBOARD_MAX_ENTRIES = 100`).

## 2. Secrets & Privacy Guardrails
- **Never Commit Secrets**: Never commit API keys, GitHub personal access tokens, private keys, or passwords.
- **Privacy in Logs**: Do not log full sensitive user file paths, clipboard content, or keystroke data. Log only sanitized summaries, counts, or entity IDs.
- **Sensitive Clipboard Detection**: Preserve sensitive clipboard heuristics (e.g. password manager entry detection, credit card format detection) to avoid persisting private credentials to SQLite history.

## 3. Generated & Build Files
- Never edit build artifacts (`dist/`, `target/`, `.log`, `.pdb`, `node_modules/`) as source code. All changes must occur in actual source files.
