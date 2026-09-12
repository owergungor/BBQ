# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

---

## Reporting a Vulnerability

BBQ takes user security and privacy seriously. Because BBQ interacts with desktop windowing and OS capabilities, least-privilege security principles are strictly enforced.

If you discover a security vulnerability, please **do not open a public GitHub issue**.

Instead, please submit a report with detailed reproduction steps to:
`security@bbq.app` (or via GitHub Private Vulnerability Reporting).

You will receive an acknowledgment within 48 hours.

---

## Security Tenets

1. **Frontend Sandboxing**: The React frontend does not have direct access to the filesystem, network sockets, or OS APIs. All operations are mediated by strongly typed Tauri IPC commands with strict validation.
2. **Local-First Isolation**: All databases, cache, and configuration remain in sandboxed, OS-standard user application data paths.
3. **No Telemetry / Data Exfiltration**: BBQ collects zero usage telemetry.
