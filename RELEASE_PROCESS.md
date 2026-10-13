# BBQ Release Process & Auto-Updater Security Architecture

This document defines the release engineering standards, cryptographic signing lifecycle, and updater artifact contracts for **BBQ Desktop (v3.0+)**.

---

## 1. Cryptographic Security & Signing Architecture

BBQ separates platform-level distribution signing from application-level update verification:

| Signing Layer | Technology | Purpose | OS Gatekeeper / SmartScreen Impact |
| :--- | :--- | :--- | :--- |
| **In-App Updater Verification** | **Minisign (Ed25519)** | Verifies downloaded update archive integrity against the embedded public key before extraction or execution. | **None.** Operates strictly inside the application sandbox. Does not suppress OS warnings. |
| **macOS Distribution Signing** | **Apple Developer ID & Notarization** | Signs `.app` and `.dmg` bundles with Hardened Runtime and submits them to Apple Notary Service. | **Required** to eliminate macOS Gatekeeper warnings on user machines. |
| **Windows Authenticode** | **X.509 Code Signing Certificate** | Signs setup executables and DLLs. | Eliminates Windows Defender SmartScreen reputation warnings. |

> [!IMPORTANT]
> **Tauri updater signing is orthogonal to Apple Developer ID and Windows Authenticode.**
> Minisign signatures guarantee that the update payload originates from the trusted repository owner, but they do NOT remove macOS Gatekeeper warnings. Gatekeeper behavior depends solely on Apple Developer ID notarization.

---

## 2. In-App Updater Prerequisite: Generating the Signing Keypair

If a release signing keypair has not yet been generated for this repository, the repository owner must generate it **locally on a secure workstation**.

> [!CAUTION]
> **Never commit private keys or private key passwords to Git.**
> **Never paste private keys into AI assistants, chat channels, or public issue trackers.**

### Generation Command
Run the official Tauri CLI generator locally:
```bash
pnpm --filter @bbq/desktop tauri signer generate -w ~/.tauri/bbq.key
```

When prompted, enter a strong password. This will output:
1. **Private Key**: Saved to `~/.tauri/bbq.key` (or your chosen path).
2. **Public Key**: Displayed in the terminal output (e.g. `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDExM...`).

### Configuring the Public Key in the Application
The active public key is configured in [`apps/desktop/src-tauri/tauri.conf.json`](./apps/desktop/src-tauri/tauri.conf.json):
```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY1NTBFN0QyQ0Q2MTgzOApSV1E0R05Zc2ZRNVZCa1R4WDVMSGFOckQ5ZDZQTkcxSlRsRWhTc2NKdmtXdkJHZnF0d0pKR0F3Mwo=",
    "endpoints": [
      "https://github.com/owergungor/BBQ/releases/latest/download/latest.json"
    ]
  }
}
```

### Configuring GitHub Repository Secrets
Under **GitHub Repository Settings > Secrets and variables > Actions**:
- `TAURI_SIGNING_PRIVATE_KEY`: Content of the Minisign private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password for the private key (if set).

> [!NOTE]
> Once configured in `tauri.conf.json` and GitHub Secrets, the keypair must **remain stable** across future releases. Rotating or losing the private key prevents existing installations from verifying future updates.

---

## 3. Artifact Contracts: Distribution vs Updater Bundles

BBQ produces two distinct classes of release assets:

### A. Distribution Installers (For Initial User Installation)
- **Windows x64**: `BBQ-win-x64-setup.exe` (NSIS installer) & `BBQ-win-x64.zip` (Portable binary).
- **macOS ARM64**: `BBQ-mac-arm64.dmg` (Drag-to-Applications disk image) & `BBQ-mac-arm64.app.zip`.
- **Linux x86_64**: `BBQ-linux-x86_64.deb` & `.AppImage` (when built).

### B. In-App Updater Bundles (Consumed by `tauri-plugin-updater`)
- **Windows x64 (`windows-x86_64`)**: `BBQ-win-x64-setup.exe` (or `.nsis.zip`) with matching detached signature `BBQ-win-x64-setup.exe.sig`.
- **macOS ARM64 (`darwin-aarch64`)**: `BBQ-mac-arm64.app.tar.gz` with matching detached signature `BBQ-mac-arm64.app.tar.gz.sig`.
- **Update Manifest**: `latest.json` containing version, release notes, pub_date, and platform entries matching genuine staged signatures.

---

## 4. Fail-Closed Release Safeguards in CI

The CI workflow ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) enforces strict fail-closed security gates:

1. **Explicit Build Distinctions**:
   - **Development / PR builds**: Run with `--no-sign` when credentials are absent, allowing contributors to run tests and verification without release secrets.
   - **Release builds (`BBQ_RELEASE_BUILD=true`)**: Triggered by version tags (`v*`) or manual dispatch with a release tag. If `TAURI_SIGNING_PRIVATE_KEY` is missing or empty, **the build fails immediately** (`exit 1`).
2. **Never Publish Unsigned Updater Manifests**:
   - The release job runs `scripts/validate-release-metadata.mjs` with `--strict`.
   - Strict validation verifies that every platform in `latest.json` has a non-empty Minisign signature, HTTPS endpoint, and verified matching asset on disk.
   - If zero signed platforms exist, the release workflow aborts and does not upload `latest.json`.
3. **Matrix Target Truthfulness**:
   - Only platforms genuinely built, signed, and staged by the CI workflow (`windows-x86_64` and `darwin-aarch64`) are advertised in `latest.json`.
   - Linux is not advertised in `latest.json` until Linux release bundles are actively packaged and uploaded by the workflow.

---

## 5. Migration Notice for v2.8 Users

> [!WARNING]
> **Existing BBQ v2.8 installations cannot update in-app to v3.0.**
>
> - The v2.8 binary was released before `tauri-plugin-updater` and Minisign public keys were integrated.
> - An application without an updater plugin runtime cannot inspect release metadata or download updates.
> - **Action Required**: Users running v2.8 must perform a **one-time manual download and installation** of BBQ v3.0 from the GitHub Releases page.
> - Subsequent updates (e.g. v3.0 to v3.1) will update in-app automatically once signed.

---

## 6. Pre-Release Verification Checklist

Before publishing any release tag:
1. Verify `pnpm --filter @bbq/desktop typecheck` passes.
2. Verify `pnpm --filter @bbq/desktop test` passes (all unit and integration tests).
3. Verify `cargo fmt --all -- --check`, `cargo clippy`, and `cargo test --workspace` pass.
4. Ensure `plugins.updater.pubkey` in `tauri.conf.json` matches the `TAURI_SIGNING_PRIVATE_KEY` stored in GitHub Secrets.
5. Verify test metadata generation via `node scripts/generate-update-metadata.mjs` and validation via `node scripts/validate-release-metadata.mjs --strict`.
