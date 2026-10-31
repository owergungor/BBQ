import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  updaterStore,
  initialUpdaterState,
  checkForUpdates,
  downloadAndInstallUpdate,
  resetUpdaterState,
  openUpdateModal,
  closeUpdateModal,
  setSimulatedUpdater,
  isUpdateAvailable,
} from "../src/state/updaterState.ts";
import { APP_VERSION } from "../src/version.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");
const DESKTOP_DIR = path.resolve(__dirname, "..");

describe("BBQ v3.6 — Step 2: Redesigned Update Settings & Custom BBQ Update UI", () => {
  beforeEach(() => {
    resetUpdaterState();
    setSimulatedUpdater(null);
  });

  // =========================================================================
  // 1. Update Settings Layout & Compact Architecture
  // =========================================================================
  describe("1. Update Settings Redesign Layout", () => {
    const updateTabPath = path.join(DESKTOP_DIR, "src/components/widgets/settings/UpdateSettingsTab.tsx");
    const updateTabSrc = fs.readFileSync(updateTabPath, "utf-8");

    it("verifies UpdateSettingsTab renders compact single-container layout with bounded gaps", () => {
      assert.ok(updateTabSrc.includes('id="settings-update-tab-panel"'), "Must define settings-update-tab-panel");
      assert.ok(updateTabSrc.includes('gap: "8px"'), "Must use compact 8px gap");
      assert.ok(updateTabSrc.includes('padding: "8px 12px"'), "Must use compact 8px 12px card padding");
      assert.ok(updateTabSrc.includes('id="settings-check-updates-btn"'), "Must have check updates button");
      assert.ok(updateTabSrc.includes('id="settings-view-releases-btn"'), "Must have view releases button");
    });

    it("verifies buttons use rounded pills with borderRadius 9999px", () => {
      assert.ok(updateTabSrc.includes('borderRadius: "9999px"'), "Buttons must use rounded 9999px pill geometry");
    });
  });

  // =========================================================================
  // 2. Removal of Update Controls from About Tab
  // =========================================================================
  describe("2. About Tab Cleanliness & Complete Update Row Removal", () => {
    const aboutTabPath = path.join(DESKTOP_DIR, "src/components/widgets/settings/AboutSettingsTab.tsx");
    const aboutTabSrc = fs.readFileSync(aboutTabPath, "utf-8");

    it("ensures About tab contains zero update shortcuts, sections, or update hooks", () => {
      assert.strictEqual(
        aboutTabSrc.includes("settings-updater-section"),
        false,
        "About tab must not include settings-updater-section"
      );
      assert.strictEqual(
        aboutTabSrc.includes("useUpdaterState"),
        false,
        "About tab must not import or invoke useUpdaterState"
      );
      assert.strictEqual(
        aboutTabSrc.includes("setTargetSettingsTab"),
        false,
        "About tab must not import setTargetSettingsTab"
      );
    });
  });

  // =========================================================================
  // 3. Custom BBQ Update Modal Architecture & Accessibility
  // =========================================================================
  describe("3. Custom BBQ Update Modal Architecture & Accessibility", () => {
    const modalPath = path.join(DESKTOP_DIR, "src/components/updater/UpdateModal.tsx");
    const islandPath = path.join(DESKTOP_DIR, "src/components/island/Island.tsx");
    const cssPath = path.join(DESKTOP_DIR, "src/styles/index.css");

    const modalSrc = fs.readFileSync(modalPath, "utf-8");
    const islandSrc = fs.readFileSync(islandPath, "utf-8");
    const cssSrc = fs.readFileSync(cssPath, "utf-8");

    it("verifies UpdateModal defines role=dialog, aria-modal=true, and accessible title", () => {
      assert.ok(modalSrc.includes('role="dialog"'), "UpdateModal must declare role=dialog");
      assert.ok(modalSrc.includes('aria-modal="true"'), "UpdateModal must declare aria-modal=true");
      assert.ok(modalSrc.includes('aria-labelledby="bbq-update-modal-title"'), "UpdateModal must link title label");
    });

    it("verifies modal renders inside BBQ island container above existing UI", () => {
      assert.ok(islandSrc.includes("<UpdateModal"), "Island.tsx must mount UpdateModal");
      assert.ok(islandSrc.includes("isUpdateModalOpen"), "Island.tsx must conditionally display UpdateModal");
    });

    it("verifies backdrop blocks background interactions and uses theme-aware surface tokens", () => {
      assert.ok(cssSrc.includes(".bbq-update-modal-backdrop"), "CSS must define .bbq-update-modal-backdrop");
      assert.ok(cssSrc.includes(".bbq-update-modal-card"), "CSS must define .bbq-update-modal-card");
      assert.ok(cssSrc.includes('[data-theme="light"] .bbq-update-modal-card'), "CSS must support light theme");
      assert.ok(cssSrc.includes('[data-reduced-transparency="true"] .bbq-update-modal-backdrop'), "CSS must respect reduced transparency");
      assert.ok(cssSrc.includes('[data-reduced-motion="true"] .bbq-update-modal-progress-bar-fill'), "CSS must respect reduced motion");
    });

    it("ensures no browser native dialogs (alert, confirm, prompt) or drop-shadow are used", () => {
      assert.strictEqual(/\balert\(/.test(modalSrc), false, "Must not use window.alert");
      assert.strictEqual(/\bconfirm\(/.test(modalSrc), false, "Must not use window.confirm");
      assert.strictEqual(/\bprompt\(/.test(modalSrc), false, "Must not use window.prompt");
      assert.strictEqual(modalSrc.includes("drop-shadow"), false, "Must not use drop-shadow()");
    });

    it("verifies hit-testing defenses: header close button, context menu isolation, and click-outside protection", () => {
      assert.ok(modalSrc.includes("updater-modal-header-close-btn"), "Modal must have accessible header close button");
      assert.ok(modalSrc.includes("onContextMenu"), "Modal card and backdrop must stop context menu propagation");
      assert.ok(islandSrc.includes("#bbq-update-modal-backdrop"), "Island click outside must ignore modal backdrop");
      assert.ok(islandSrc.includes(".bbq-update-modal-card"), "Island click outside must ignore modal card");
    });
  });

  // =========================================================================
  // 4. Update State Machine & Transitions
  // =========================================================================
  describe("4. Deterministic Update State Machine & Transition Invariants", () => {
    it("transitions idle -> checking -> up_to_date when no update is available", async () => {
      setSimulatedUpdater({ mockAvailableVersion: null });
      assert.equal(updaterStore.getState().status, "idle");

      const hasUpdate = await checkForUpdates();
      assert.equal(hasUpdate, false);
      assert.equal(updaterStore.getState().status, "up_to_date");
      assert.equal(updaterStore.getState().availableVersion, null);
    });

    it("transitions idle -> checking -> update_available when remote version is higher", async () => {
      setSimulatedUpdater({
        mockAvailableVersion: "4.2.0",
        mockReleaseNotes: "Exciting v4.2 features",
      });

      const hasUpdate = await checkForUpdates();
      assert.equal(hasUpdate, true);
      assert.equal(updaterStore.getState().status, "update_available");
      assert.equal(updaterStore.getState().availableVersion, "4.2.0");
      assert.equal(updaterStore.getState().releaseNotes, "Exciting v4.2 features");
    });

    it("transitions available -> downloading -> installing -> success during install", async () => {
      setSimulatedUpdater({
        mockAvailableVersion: "4.2.0",
        downloadDurationMs: 40,
      });

      await checkForUpdates();
      assert.equal(updaterStore.getState().status, "update_available");

      const installPromise = downloadAndInstallUpdate();
      assert.equal(updaterStore.getState().status, "downloading");

      const success = await installPromise;
      assert.equal(success, true);
      assert.equal(updaterStore.getState().status, "success");
    });

    it("transitions checking/downloading -> error safely on failure without leaking credentials", async () => {
      setSimulatedUpdater({
        simulateFailure: "network",
      });

      const success = await checkForUpdates();
      assert.equal(success, false);
      assert.equal(updaterStore.getState().status, "error");
      assert.ok(updaterStore.getState().error, "Error message must be set");
      assert.strictEqual(updaterStore.getState().error?.includes("password"), false);
      assert.strictEqual(updaterStore.getState().error?.includes("Bearer"), false);
    });

    it("prevents duplicate concurrent update operations", async () => {
      setSimulatedUpdater({
        mockAvailableVersion: "4.2.0",
        downloadDurationMs: 60,
      });

      await checkForUpdates();

      const p1 = downloadAndInstallUpdate();
      const p2 = downloadAndInstallUpdate(); // Concurrent attempt should be blocked

      const r2 = await p2;
      assert.equal(r2, false, "Second concurrent download request must be rejected");

      const r1 = await p1;
      assert.equal(r1, true);
    });

    it("manages modal open/close lifecycle and prevents dismissal during active download", async () => {
      openUpdateModal();
      assert.equal(updaterStore.getState().isModalOpen, true);

      const closed = closeUpdateModal();
      assert.equal(closed, true);
      assert.equal(updaterStore.getState().isModalOpen, false);

      // Set downloading status
      updaterStore.setState({ status: "downloading" });
      const cannotClose = closeUpdateModal();
      assert.equal(cannotClose, false, "Should refuse closing while download is in-flight");
      assert.equal(updaterStore.getState().isModalOpen, false);
    });
  });

  // =========================================================================
  // 5. Localization Key Parity
  // =========================================================================
  describe("5. Localization Parity Across All 5 Supported Locales", () => {
    const LOCALES = ["en", "es", "fr", "de", "tr"];

    function extractKeys(obj: any, prefix = ""): string[] {
      let keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          keys = keys.concat(extractKeys(v, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    it("verifies 100% key parity between en.json and all other supported locales for updater keys", () => {
      const enContent = JSON.parse(
        fs.readFileSync(path.join(DESKTOP_DIR, "src/i18n/locales/en.json"), "utf-8")
      );
      const enUpdaterKeys = extractKeys(enContent.updater, "updater");

      for (const loc of LOCALES) {
        const locContent = JSON.parse(
          fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`), "utf-8")
        );
        const locKeys = new Set(extractKeys(locContent.updater, "updater"));
        const missing = enUpdaterKeys.filter((k) => !locKeys.has(k));

        assert.strictEqual(
          missing.length,
          0,
          `Locale ${loc}.json is missing updater keys: ${missing.join(", ")}`
        );
      }
    });
  });

  // =========================================================================
  // 6. Modal Hit-Testing, Geometry Bounds & Event Isolation
  // =========================================================================
  describe("6. Modal Hit-Testing, Geometry Bounds & Event Isolation", () => {
    const modalPath = path.join(DESKTOP_DIR, "src/components/updater/UpdateModal.tsx");
    const islandPath = path.join(DESKTOP_DIR, "src/components/island/Island.tsx");
    const cssPath = path.join(DESKTOP_DIR, "src/styles/index.css");

    const modalSrc = fs.readFileSync(modalPath, "utf-8");
    const islandSrc = fs.readFileSync(islandPath, "utf-8");
    const cssSrc = fs.readFileSync(cssPath, "utf-8");

    it("verifies all modal interactive controls define accessible IDs and click handlers", () => {
      assert.ok(modalSrc.includes('id="updater-modal-header-close-btn"'), "Must have header close button");
      assert.ok(modalSrc.includes('id="updater-modal-close-btn"'), "Must have footer close/cancel button");
      assert.ok(modalSrc.includes('id="updater-install-btn"'), "Must have install button");
      assert.ok(modalSrc.includes('id="updater-restart-btn"'), "Must have restart button");
      assert.ok(modalSrc.includes('id="updater-modal-retry-btn"'), "Must have retry button");
    });

    it("verifies backdrop and modal card stop context menu propagation to prevent Island menu overlap", () => {
      assert.ok(modalSrc.includes('onContextMenu={(e) => e.stopPropagation()}'), "Modal elements must isolate context menu");
    });

    it("verifies Island dynamic height expands to at least 300px when update modal is active", () => {
      assert.ok(islandSrc.includes("isUpdateModalOpen ? 300 : 200"), "Island dynamic height must accommodate update modal");
    });

    it("verifies modal card bounds are defensive and fit comfortably inside Island shell", () => {
      assert.ok(cssSrc.includes("max-width: calc(100% - 24px)"), "Modal card max-width must be bounded");
      assert.ok(cssSrc.includes("max-height: calc(100% - 24px)"), "Modal card max-height must be bounded");
      assert.ok(cssSrc.includes("overflow-y: auto"), "Modal card must support scrolling for long content");
    });

    it("verifies Move HUD pointer down handler guards against dragging while interacting with update modal", () => {
      assert.ok(islandSrc.includes("#bbq-update-modal-backdrop"), "Move HUD pointerdown must ignore modal backdrop");
      assert.ok(islandSrc.includes(".bbq-update-modal-card"), "Move HUD pointerdown must ignore modal card");
    });
  });
});
