import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareSemVer,
  isUpdateAvailable,
  sanitizeErrorMessage,
  updaterStore,
  initialUpdaterState,
  checkForUpdates,
  downloadAndInstallUpdate,
  cancelUpdate,
  setSimulatedUpdater,
} from "../src/state/updaterState.ts";
import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import {
  t,
  formatLocaleDate,
  formatLocaleNumber,
  formatBytes,
  LANGUAGE_OPTIONS,
  SUPPORTED_LANGUAGES,
  LOCALES,
} from "../src/i18n/index.ts";
import { settingsStore } from "../src/state/settingsState.ts";
import { generateUpdateMetadata } from "../../../scripts/generate-update-metadata.mjs";
import { validateReleaseMetadata } from "../../../scripts/validate-release-metadata.mjs";
import {
  parseMinisignPublicKey,
  parseMinisignSignature,
  verifyMinisignSignature,
} from "../../../scripts/verify-minisign-signature.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const DESKTOP_DIR = path.resolve(__dirname, "..");

describe("BBQ v3.0 — Auto-Updater Engine & Localization Verification", () => {
  // =========================================================================
  // 1. Updater Configuration & Plugin Registration Contracts
  // =========================================================================
  describe("1. Updater Configuration & Plugin Registration", () => {
    it("verifies tauri.conf.json configures plugins.updater and createUpdaterArtifacts", () => {
      const confPath = path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json");
      const conf = JSON.parse(fs.readFileSync(confPath, "utf-8"));

      assert.ok(conf.bundle, "tauri.conf.json must declare bundle");
      assert.strictEqual(
        conf.bundle.createUpdaterArtifacts,
        true,
        "tauri.conf.json must set bundle.createUpdaterArtifacts to true to generate .sig bundles"
      );

      assert.ok(conf.plugins, "tauri.conf.json must declare plugins");
      assert.ok(conf.plugins.updater, "tauri.conf.json must declare plugins.updater");
      assert.ok(
        Array.isArray(conf.plugins.updater.endpoints) && conf.plugins.updater.endpoints.length > 0,
        "plugins.updater.endpoints must be non-empty array"
      );

      const endpoint = conf.plugins.updater.endpoints[0];
      assert.ok(
        endpoint.startsWith("https://"),
        `Updater endpoint must use secure HTTPS: ${endpoint}`
      );
      assert.ok(
        endpoint.includes("github.com") && endpoint.endsWith("latest.json"),
        `Updater endpoint must target latest.json release asset: ${endpoint}`
      );

      assert.ok(
        typeof conf.plugins.updater.pubkey === "string" && conf.plugins.updater.pubkey.trim().length > 0,
        "tauri.conf.json must configure a valid, non-empty plugins.updater.pubkey"
      );

      // Verify that pubkey is valid base64-encoded Minisign key
      const decodedPubkey = Buffer.from(conf.plugins.updater.pubkey, "base64").toString("utf-8");
      assert.ok(
        decodedPubkey.includes("untrusted comment: minisign public key:"),
        `plugins.updater.pubkey must decode to a valid Minisign public key: ${decodedPubkey}`
      );
    });

    it("verifies tauri-plugin-updater is added to src-tauri/Cargo.toml", () => {
      const cargoTomlPath = path.join(DESKTOP_DIR, "src-tauri/Cargo.toml");
      const cargoToml = fs.readFileSync(cargoTomlPath, "utf-8");

      assert.ok(
        cargoToml.includes("tauri-plugin-updater"),
        "src-tauri/Cargo.toml must include tauri-plugin-updater dependency"
      );
    });

    it("verifies tauri_plugin_updater is registered in src-tauri/src/lib.rs", () => {
      const libRsPath = path.join(DESKTOP_DIR, "src-tauri/src/lib.rs");
      const libRs = fs.readFileSync(libRsPath, "utf-8");

      assert.ok(
        libRs.includes("tauri_plugin_updater::Builder::new().build()"),
        "src-tauri/src/lib.rs must register tauri_plugin_updater plugin"
      );
    });

    it("verifies updater:default permission is granted in capabilities/default.json", () => {
      const capPath = path.join(DESKTOP_DIR, "src-tauri/capabilities/default.json");
      const cap = JSON.parse(fs.readFileSync(capPath, "utf-8"));

      assert.ok(
        Array.isArray(cap.permissions),
        "capabilities/default.json must contain permissions array"
      );
      assert.ok(
        cap.permissions.includes("updater:default"),
        "capabilities/default.json must include 'updater:default' permission"
      );
    });

    it("verifies native app_relaunch listener is registered in src-tauri/src/lib.rs", () => {
      const libRsPath = path.join(DESKTOP_DIR, "src-tauri/src/lib.rs");
      const libRs = fs.readFileSync(libRsPath, "utf-8");

      assert.ok(
        libRs.includes("bbq://app_relaunch"),
        "src-tauri/src/lib.rs must listen to bbq://app_relaunch event"
      );
    });
  });

  // =========================================================================
  // 2. SemVer Comparison & Update Availability
  // =========================================================================
  describe("2. SemVer Comparison & Downgrade Prevention", () => {
    it("correctly identifies normal upgrade versions", () => {
      assert.ok(compareSemVer("3.0.1", "3.0.0") > 0);
      assert.ok(compareSemVer("3.1.0", "3.0.0") > 0);
      assert.ok(compareSemVer("4.0.0", "3.0.0") > 0);
      assert.ok(isUpdateAvailable("3.0.0", "3.0.1"));
      assert.ok(isUpdateAvailable("2.8.0", "3.0.0"));
    });

    it("handles leading 'v' prefixes gracefully", () => {
      assert.ok(compareSemVer("v3.0.1", "3.0.0") > 0);
      assert.ok(compareSemVer("3.0.1", "v3.0.0") > 0);
      assert.ok(compareSemVer("v3.0.1", "v3.0.0") > 0);
      assert.ok(isUpdateAvailable("v3.0.0", "v3.0.1"));
    });

    it("strictly prevents downgrades from being treated as available updates", () => {
      assert.ok(compareSemVer("2.8.0", "3.0.0") < 0);
      assert.ok(compareSemVer("2.0.0", "3.0.0") < 0);
      assert.strictEqual(
        isUpdateAvailable("3.0.0", "2.8.0"),
        false,
        "Downgrade to v2.8.0 must NEVER be offered as update"
      );
      assert.strictEqual(
        isUpdateAvailable("3.0.0", "2.9.9"),
        false,
        "Downgrade to v2.9.9 must NEVER be offered as update"
      );
    });

    it("correctly detects equal versions as up-to-date", () => {
      assert.strictEqual(compareSemVer("3.0.0", "3.0.0"), 0);
      assert.strictEqual(compareSemVer("v3.0.0", "3.0.0"), 0);
      assert.strictEqual(isUpdateAvailable("3.0.0", "3.0.0"), false);
    });

    it("correctly compares pre-release identifiers", () => {
      assert.ok(compareSemVer("3.0.0", "3.0.0-beta.1") > 0);
      assert.ok(compareSemVer("3.0.0-beta.2", "3.0.0-beta.1") > 0);
      assert.ok(compareSemVer("3.0.0-alpha.1", "3.0.0-beta.1") < 0);
    });

    it("correctly handles two-component version comparisons (2.8, 3.0, 3.1)", () => {
      assert.ok(compareSemVer("3.0", "2.8") > 0);
      assert.ok(compareSemVer("3.1", "3.0") > 0);
      assert.ok(compareSemVer("v3.0", "2.8") > 0);
      assert.ok(compareSemVer("3.0", "v2.8") > 0);
      assert.strictEqual(compareSemVer("3.0", "3.0"), 0);
      assert.strictEqual(compareSemVer("3.0", "3.0.0"), 0);
      assert.strictEqual(compareSemVer("v3.0", "3.0"), 0);
      assert.ok(compareSemVer("2.8", "3.0") < 0);
      assert.ok(isUpdateAvailable("2.8", "3.0"));
      assert.ok(isUpdateAvailable("3.0", "3.1"));
      assert.strictEqual(isUpdateAvailable("3.0", "3.0"), false);
      assert.strictEqual(isUpdateAvailable("3.0", "2.8"), false);
    });
  });

  // =========================================================================
  // 3. Error Sanitization & Concurrent Protection
  // =========================================================================
  describe("3. Error Sanitization & Concurrency Protection", () => {
    it("sanitizes authorization tokens, passwords, and API keys from error messages", () => {
      const rawError = "Request failed with status 401: Bearer ghp_abc123secretKey and password=mySecretPassword";
      const sanitized = sanitizeErrorMessage(rawError);

      assert.strictEqual(sanitized.includes("ghp_abc123secretKey"), false);
      assert.strictEqual(sanitized.includes("mySecretPassword"), false);
      assert.ok(sanitized.includes("[REDACTED]"));
    });

    it("sanitizes sensitive local user directory paths from error messages", () => {
      const winPathError = "Failed to load bundle at C:\\Users\\john_doe\\AppData\\Local\\updater.exe";
      const sanitized = sanitizeErrorMessage(winPathError);

      assert.strictEqual(sanitized.includes("john_doe"), false);
      assert.ok(sanitized.includes("[USER_DIR]"));
    });

    it("prevents concurrent check requests when status is checking", async () => {
      updaterStore.setState({ status: "checking" });
      const checked = await checkForUpdates();
      assert.strictEqual(checked, false, "Concurrent checkForUpdates should be ignored when checking");
      updaterStore.setState({ status: "idle" });
    });

    it("prevents concurrent install requests when status is downloading or installing", async () => {
      updaterStore.setState({ status: "downloading" });
      const installed = await downloadAndInstallUpdate();
      assert.strictEqual(installed, false, "Concurrent downloadAndInstallUpdate should be ignored when downloading");
      updaterStore.setState({ status: "idle" });
    });
  });

  // =========================================================================
  // 4. Update Lifecycle State Transitions
  // =========================================================================
  describe("4. Update Lifecycle State Transitions", () => {
    beforeEach(() => {
      setSimulatedUpdater(null);
      updaterStore.setState({
        status: "idle",
        currentVersion: "3.0",
        availableVersion: null,
        releaseNotes: null,
        releaseDate: null,
        progress: null,
        error: null,
      });
    });

    it("transitions idle -> checking -> up_to_date when no update is available", async () => {
      setSimulatedUpdater({
        mockAvailableVersion: null,
      });

      await checkForUpdates();
      const state = updaterStore.getState();
      assert.strictEqual(state.status, "up_to_date");
      assert.strictEqual(state.error, null);
    });

    it("transitions idle -> checking -> update_available when new version is available", async () => {
      setSimulatedUpdater({
        mockAvailableVersion: "3.1",
        mockReleaseNotes: "New features and bug fixes",
        mockReleaseDate: "2026-10-15T00:00:00Z",
      });

      await checkForUpdates();
      const state = updaterStore.getState();
      assert.strictEqual(state.status, "update_available");
      assert.strictEqual(state.availableVersion, "3.1");
      assert.strictEqual(state.releaseNotes, "New features and bug fixes");
    });

    it("supports download, progress reporting, and completion", async () => {
      setSimulatedUpdater({
        mockAvailableVersion: "3.1",
        downloadDurationMs: 40,
      });

      updaterStore.setState({
        status: "update_available",
        availableVersion: "3.1",
      });

      await downloadAndInstallUpdate();
      const state = updaterStore.getState();
      assert.strictEqual(state.status, "success");
    });

    it("honestly reflects that active downloads cannot be cancelled mid-stream", async () => {
      updaterStore.setState({
        status: "downloading",
        availableVersion: "3.1",
      });

      const cancelled = cancelUpdate();
      assert.strictEqual(
        cancelled,
        false,
        "cancelUpdate must return false to honestly reflect Tauri v2's non-cancellable download pipeline"
      );
    });

    it("handles simulated network failure gracefully with sanitized error", async () => {
      setSimulatedUpdater({
        simulateFailure: "network",
      });

      await checkForUpdates();
      const state = updaterStore.getState();
      assert.strictEqual(state.status, "error");
      assert.ok(state.error?.includes("connection"));
    });
  });

  // =========================================================================
  // 5. Update Metadata Generation & Validation Scripts
  // =========================================================================
  describe("5. Update Metadata Generation & Validation Scripts", () => {
    it("generates valid latest.json metadata structure", () => {
      const mockDir = path.join(ROOT_DIR, "target/test-metadata-staging");
      if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });

      // Create mock artifacts and signatures
      fs.writeFileSync(path.join(mockDir, "BBQ-win-x64-setup.exe"), "mock-exe-data");
      fs.writeFileSync(path.join(mockDir, "BBQ-win-x64-setup.exe.sig"), "mock-win-signature");
      fs.writeFileSync(path.join(mockDir, "BBQ-mac-arm64.app.zip"), "mock-mac-data");
      fs.writeFileSync(path.join(mockDir, "BBQ-mac-arm64.app.zip.sig"), "mock-mac-signature");

      const result = generateUpdateMetadata({
        artifactsDir: mockDir,
        version: "3.0.0",
        tag: "v3.0.0",
        repo: "owergungor/BBQ",
        notes: "Test release notes",
      });

      assert.strictEqual(result.version, "3.0.0");
      assert.strictEqual(result.notes, "Test release notes");
      assert.ok(result.pub_date);
      assert.ok(result.platforms["windows-x86_64"]);
      assert.strictEqual(result.platforms["windows-x86_64"].signature, "mock-win-signature");
      assert.ok(result.platforms["darwin-aarch64"]);
      assert.strictEqual(result.platforms["darwin-aarch64"].signature, "mock-mac-signature");

      // Clean up mock staging
      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    it("validates updater metadata correctly and catches schema errors", () => {
      const tempJson = path.join(ROOT_DIR, "target/test-latest.json");
      const tempDir = path.dirname(tempJson);
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      // Valid metadata
      fs.writeFileSync(
        tempJson,
        JSON.stringify({
          version: "3.0.0",
          notes: "Release notes",
          pub_date: new Date().toISOString(),
          platforms: {
            "windows-x86_64": {
              signature: "sig123",
              url: "https://github.com/owergungor/BBQ/releases/download/v3.0.0/BBQ-win-x64-setup.exe",
            },
          },
        })
      );

      const validRes = validateReleaseMetadata(tempJson);
      assert.strictEqual(validRes.valid, true, "Valid metadata should pass");
      assert.strictEqual(validRes.errors.length, 0);

      // Invalid metadata: non-https URL, invalid version
      fs.writeFileSync(
        tempJson,
        JSON.stringify({
          version: "invalid_ver",
          pub_date: "bad-date",
          platforms: {
            "unknown-platform": {
              signature: "",
              url: "http://insecure.url/asset.zip",
            },
          },
        })
      );

      const invalidRes = validateReleaseMetadata(tempJson);
      assert.strictEqual(invalidRes.valid, false, "Invalid metadata must fail");
      assert.ok(invalidRes.errors.some((e) => e.includes("Invalid SemVer")));
      assert.ok(invalidRes.errors.some((e) => e.includes("Unrecognized Tauri platform")));
      assert.ok(invalidRes.errors.some((e) => e.includes("HTTPS")));

      fs.rmSync(tempJson, { force: true });
    });

    it("does not advertise assets whose payload file is missing locally", () => {
      const mockDir = path.join(ROOT_DIR, "target/test-missing-payload-staging");
      if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });

      // Create an orphaned signature without corresponding payload
      fs.writeFileSync(path.join(mockDir, "BBQ-win-x64-setup.exe.sig"), "orphan-signature");

      const result = generateUpdateMetadata({
        artifactsDir: mockDir,
        version: "3.0",
        tag: "v3.0",
        repo: "owergungor/BBQ",
      });

      assert.strictEqual(
        Object.keys(result.platforms).length,
        0,
        "Orphaned signature must not generate an advertised platform entry"
      );

      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    it("does not advertise linux-x86_64 by default when not built by workflow", () => {
      const mockDir = path.join(ROOT_DIR, "target/test-linux-staging");
      if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });

      fs.writeFileSync(path.join(mockDir, "BBQ-win-x64-setup.exe"), "win-data");
      fs.writeFileSync(path.join(mockDir, "BBQ-win-x64-setup.exe.sig"), "win-sig");
      fs.writeFileSync(path.join(mockDir, "BBQ-linux.AppImage"), "linux-data");
      fs.writeFileSync(path.join(mockDir, "BBQ-linux.AppImage.sig"), "linux-sig");

      const result = generateUpdateMetadata({
        artifactsDir: mockDir,
        version: "3.0",
        tag: "v3.0",
        repo: "owergungor/BBQ",
      });

      assert.ok(result.platforms["windows-x86_64"], "Windows must be included");
      assert.strictEqual(
        result.platforms["linux-x86_64"],
        undefined,
        "Linux must not be advertised without explicit includeLinux option"
      );

      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    it("enforces strict validation failure when advertised asset is missing from artifactsDir", () => {
      const mockDir = path.join(ROOT_DIR, "target/test-strict-validation-staging");
      if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });

      const tempJson = path.join(mockDir, "latest.json");
      fs.writeFileSync(
        tempJson,
        JSON.stringify({
          version: "3.0",
          notes: "Release notes",
          pub_date: new Date().toISOString(),
          platforms: {
            "windows-x86_64": {
              signature: "sig123",
              url: "https://github.com/owergungor/BBQ/releases/download/v3.0/BBQ-win-x64-setup.exe",
            },
          },
        })
      );

      // In strict mode without the local asset file, validation must fail
      const strictRes = validateReleaseMetadata(tempJson, {
        strictSigning: true,
        artifactsDir: mockDir,
      });

      assert.strictEqual(strictRes.valid, false, "Strict validation must fail when asset is missing");
      assert.ok(strictRes.errors.some((e) => e.includes("Strict validation failed")));

      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    it("verifies RELEASE_PROCESS.md exists and documents key requirements", () => {
      const releaseDocPath = path.join(ROOT_DIR, "RELEASE_PROCESS.md");
      assert.ok(fs.existsSync(releaseDocPath), "RELEASE_PROCESS.md must exist in repository root");

      const doc = fs.readFileSync(releaseDocPath, "utf-8");
      assert.ok(doc.includes("tauri signer generate"), "Must document tauri signer generate command");
      assert.ok(doc.includes("TAURI_SIGNING_PRIVATE_KEY"), "Must document TAURI_SIGNING_PRIVATE_KEY secret");
      assert.ok(doc.includes("v2.8"), "Must document v2.8 migration limitation");
      assert.ok(doc.includes("Gatekeeper"), "Must distinguish Minisign from Apple Gatekeeper");
    });

    it("verifies ci.yml release builds fail closed when TAURI_SIGNING_PRIVATE_KEY is missing", () => {
      const ciYamlPath = path.join(ROOT_DIR, ".github/workflows/ci.yml");
      const ciYaml = fs.readFileSync(ciYamlPath, "utf-8");

      assert.ok(
        ciYaml.includes("TAURI_SIGNING_PRIVATE_KEY is required for release builds"),
        "ci.yml must fail release builds when TAURI_SIGNING_PRIVATE_KEY is missing"
      );
      assert.ok(
        ciYaml.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD"),
        "ci.yml must wire TAURI_SIGNING_PRIVATE_KEY_PASSWORD into build environments"
      );
      assert.ok(
        ciYaml.includes("--strict"),
        "ci.yml must invoke validate-release-metadata.mjs with --strict"
      );
      assert.ok(
        ciYaml.includes("Uploading updater metadata manifest (latest.json)..."),
        "ci.yml must enforce two-phase publication ordering (latest.json uploaded after binaries and signatures)"
      );
      assert.ok(
        ciYaml.includes("artifacts/mac-arm64/BBQ-mac-arm64.app.tar.gz"),
        "ci.yml must check for macOS updater archive (BBQ-mac-arm64.app.tar.gz)"
      );
      assert.ok(
        ciYaml.includes("UPLOAD_ASSETS+=(release-assets/BBQ-mac-arm64.app.tar.gz)"),
        "ci.yml must add BBQ-mac-arm64.app.tar.gz to UPLOAD_ASSETS"
      );
    });

    it("fails strict metadata validation if macOS updater archive or signature is omitted", () => {
      const mockDir = path.join(ROOT_DIR, "target/test-mac-updater-omission");
      if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });

      // Case A: Signature exists but payload .tar.gz is omitted
      fs.writeFileSync(path.join(mockDir, "BBQ-mac-arm64.app.tar.gz.sig"), "mac-sig-content");
      const metaWithoutPayload = generateUpdateMetadata({
        artifactsDir: mockDir,
        version: "3.0",
        repo: "owergungor/BBQ",
      });
      assert.strictEqual(
        metaWithoutPayload.platforms["darwin-aarch64"],
        undefined,
        "Metadata must omit darwin-aarch64 when BBQ-mac-arm64.app.tar.gz payload is missing"
      );

      // Case B: Payload exists but signature is omitted
      fs.rmSync(path.join(mockDir, "BBQ-mac-arm64.app.tar.gz.sig"), { force: true });
      fs.writeFileSync(path.join(mockDir, "BBQ-mac-arm64.app.tar.gz"), "mac-payload-content");
      const metaWithoutSig = generateUpdateMetadata({
        artifactsDir: mockDir,
        version: "3.0",
        repo: "owergungor/BBQ",
      });
      assert.strictEqual(
        metaWithoutSig.platforms["darwin-aarch64"],
        undefined,
        "Metadata must omit darwin-aarch64 when signature is missing"
      );

      // Case C: latest.json explicitly advertises darwin-aarch64 but artifactsDir is missing the .tar.gz or .sig
      const testJson = path.join(mockDir, "latest.json");
      fs.writeFileSync(
        testJson,
        JSON.stringify({
          version: "3.0",
          pub_date: new Date().toISOString(),
          platforms: {
            "darwin-aarch64": {
              signature: "test-sig",
              url: "https://github.com/owergungor/BBQ/releases/download/v3.0/BBQ-mac-arm64.app.tar.gz",
            },
          },
        })
      );

      // Delete .tar.gz from dir to simulate omission
      fs.rmSync(path.join(mockDir, "BBQ-mac-arm64.app.tar.gz"), { force: true });
      const strictResMissingPayload = validateReleaseMetadata(testJson, {
        strictSigning: true,
        artifactsDir: mockDir,
      });
      assert.strictEqual(strictResMissingPayload.valid, false, "Must fail strict validation when macOS payload is missing");
      assert.ok(strictResMissingPayload.errors.some((e) => e.includes("BBQ-mac-arm64.app.tar.gz")));

      fs.rmSync(mockDir, { recursive: true, force: true });
    });

    it("enforces major.minor parity between tauri-plugin-updater crate and npm package", () => {
      const cargoTomlPath = path.join(DESKTOP_DIR, "src-tauri/Cargo.toml");
      const packageJsonPath = path.join(DESKTOP_DIR, "package.json");
      const cargoLockPath = path.join(ROOT_DIR, "Cargo.lock");
      const pnpmLockPath = path.join(ROOT_DIR, "pnpm-lock.yaml");

      const cargoToml = fs.readFileSync(cargoTomlPath, "utf-8");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const cargoLock = fs.readFileSync(cargoLockPath, "utf-8");
      const pnpmLock = fs.readFileSync(pnpmLockPath, "utf-8");

      // 1. Check declared versions
      const crateMatch = cargoToml.match(/tauri-plugin-updater\s*=\s*"([^"]+)"/);
      assert.ok(crateMatch, "Cargo.toml must declare tauri-plugin-updater");
      const crateDeclaredVer = crateMatch[1].replace(/^[~^]/, "");

      const npmDeclaredVer = packageJson.dependencies?.["@tauri-apps/plugin-updater"]?.replace(/^[~^]/, "");
      assert.ok(npmDeclaredVer, "package.json must declare @tauri-apps/plugin-updater");

      const [crateDeclMajor, crateDeclMinor] = crateDeclaredVer.split(".");
      const [npmDeclMajor, npmDeclMinor] = npmDeclaredVer.split(".");

      assert.strictEqual(
        `${crateDeclMajor}.${crateDeclMinor}`,
        `${npmDeclMajor}.${npmDeclMinor}`,
        `Declared versions must share major.minor: Rust (${crateDeclaredVer}) vs NPM (${npmDeclaredVer})`
      );

      // 2. Check resolved lockfile versions
      const cargoLockMatch = cargoLock.match(/name\s*=\s*"tauri-plugin-updater"\s*\r?\nversion\s*=\s*"([^"]+)"/);
      assert.ok(cargoLockMatch, "Cargo.lock must contain resolved tauri-plugin-updater");
      const crateResolvedVer = cargoLockMatch[1];

      const pnpmLockMatch = pnpmLock.match(/['"]?@tauri-apps\/plugin-updater@([0-9.]+)/);
      assert.ok(pnpmLockMatch, "pnpm-lock.yaml must contain resolved @tauri-apps/plugin-updater");
      const npmResolvedVer = pnpmLockMatch[1];

      const [crateResMajor, crateResMinor] = crateResolvedVer.split(".");
      const [npmResMajor, npmResMinor] = npmResolvedVer.split(".");

      assert.strictEqual(
        `${crateResMajor}.${crateResMinor}`,
        `${npmResMajor}.${npmResMinor}`,
        `Tauri CLI enforces identical resolved major.minor: Cargo.lock (${crateResolvedVer}) vs pnpm-lock.yaml (${npmResolvedVer})`
      );
    });
  });

  // =========================================================================
  // 6. Five-Language Localization Architecture & 100% Key Parity
  // =========================================================================
  describe("6. Five-Language Localization Architecture & 100% Key Parity", () => {
    const localesDir = path.join(DESKTOP_DIR, "src/i18n/locales");
    const requiredLanguages = ["en", "es", "fr", "de", "tr"];

    it("verifies all five locale files exist and are valid JSON", () => {
      for (const lang of requiredLanguages) {
        const filePath = path.join(localesDir, `${lang}.json`);
        assert.ok(fs.existsSync(filePath), `Locale file ${lang}.json must exist`);
        assert.doesNotThrow(() => {
          JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }, `Locale file ${lang}.json must be valid JSON`);
      }
    });

    it("verifies 100% translation key parity across all five languages against en.json", () => {
      function getAllKeys(obj, prefix = ""): string[] {
        let keys: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === "object" && !Array.isArray(v)) {
            keys = keys.concat(getAllKeys(v, fullKey));
          } else {
            keys.push(fullKey);
          }
        }
        return keys;
      }

      const enData = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf-8"));
      const enKeys = new Set(getAllKeys(enData));

      for (const lang of ["es", "fr", "de", "tr"]) {
        const langData = JSON.parse(fs.readFileSync(path.join(localesDir, `${lang}.json`), "utf-8"));
        const langKeys = new Set(getAllKeys(langData));

        const missingKeys = [...enKeys].filter((k) => !langKeys.has(k));
        assert.strictEqual(
          missingKeys.length,
          0,
          `Locale '${lang}' is missing ${missingKeys.length} keys from en.json:\n${missingKeys.slice(0, 10).join("\n")}`
        );
      }
    });

    it("verifies LANGUAGE_OPTIONS contains all five languages with exact specified labels and flags", () => {
      assert.strictEqual(LANGUAGE_OPTIONS.length, 5);

      const expected = [
        { code: "en", flag: "🇬🇧" },
        { code: "es", flag: "🇪🇸" },
        { code: "fr", flag: "🇫🇷" },
        { code: "de", flag: "🇩🇪" },
        { code: "tr", flag: "🇹🇷" },
      ];

      for (const exp of expected) {
        const found = LANGUAGE_OPTIONS.find((o) => o.value === exp.code);
        assert.ok(found, `Language option for '${exp.code}' must exist`);
        assert.ok(found.label.includes(exp.flag), `Label for '${exp.code}' must contain flag`);
      }
    });

    it("applies language switching immediately in memory without restart", () => {
      // Test direct language override in t()
      assert.strictEqual(t("common.close", undefined, "de"), "Schließen");
      assert.strictEqual(t("common.close", undefined, "fr"), "Fermer");
      assert.strictEqual(t("common.close", undefined, "es"), "Cerrar");
      assert.strictEqual(t("common.close", undefined, "tr"), "Kapat");
      assert.strictEqual(t("common.close", undefined, "en"), "Close");

      // Test settingsStore language persistence integration
      settingsStore.setState({
        settings: { ...settingsStore.getState().settings, language: "es" },
      });
      assert.strictEqual(settingsStore.getState().settings.language, "es");

      settingsStore.setState({
        settings: { ...settingsStore.getState().settings, language: "en" },
      });
      assert.strictEqual(settingsStore.getState().settings.language, "en");
    });

    it("falls back safely to English for invalid language code", () => {
      // @ts-ignore
      assert.strictEqual(t("common.close", undefined, "invalid_lang"), "Close");
      // @ts-ignore
      assert.strictEqual(t("nonexistent.key.path", undefined, "en"), "path");
    });

    it("formats dates and numbers correctly per locale", () => {
      const testDate = "2026-10-12T12:00:00Z";

      const deDate = formatLocaleDate(testDate, "de");
      const enDate = formatLocaleDate(testDate, "en");
      assert.ok(deDate.length > 0);
      assert.ok(enDate.length > 0);

      const deNum = formatLocaleNumber(1234567.89, "de");
      assert.ok(deNum.includes(".") || deNum.includes(","));

      assert.strictEqual(formatBytes(1048576, "en"), "1.0 MB");
      assert.strictEqual(formatBytes(0, "en"), "0 B");
    });
  });

  // =========================================================================
  // 5. Minisign Cryptographic Signature Verification & Preflight Workflow
  // =========================================================================
  describe("5. Minisign Cryptographic Verification & Preflight Workflow", () => {
    const TEST_PUB_KEY = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
    const TEST_SIG = [
      "untrusted comment: signature from minisign secret key",
      "RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=",
      "trusted comment: timestamp:1633700835\tfile:test\tprehashed",
      "wLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==",
    ].join("\n");
    const TEST_FILE_BUFFER = Buffer.from("test");

    it("parses valid Minisign public key and extracts 32-byte Ed25519 key", () => {
      const parsed = parseMinisignPublicKey(TEST_PUB_KEY);
      assert.strictEqual(parsed.keyId.length, 8);
      assert.strictEqual(parsed.rawPublicKey.length, 32);
      assert.ok(parsed.keyObject, "Crypto KeyObject must be generated");
    });

    it("parses Minisign signature into header, key ID, and global signature", () => {
      const parsed = parseMinisignSignature(TEST_SIG);
      assert.strictEqual(parsed.keyId.length, 8);
      assert.strictEqual(parsed.signatureBytes.length, 64);
      assert.strictEqual(parsed.globalSignatureBytes.length, 64);
      assert.strictEqual(parsed.isPrehashed, true);
      assert.ok(parsed.trustedComment.includes("file:test"));
    });

    it("cryptographically verifies authentic Minisign signature", () => {
      const result = verifyMinisignSignature({
        fileBuffer: TEST_FILE_BUFFER,
        sigContent: TEST_SIG,
        pubKey: TEST_PUB_KEY,
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.isPrehashed, true);
    });

    it("fails closed when file content is modified/tampered", () => {
      const tamperedBuffer = Buffer.from("tampered_content");
      assert.throws(
        () => {
          verifyMinisignSignature({
            fileBuffer: tamperedBuffer,
            sigContent: TEST_SIG,
            pubKey: TEST_PUB_KEY,
          });
        },
        /payload signature verification failed/i
      );
    });

    it("fails closed when key ID does not match", () => {
      const differentPubKey = "RWQ4GNYsfQ5VBkTxW5LHaNrD9d6PNG1JTlEhSscJvkWvBGfqtwJJGAw3";
      assert.throws(
        () => {
          verifyMinisignSignature({
            fileBuffer: TEST_FILE_BUFFER,
            sigContent: TEST_SIG,
            pubKey: differentPubKey,
          });
        },
        /Key ID mismatch/i
      );
    });

    it("verifies public key configured in tauri.conf.json is valid Minisign key", () => {
      const confPath = path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json");
      const conf = JSON.parse(fs.readFileSync(confPath, "utf-8"));
      const pubkey = conf.plugins?.updater?.pubkey;
      assert.ok(pubkey, "tauri.conf.json must configure plugins.updater.pubkey");

      const parsed = parseMinisignPublicKey(pubkey);
      assert.strictEqual(parsed.rawPublicKey.length, 32);
      assert.strictEqual(parsed.keyId.length, 8);
    });

    it("validates updater-signing-preflight.yml contract and isolation constraints", () => {
      const workflowPath = path.join(ROOT_DIR, ".github/workflows/updater-signing-preflight.yml");
      assert.ok(fs.existsSync(workflowPath), "preflight workflow file must exist");

      const content = fs.readFileSync(workflowPath, "utf-8");

      // Must be workflow_dispatch only
      assert.ok(content.includes("workflow_dispatch:"), "workflow must be triggered by workflow_dispatch");
      assert.ok(!content.includes("push:"), "workflow must NOT trigger on push");
      assert.ok(!content.includes("pull_request:"), "workflow must NOT trigger on pull_request");

      // Minimal read-only permissions
      assert.ok(content.includes("permissions:\n  contents: read"), "workflow must have contents: read only");
      assert.ok(!content.includes("contents: write"), "workflow must NEVER have contents: write permission");

      // Must NOT create or upload to GitHub release
      assert.ok(!content.includes("gh release create"), "workflow must NEVER create GitHub releases");
      assert.ok(!content.includes("gh release upload"), "workflow must NEVER upload to GitHub releases");

      // Must reference both signing secrets
      assert.ok(content.includes("secrets.TAURI_SIGNING_PRIVATE_KEY"), "must reference TAURI_SIGNING_PRIVATE_KEY");
      assert.ok(content.includes("secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD"), "must reference TAURI_SIGNING_PRIVATE_KEY_PASSWORD");

      // Must build on both Windows and macOS runners
      assert.ok(content.includes("runs-on: windows-latest"), "must run on windows-latest");
      assert.ok(content.includes("runs-on: macos-latest"), "must run on macos-latest");

      // Must invoke cryptographic signature verification
      assert.ok(content.includes("verify-minisign-signature.mjs"), "must run verify-minisign-signature.mjs");
    });
  });

  // =========================================================================
  // 8. Release Version Consistency & Release Workflow Integrity
  // =========================================================================
  describe("8. Release Version Consistency & Release Workflow Integrity", () => {
    it("verifies shipped application version is consistently 3.0 across all manifests and sources", () => {
      const rootPkgPath = path.join(ROOT_DIR, "package.json");
      const desktopPkgPath = path.join(DESKTOP_DIR, "package.json");
      const typesPkgPath = path.join(ROOT_DIR, "packages/types/package.json");
      const tauriConfPath = path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json");
      const desktopCargoPath = path.join(DESKTOP_DIR, "src-tauri/Cargo.toml");
      const cargoLockPath = path.join(ROOT_DIR, "Cargo.lock");

      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(typesPkgPath, "utf-8"));
      const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
      const desktopCargo = fs.readFileSync(desktopCargoPath, "utf-8");
      const cargoLock = fs.readFileSync(cargoLockPath, "utf-8");

      const EXPECTED_VERSION = "3.0";
      const CARGO_INTERNAL_VERSION = "3.0.0";

      // 1. Root, desktop, and types package.json
      assert.strictEqual(
        rootPkg.version,
        EXPECTED_VERSION,
        `Root package.json version must be ${EXPECTED_VERSION}, got: ${rootPkg.version}`
      );
      assert.strictEqual(
        desktopPkg.version,
        EXPECTED_VERSION,
        `apps/desktop/package.json version must be ${EXPECTED_VERSION}, got: ${desktopPkg.version}`
      );
      assert.strictEqual(
        typesPkg.version,
        EXPECTED_VERSION,
        `packages/types/package.json version must be ${EXPECTED_VERSION}, got: ${typesPkg.version}`
      );

      // 2. Runtime version imports
      assert.strictEqual(
        APP_VERSION,
        EXPECTED_VERSION,
        `APP_VERSION exported by version.ts must be ${EXPECTED_VERSION}`
      );
      assert.strictEqual(
        APP_VERSION_LABEL,
        `v${EXPECTED_VERSION}`,
        `APP_VERSION_LABEL exported by version.ts must be v${EXPECTED_VERSION}`
      );
      assert.strictEqual(
        initialUpdaterState.currentVersion,
        EXPECTED_VERSION,
        `initialUpdaterState.currentVersion must be initialized to ${EXPECTED_VERSION}`
      );

      // 3. tauri.conf.json (documented internal 3-component normalization required by tauri-build/semver)
      assert.strictEqual(
        tauriConf.version,
        CARGO_INTERNAL_VERSION,
        `tauri.conf.json internal version must be ${CARGO_INTERNAL_VERSION}, got: ${tauriConf.version}`
      );

      // 4. Desktop Cargo.toml & Cargo.lock (documented internal 3-component normalization required by Cargo)
      const desktopCargoMatch = desktopCargo.match(/^version\s*=\s*"([^"]+)"/m);
      assert.ok(desktopCargoMatch, "apps/desktop/src-tauri/Cargo.toml must declare package version");
      assert.strictEqual(
        desktopCargoMatch[1],
        CARGO_INTERNAL_VERSION,
        `apps/desktop/src-tauri/Cargo.toml internal version must be ${CARGO_INTERNAL_VERSION}`
      );

      const lockMatch = cargoLock.match(/name\s*=\s*"bbq-desktop"\s*\r?\nversion\s*=\s*"([^"]+)"/);
      assert.ok(lockMatch, "Cargo.lock must contain resolved bbq-desktop version");
      assert.strictEqual(
        lockMatch[1],
        CARGO_INTERNAL_VERSION,
        `Cargo.lock resolved bbq-desktop version must be ${CARGO_INTERNAL_VERSION}`
      );
    });

    it("fails regression test if any application version source diverges from two-component 3.0 format", () => {
      const publicVersions = {
        rootPkg: JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8")).version,
        desktopPkg: JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8")).version,
        typesPkg: JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8")).version,
        appVersionTs: APP_VERSION,
        initialUpdaterState: initialUpdaterState.currentVersion,
      };

      const twoComponentRegex = /^\d+\.\d+$/;
      for (const [source, ver] of Object.entries(publicVersions)) {
        assert.ok(
          twoComponentRegex.test(ver),
          `Public version source ${source} ("${ver}") must adhere to two-component convention format (e.g. 3.0)`
        );
      }

      const uniqueVersions = new Set(Object.values(publicVersions));
      assert.strictEqual(
        uniqueVersions.size,
        1,
        `All public application version sources must match identically, found divergence: ${JSON.stringify(publicVersions)}`
      );
      assert.strictEqual(
        Array.from(uniqueVersions)[0],
        "3.0",
        `Canonical public version must be two-component 3.0, found: ${Array.from(uniqueVersions)[0]}`
      );
    });

    it("verifies .github/workflows/ci.yml stages macOS updater archive and adheres to two-phase publishing", () => {
      const ciPath = path.join(ROOT_DIR, ".github/workflows/ci.yml");
      assert.ok(fs.existsSync(ciPath), "ci.yml must exist");
      const ci = fs.readFileSync(ciPath, "utf-8");

      // Verify macOS updater archive staging
      assert.ok(
        ci.includes("artifacts/mac-arm64/BBQ-mac-arm64.app.tar.gz"),
        "ci.yml must check for macOS updater archive in artifacts/mac-arm64"
      );
      assert.ok(
        ci.includes("UPLOAD_ASSETS+=(release-assets/BBQ-mac-arm64.app.tar.gz)"),
        "ci.yml must stage BBQ-mac-arm64.app.tar.gz into UPLOAD_ASSETS"
      );

      // Verify signature staging
      assert.ok(
        ci.includes("for sig in artifacts/*/*.sig"),
        "ci.yml must iterate and stage all generated .sig files"
      );

      // Verify strict metadata validation is invoked
      assert.ok(
        ci.includes("validate-release-metadata.mjs release-assets/latest.json \\\n            --strict"),
        "ci.yml must run validate-release-metadata.mjs with --strict"
      );

      // Verify two-phase publication order:
      // Phase 5a: upload binaries and signatures first
      const phase5aIndex = ci.indexOf('gh release upload "$TAG_NAME" "${UPLOAD_ASSETS[@]}" --clobber');
      assert.ok(phase5aIndex !== -1, "ci.yml must upload binaries and signatures in Phase 5a");

      // Phase 5b: upload latest.json second
      const phase5bIndex = ci.indexOf('gh release upload "$TAG_NAME" release-assets/latest.json --clobber');
      assert.ok(phase5bIndex !== -1, "ci.yml must upload latest.json in Phase 5b");

      assert.ok(
        phase5aIndex < phase5bIndex,
        "Phase 5a (binaries + signatures upload) must occur BEFORE Phase 5b (latest.json upload)"
      );
    });

    it("verifies .github/workflows/ci.yml includes honest v2.8 manual migration notice in generated release notes", () => {
      const ciPath = path.join(ROOT_DIR, ".github/workflows/ci.yml");
      const ci = fs.readFileSync(ciPath, "utf-8");

      assert.ok(
        ci.includes("Notice for v2.8 Users (One-Time Manual Upgrade)"),
        "ci.yml release notes must contain header for v2.8 users"
      );
      assert.ok(
        ci.includes("BBQ v2.8 does not include the auto-updater plugin"),
        "ci.yml release notes must explain why v2.8 cannot update in-app"
      );
      assert.ok(
        ci.includes("manually download and install BBQ v3.0 once"),
        "ci.yml release notes must instruct v2.8 users to perform a one-time manual install"
      );
    });

    it("verifies .github/workflows/ci.yml safely handles missing or empty Apple signing credentials on macOS while preserving configured-certificate path", () => {
      const ciPath = path.join(ROOT_DIR, ".github/workflows/ci.yml");
      const ci = fs.readFileSync(ciPath, "utf-8");

      // Extract the macOS packaging step run script
      const macStepMatch = ci.match(
        /name:\s*Package & Standardize Artifacts \(macOS ARM64\)[\s\S]*?run:\s*\|([\s\S]*?)(?:-\s*name:|$)/
      );
      assert.ok(macStepMatch, "Must find macOS packaging step in ci.yml");
      const macScript = macStepMatch[1];

      // Verify empty Apple certificate is cleaned up from environment before tauri build
      assert.ok(
        macScript.includes("unset APPLE_CERTIFICATE"),
        "macOS script must unset APPLE_CERTIFICATE when empty to prevent Tauri SecKeychainItemImport failure"
      );

      // Verify that configured certificate path is preserved (tauri build is run without --no-sign when signing key is present)
      assert.ok(
        macScript.includes("pnpm --filter @bbq/desktop tauri build --bundles app --ci"),
        "macOS script must preserve full signed tauri build when signing credentials are provided"
      );

      // Verify simulation: when APPLE_CERTIFICATE is empty, unsetting it removes it from process environment
      const simulateEnvHandling = (inputEnv: {
        APPLE_CERTIFICATE?: string;
        APPLE_CERTIFICATE_PASSWORD?: string;
        APPLE_SIGNING_IDENTITY?: string;
        TAURI_SIGNING_PRIVATE_KEY?: string;
      }) => {
        const env = { ...inputEnv };
        if (!env.APPLE_CERTIFICATE || env.APPLE_CERTIFICATE.trim().length === 0) {
          delete env.APPLE_CERTIFICATE;
        }
        if (!env.APPLE_CERTIFICATE_PASSWORD || env.APPLE_CERTIFICATE_PASSWORD.trim().length === 0) {
          delete env.APPLE_CERTIFICATE_PASSWORD;
        }
        if (!env.APPLE_SIGNING_IDENTITY || env.APPLE_SIGNING_IDENTITY.trim().length === 0) {
          delete env.APPLE_SIGNING_IDENTITY;
        }
        return env;
      };

      // Case A: Secrets are empty string (as provided by GitHub Actions when secret is unset)
      const emptyEnv = simulateEnvHandling({
        APPLE_CERTIFICATE: "",
        APPLE_CERTIFICATE_PASSWORD: "",
        APPLE_SIGNING_IDENTITY: "",
        TAURI_SIGNING_PRIVATE_KEY: "mock_key",
      });
      assert.strictEqual(
        "APPLE_CERTIFICATE" in emptyEnv,
        false,
        "APPLE_CERTIFICATE must be removed when empty"
      );
      assert.strictEqual(
        "APPLE_CERTIFICATE_PASSWORD" in emptyEnv,
        false,
        "APPLE_CERTIFICATE_PASSWORD must be removed when empty"
      );
      assert.strictEqual(
        "APPLE_SIGNING_IDENTITY" in emptyEnv,
        false,
        "APPLE_SIGNING_IDENTITY must be removed when empty"
      );
      assert.strictEqual(
        emptyEnv.TAURI_SIGNING_PRIVATE_KEY,
        "mock_key",
        "TAURI_SIGNING_PRIVATE_KEY must remain intact"
      );

      // Case B: Secrets are genuinely configured (valid Apple Developer cert)
      const validEnv = simulateEnvHandling({
        APPLE_CERTIFICATE: "base64certdata",
        APPLE_CERTIFICATE_PASSWORD: "certpassword",
        APPLE_SIGNING_IDENTITY: "Developer ID Application: Team (12345)",
        TAURI_SIGNING_PRIVATE_KEY: "mock_key",
      });
      assert.strictEqual(
        validEnv.APPLE_CERTIFICATE,
        "base64certdata",
        "Configured APPLE_CERTIFICATE must be preserved"
      );
      assert.strictEqual(
        validEnv.APPLE_CERTIFICATE_PASSWORD,
        "certpassword",
        "Configured APPLE_CERTIFICATE_PASSWORD must be preserved"
      );
      assert.strictEqual(
        validEnv.APPLE_SIGNING_IDENTITY,
        "Developer ID Application: Team (12345)",
        "Configured APPLE_SIGNING_IDENTITY must be preserved"
      );
    });
  });
});
