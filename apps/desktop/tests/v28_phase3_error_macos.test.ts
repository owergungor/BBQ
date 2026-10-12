import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  redactSensitiveDetails,
  sanitizeErrorForUser,
  errorStore,
  reportAppError,
  dismissAppError,
  clearAllAppErrors,
  type AppError,
  type ErrorCategory,
} from "../src/state/errorState.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.8 — Phase 3 & 3.1: Error-Safety & macOS Release Pipeline Audit", () => {
  beforeEach(() => {
    clearAllAppErrors();
  });

  describe("Sensitive Information Redaction (redactSensitiveDetails)", () => {
    it("redacts absolute Windows file paths including drive letters and UNC shares", () => {
      const raw = "Failed to open C:\\Users\\omer\\AppData\\Local\\BBQ\\secret.db during sync";
      const sanitized = redactSensitiveDetails(raw);
      assert.ok(!sanitized.includes("C:\\Users\\omer"), "Windows path must not be leaked");
      assert.ok(sanitized.includes("[file path]"), "Must replace path with safe placeholder");

      const uncRaw = "Network share rejected at \\\\server\\share\\data\\keys.pem";
      const uncSanitized = redactSensitiveDetails(uncRaw);
      assert.ok(!uncSanitized.includes("\\\\server\\share"), "UNC path must not be leaked");
      assert.ok(uncSanitized.includes("[file path]"));
    });

    it("redacts Unix and macOS file paths", () => {
      const raw = "Permission denied at /Users/omer/Library/Application Support/BBQ/keys.json";
      const sanitized = redactSensitiveDetails(raw);
      assert.ok(!sanitized.includes("/Users/omer"), "macOS path must not be leaked");
      assert.ok(sanitized.includes("[file path]"), "Must replace path with safe placeholder");

      const linuxRaw = "Cannot access /home/user/.config/bbq/token.txt";
      const linuxSanitized = redactSensitiveDetails(linuxRaw);
      assert.ok(!linuxSanitized.includes("/home/user"), "Linux path must not be leaked");
    });

    it("redacts URLs containing embedded credentials", () => {
      const urlRaw = "Failed connecting to https://admin:super_secret_pw@api.example.com/v1/sync";
      const urlSanitized = redactSensitiveDetails(urlRaw);
      assert.ok(!urlSanitized.includes("super_secret_pw"), "Embedded URL password must be redacted");
      assert.ok(!urlSanitized.includes("admin:"), "Embedded username must be redacted");
      assert.ok(urlSanitized.includes("https://[credentials redacted]@api.example.com/v1/sync"));

      const dbRaw = "Connection refused to postgres://dbuser:mypassword123@localhost:5432/bbq";
      const dbSanitized = redactSensitiveDetails(dbRaw);
      assert.ok(!dbSanitized.includes("mypassword123"));
      assert.ok(dbSanitized.includes("postgres://[credentials redacted]@localhost:5432/bbq"));
    });

    it("redacts JS stack traces", () => {
      const raw = "TypeError: null reference\n    at IslandContent.render (island.js:45:12)\n    at commitHook (react.js:100:4)";
      const sanitized = redactSensitiveDetails(raw);
      assert.ok(!sanitized.includes("at IslandContent.render"), "Stack frames must be removed");
      assert.ok(!sanitized.includes("at commitHook"), "Stack frames must be removed");
      assert.ok(sanitized.includes("TypeError: null reference"));
    });

    it("redacts tokens, bearer headers, and credentials", () => {
      const tokenMsg = "Authorization failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret";
      const redactedToken = redactSensitiveDetails(tokenMsg);
      assert.ok(!redactedToken.includes("eyJhbGci"), "JWT token string must be redacted");
      assert.ok(redactedToken.includes("[token redacted]"));

      const credMsg = "Connection refused with password='super_secret_password_123'";
      const redactedCred = redactSensitiveDetails(credMsg);
      assert.ok(!redactedCred.includes("super_secret_password_123"), "Password must be redacted");
      assert.ok(redactedCred.includes("[credential redacted]"));
    });

    it("does not corrupt ordinary user-facing punctuation or phrasing", () => {
      const normal = "Failed to update item: try again and/or contact support (code 404).";
      assert.strictEqual(redactSensitiveDetails(normal), normal);
    });

    it("handles empty or null-like inputs safely", () => {
      assert.strictEqual(redactSensitiveDetails(""), "");
      assert.strictEqual(redactSensitiveDetails(null as unknown as string), "");
    });
  });

  describe("Error Mapping & User-Facing Guidance (sanitizeErrorForUser)", () => {
    it("maps database busy/lock errors to Settings Temporarily Busy", () => {
      const mapped = sanitizeErrorForUser("Database is locked: sqlite busy timeout", "settings");
      assert.strictEqual(mapped.title, "Settings Temporarily Busy");
      assert.ok(mapped.message.includes("preferences database is currently busy"));
      assert.strictEqual(mapped.actionRequired, true);
    });

    it("maps generic settings failure cleanly", () => {
      const mapped = sanitizeErrorForUser("IO error writing preferences", "settings");
      assert.strictEqual(mapped.title, "Preferences Update Failed");
      assert.ok(mapped.message.includes("Unable to save your settings"));
      assert.strictEqual(mapped.actionRequired, false);
    });

    it("maps hotkey registration conflicts to clear action guidance", () => {
      const mapped = sanitizeErrorForUser("Hotkey already registered by Windows Shell", "hotkey");
      assert.strictEqual(mapped.title, "Shortcut Conflict");
      assert.ok(mapped.message.includes("already reserved by the operating system"));
      assert.strictEqual(mapped.actionRequired, true);
    });

    it("maps file size limit exceeded errors", () => {
      const mapped = sanitizeErrorForUser("File exceeds 50mb limit", "filesystem");
      assert.strictEqual(mapped.title, "File Size Limit Exceeded");
      assert.ok(mapped.message.includes("50 MB"));
      assert.strictEqual(mapped.actionRequired, false);
    });

    it("maps clipboard permission denial", () => {
      const mapped = sanitizeErrorForUser("Permission denied by Wayland compositor", "clipboard");
      assert.strictEqual(mapped.title, "Clipboard Access Restricted");
      assert.ok(mapped.message.includes("Check operating system permissions"));
      assert.strictEqual(mapped.actionRequired, true);
    });

    it("falls back safely for unknown categories or unexpected error shapes", () => {
      const mapped = sanitizeErrorForUser(new Error("Unexpected internal crash #0x8892"), "general");
      assert.strictEqual(mapped.title, "Operation Failed");
      assert.ok(mapped.message.includes("The application remains running safely"));
      assert.strictEqual(mapped.actionRequired, false);

      const nonErrorMapped = sanitizeErrorForUser({ arbitrary: 123 } as unknown as string, "general");
      assert.strictEqual(nonErrorMapped.title, "Operation Failed");
    });
  });

  describe("Error Store Lifecycle, Sanitization & Deduplication", () => {
    it("reports an error and sets activeError state", () => {
      const reported = reportAppError("Unable to write file", { category: "filesystem" });
      assert.ok(reported !== null, "Reported error should be non-null");
      assert.strictEqual(reported?.title, "File Operation Failed");

      const state = errorStore.getState().activeError;
      assert.ok(state !== null);
      assert.strictEqual(state?.id, reported?.id);
      assert.strictEqual(state?.category, "filesystem");
    });

    it("sanitizes custom title and custom message on report", () => {
      const reported = reportAppError("raw error", {
        category: "general",
        customTitle: "Failed connecting to https://user:secret@api.com",
        customMessage: "Cannot read C:\\Users\\omer\\AppData\\token.txt with Bearer 123456",
      });

      assert.ok(reported !== null);
      assert.ok(!reported?.title.includes("secret@"));
      assert.ok(reported?.title.includes("[credentials redacted]"));
      assert.ok(!reported?.message.includes("C:\\Users\\omer"));
      assert.ok(!reported?.message.includes("Bearer 123456"));
      assert.ok(reported?.message.includes("[file path]"));
      assert.ok(reported?.message.includes("[token redacted]"));
    });

    it("deduplicates identical error cascades within the 3-second window", () => {
      // First call succeeds
      const first = reportAppError("Repeated failure test 1", { category: "media" });
      assert.ok(first !== null);

      // Second immediate call with same category & title is deduplicated
      const second = reportAppError("Repeated failure test 2", { category: "media" });
      assert.strictEqual(second, null, "Cascading identical error must be deduplicated");
    });

    it("unblocks deduplication when an error is explicitly dismissed by the user", () => {
      // First occurrence
      const first = reportAppError("Dismiss unblock test", { category: "launcher" });
      assert.ok(first !== null);

      // User dismisses the error
      dismissAppError(first!.id);
      assert.strictEqual(errorStore.getState().activeError, null);

      // Subsequent attempt after dismissal is allowed immediately (not permanently suppressed)
      const second = reportAppError("Dismiss unblock test", { category: "launcher" });
      assert.ok(second !== null, "Dismissal must unblock the fingerprint for subsequent legitimate user actions");
    });

    it("dismisses active error cleanly by ID or globally", () => {
      const reported = reportAppError("Dismiss test failure", { category: "launcher" });
      assert.ok(reported !== null);
      assert.ok(errorStore.getState().activeError !== null);

      // Dismiss with matching ID
      dismissAppError(reported!.id);
      assert.strictEqual(errorStore.getState().activeError, null);

      // Clear all
      reportAppError("Second dismiss failure", { category: "timer" });
      clearAllAppErrors();
      assert.strictEqual(errorStore.getState().activeError, null);
    });

    it("executes recovery action callback properly", async () => {
      let recovered = false;
      const reported = reportAppError("Recovery test failure", {
        category: "reminder",
        recoveryLabel: "Try Again",
        onRecover: () => {
          recovered = true;
        },
      });

      assert.ok(reported !== null);
      assert.strictEqual(reported?.recoveryLabel, "Try Again");
      assert.ok(reported?.onRecover !== undefined);

      await reported?.onRecover?.();
      assert.strictEqual(recovered, true, "Recovery action must be callable");
    });
  });

  describe("Component & Layout Integrity", () => {
    it("verifies AppErrorBanner component structure and accessibility", () => {
      const bannerSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/common/AppErrorBanner.tsx"),
        "utf8"
      );

      assert.ok(bannerSrc.includes('role="alert"'), "Banner must have role='alert'");
      assert.ok(bannerSrc.includes('aria-live="assertive"'), "Banner must have aria-live='assertive'");
      assert.ok(bannerSrc.includes('id="bbq-error-dismiss-btn"'), "Must provide dismiss button with ID");
      assert.ok(bannerSrc.includes('id="bbq-error-recovery-btn"'), "Must provide recovery button with ID");
      assert.ok(bannerSrc.includes('typeof activeError.onRecover === "function"'), "Must guard recovery callback");
      assert.ok(bannerSrc.includes("escapeManager.register"), "Must handle Escape key dismissal");
      assert.ok(bannerSrc.includes("EscapePriority.DROPDOWN"), "Must dismiss error before closing HUD");
    });

    it("verifies IslandContent integrates AppErrorBanner at the top of the expanded island", () => {
      const islandContentSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/island/IslandContent.tsx"),
        "utf8"
      );

      assert.ok(islandContentSrc.includes("<AppErrorBanner"), "IslandContent must mount AppErrorBanner");
      assert.ok(islandContentSrc.includes("import { AppErrorBanner }"), "Must import AppErrorBanner");
    });

    it("verifies ErrorBoundary uses BBQ design tokens and honest reset wording", () => {
      const boundarySrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/ErrorBoundary.tsx"),
        "utf8"
      );

      assert.ok(boundarySrc.includes('id="bbq-error-boundary-retry-btn"'), "Must provide retry button");
      assert.ok(boundarySrc.includes("Reset View"), "Button must honestly offer Reset View without claiming lost state restoration");
      assert.ok(boundarySrc.includes("redactSensitiveDetails"), "Must sanitize error details");
      assert.ok(boundarySrc.includes('role="alert"'), "Must declare role='alert'");
      assert.ok(boundarySrc.includes("var(--bbq-surface-glass-expanded"), "Must use BBQ glassmorphism token");
    });

    it("verifies index.css styles and animations for error banner", () => {
      const cssSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf8"
      );

      assert.ok(cssSrc.includes(".bbq-app-error-banner"), "Must style .bbq-app-error-banner");
      assert.ok(cssSrc.includes("@keyframes bbq-error-slide-in"), "Must define brief entry animation");
      assert.ok(cssSrc.includes("prefers-reduced-motion"), "Must respect prefers-reduced-motion");
    });

    it("verifies zero-polling invariant in error subsystem", () => {
      const errorStateSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/state/errorState.ts"),
        "utf8"
      );

      assert.ok(!errorStateSrc.includes("setInterval"), "Strict zero-polling: no setInterval");
      assert.ok(!errorStateSrc.includes("requestAnimationFrame"), "Strict zero-polling: no continuous rAF");
      assert.ok(!errorStateSrc.includes("setTimeout"), "Strict zero-polling: no recursive setTimeout");
      assert.ok(!errorStateSrc.includes("fetch("), "No telemetry or external network calls");
    });
  });

  describe("macOS Distribution & Gatekeeper Hardening Audit", () => {
    it("verifies package-macos.sh manages temporary keychain, signed DMG creation, and release gating", () => {
      const scriptSrc = fs.readFileSync(
        path.join(ROOT_DIR, "scripts/package-macos.sh"),
        "utf8"
      );

      assert.ok(
        scriptSrc.includes("security create-keychain"),
        "Must import certificate into temporary keychain"
      );
      assert.ok(
        scriptSrc.includes("security delete-keychain"),
        "Must clean up temporary keychain securely on exit"
      );
      assert.ok(
        scriptSrc.includes("security find-identity"),
        "Must verify signing identity exists before signing"
      );
      assert.ok(
        scriptSrc.includes("--options runtime"),
        "Must specify Apple Hardened Runtime (--options runtime)"
      );
      assert.ok(
        scriptSrc.includes("hdiutil create"),
        "Must create DMG containing the signed application bundle"
      );
      assert.ok(
        scriptSrc.includes("notarytool submit"),
        "Must support xcrun notarytool submit for modern Apple notarization"
      );
      assert.ok(
        scriptSrc.includes("stapler staple"),
        "Must staple notarization ticket to DMG"
      );
      assert.ok(
        scriptSrc.includes("IS_RELEASE_BUILD"),
        "Must distinguish release builds from local development builds"
      );
      assert.ok(
        scriptSrc.includes("mac-arm64.dmg"),
        "Must produce standardized mac-arm64.dmg artifact"
      );
      assert.ok(
        scriptSrc.includes("CHECKSUMS_FILE"),
        "Must calculate SHA256 checksums from final published bytes"
      );
    });

    it("verifies CI workflow passes Apple secrets and specifies release build intent", () => {
      const ciSrc = fs.readFileSync(
        path.join(ROOT_DIR, ".github/workflows/ci.yml"),
        "utf8"
      );

      assert.ok(
        ciSrc.includes("APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}"),
        "CI must pass signing identity secret"
      );
      assert.ok(
        ciSrc.includes("APPLE_ID: ${{ secrets.APPLE_ID }}"),
        "CI must pass Apple ID secret"
      );
      assert.ok(
        ciSrc.includes("APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}"),
        "CI must pass Apple Team ID secret"
      );
      assert.ok(
        ciSrc.includes("BBQ_RELEASE_BUILD:"),
        "CI must declare BBQ_RELEASE_BUILD for tag and release workflow triggers"
      );
      assert.ok(
        ciSrc.includes("tauri build --bundles app --ci --no-sign"),
        "CI builds app bundle for packaging script to sign and package"
      );
      assert.ok(
        ciSrc.includes("bash scripts/package-macos.sh"),
        "CI must invoke package-macos.sh"
      );
    });

    it("verifies tauri.conf.json specifies macOS bundle minimum system version", () => {
      const confSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src-tauri/tauri.conf.json"),
        "utf8"
      );
      const conf = JSON.parse(confSrc);

      assert.ok(conf.bundle, "tauri.conf.json must have bundle config");
      assert.ok(conf.bundle.macOS, "tauri.conf.json must declare bundle.macOS");
      assert.strictEqual(
        conf.bundle.macOS.minimumSystemVersion,
        "10.15",
        "macOS minimumSystemVersion should be 10.15 (Catalina+)"
      );
    });

    it("verifies free-distribution unsigned mode support and honest Gatekeeper guidance", () => {
      const scriptSrc = fs.readFileSync(
        path.join(ROOT_DIR, "scripts/package-macos.sh"),
        "utf8"
      );
      const ciSrc = fs.readFileSync(
        path.join(ROOT_DIR, ".github/workflows/ci.yml"),
        "utf8"
      );
      const readmeSrc = fs.readFileSync(
        path.join(ROOT_DIR, "README.md"),
        "utf8"
      );
      const releaseDocSrc = fs.readFileSync(
        path.join(ROOT_DIR, "docs/RELEASE_PROCESS.md"),
        "utf8"
      );

      // 1. Script supports BBQ_ALLOW_UNSIGNED_MACOS and ad-hoc fallback
      assert.ok(
        scriptSrc.includes("BBQ_ALLOW_UNSIGNED_MACOS"),
        "package-macos.sh must support BBQ_ALLOW_UNSIGNED_MACOS"
      );
      assert.ok(
        scriptSrc.includes("Free Distribution Mode (Unsigned macOS build)"),
        "package-macos.sh must explicitly log Free Distribution Mode notice"
      );
      assert.ok(
        scriptSrc.includes("Skipping Apple Notarization (Unsigned free distribution mode)"),
        "package-macos.sh must log notarization skip notice"
      );
      assert.ok(
        scriptSrc.includes("xattr -d com.apple.quarantine"),
        "package-macos.sh must disclose Gatekeeper quarantine removal command"
      );

      // 2. CI workflow passes unsigned flag and implements platform-aware staging
      assert.ok(
        ciSrc.includes("BBQ_ALLOW_UNSIGNED_MACOS:"),
        "CI workflow must pass BBQ_ALLOW_UNSIGNED_MACOS to packaging script"
      );
      assert.ok(
        ciSrc.includes("Platform-aware staging: Windows x64"),
        "CI must stage Windows x64 artifacts independently"
      );
      assert.ok(
        ciSrc.includes("Platform-aware staging: macOS ARM64"),
        "CI must stage macOS ARM64 artifacts independently"
      );
      assert.ok(
        ciSrc.includes("macOS Gatekeeper Notice (Free Distribution)"),
        "CI must inject truthful Gatekeeper warnings into release notes"
      );

      // 3. Documentation truthfully explains Gatekeeper prompt and manual override
      assert.ok(
        readmeSrc.includes("Gatekeeper may prompt that the developer cannot be verified"),
        "README must honestly disclose Gatekeeper prompt"
      );
      assert.ok(
        releaseDocSrc.includes("Free Distribution Mode & Platform Independence"),
        "RELEASE_PROCESS must document free distribution mode"
      );
    });
  });
});
