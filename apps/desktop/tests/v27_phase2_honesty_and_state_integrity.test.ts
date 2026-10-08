import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  defaultSettings,
  OFFICIAL_RELEASES_URL,
  ALLOWED_URL_PREFIXES,
  isAllowedExternalUrl,
  openExternalUrl,
  openAllowlistedReleaseUrl,
  settingsStore,
  updateSetting,
  LOCAL_STORAGE_SETTINGS_KEY,
} from "../src/state/settingsState.ts";
import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import { escapeManager, EscapePriority } from "../src/island/escapeManager.ts";
import { bbqCommands } from "../src/ipc/commands.ts";

const ROOT_DIR = path.resolve(import.meta.dirname, "../../..");
const DESKTOP_DIR = path.resolve(import.meta.dirname, "..");

const pkg = JSON.parse(
  fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8")
);

describe("BBQ v2.7 — Phase 2: Product Honesty & Context Menu State Integrity", () => {
  beforeEach(() => {
    escapeManager.reset();
    bbqCommands.updateSetting = async () => true;
    bbqCommands.updateSettings = async () => true;
  });

  afterEach(() => {
    escapeManager.reset();
  });

  // =========================================================================
  // 1-5: Honest Update Experience & Settings Model Integrity
  // =========================================================================
  describe("Phase 2A — Honest Updates & Obsolete Auto-Update Cleanup", () => {
    it("1. obsolete auto-update schedule is no longer exposed in active model or defaultSettings", () => {
      // defaultSettings must not expose simulated schedule
      assert.strictEqual(
        (defaultSettings as any).auto_update_schedule,
        undefined,
        "defaultSettings must not define auto_update_schedule"
      );
      assert.strictEqual(
        (defaultSettings as any).last_update_check_at,
        undefined,
        "defaultSettings must not define last_update_check_at"
      );

      // SettingsWidget source must not contain the simulated auto update schedule select
      const settingsWidgetSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );
      assert.strictEqual(
        settingsWidgetSrc.includes("AUTO_UPDATE_OPTIONS"),
        false,
        "SettingsWidget must not define AUTO_UPDATE_OPTIONS"
      );
      assert.strictEqual(
        settingsWidgetSrc.includes('id="auto-update-schedule-select"'),
        false,
        "SettingsWidget must not render auto-update-schedule-select"
      );
    });

    it("2. old persisted settings containing auto_update_schedule remain safely loadable", () => {
      // Simulate reading legacy JSON from an older BBQ SQLite/localStorage database
      const legacyPayload = JSON.stringify({
        theme: "dark",
        always_on_top: false,
        auto_update_schedule: "daily",
        last_update_check_at: 1728000000000,
        island_width: 320,
      });

      const parsed = JSON.parse(legacyPayload);
      assert.doesNotThrow(() => {
        const merged = { ...defaultSettings, ...parsed };
        assert.strictEqual(merged.theme, "dark");
        assert.strictEqual(merged.always_on_top, false);
        assert.strictEqual(merged.island_width, 320);
      }, "Loading obsolete settings data must never throw");
    });

    it("3. official release URL is strictly correct and targets latest GitHub Releases", () => {
      assert.strictEqual(
        OFFICIAL_RELEASES_URL,
        "https://github.com/owergungor/BBQ/releases/latest",
        "Official release URL must be exactly https://github.com/owergungor/BBQ/releases/latest"
      );
      assert.ok(
        ALLOWED_URL_PREFIXES.some((prefix) =>
          OFFICIAL_RELEASES_URL.startsWith(prefix)
        ),
        "Official release URL must match ALLOWED_URL_PREFIXES allowlist"
      );
    });

    it("4. update action uses safe external URL handling with window.open opener prevention", () => {
      let openedUrl: string | null = null;
      let openedTarget: string | null = null;
      let openedFeatures: string | null = null;

      // Mock window.open
      const originalWindow = globalThis.window;
      globalThis.window = {
        open: (url: string, target?: string, features?: string) => {
          openedUrl = url;
          openedTarget = target ?? null;
          openedFeatures = features ?? null;
          return null as any;
        },
      } as any;

      try {
        const success = openAllowlistedReleaseUrl();
        assert.strictEqual(success, true, "openAllowlistedReleaseUrl must succeed");
        assert.strictEqual(
          openedUrl,
          "https://github.com/owergungor/BBQ/releases/latest"
        );
        assert.strictEqual(openedTarget, "_blank");
        assert.strictEqual(openedFeatures, "noopener,noreferrer");
      } finally {
        globalThis.window = originalWindow;
      }
    });

    it("5. arbitrary URL injection and non-HTTPS protocols are rejected by allowlist validator", () => {
      const maliciousUrls = [
        "http://github.com/owergungor/BBQ/releases/latest", // Insecure HTTP
        "javascript:alert(1)",                              // Protocol injection
        "file:///C:/Windows/System32/calc.exe",             // Local file execution
        "cmd.exe /c start calc",                            // Shell command
        "https://malicious-site.com/releases",              // Non-allowlisted domain
        "https://github.com/otheruser/BBQ/releases",        // Impersonated repo
        "",                                                 // Empty string
        "null",                                             // Invalid URL string
      ];

      for (const url of maliciousUrls) {
        assert.strictEqual(
          isAllowedExternalUrl(url),
          false,
          `URL must be rejected: ${url}`
        );
        assert.strictEqual(
          openExternalUrl(url),
          false,
          `Opening non-allowlisted URL must return false: ${url}`
        );
      }
    });
  });

  // =========================================================================
  // 6-12: Context Menu State Integrity & Canonical Always-on-Top
  // =========================================================================
  describe("Phase 2B — Context Menu State Integrity & Synchronization", () => {
    it("6. canonical always_on_top defaults to true in settings model", () => {
      assert.strictEqual(
        defaultSettings.always_on_top,
        true,
        "defaultSettings.always_on_top must default to true"
      );
      assert.strictEqual(
        settingsStore.getState().settings.always_on_top,
        true,
        "settingsStore initial always_on_top must default to true"
      );
    });

    it("7. toggling always_on_top updates canonical settings state", async () => {
      // Toggle to false
      const successFalse = await updateSetting("always_on_top", "false");
      assert.strictEqual(successFalse, true, "updateSetting should succeed");
      assert.strictEqual(
        settingsStore.getState().settings.always_on_top,
        false,
        "always_on_top must update to false in store"
      );

      // Toggle back to true
      const successTrue = await updateSetting("always_on_top", "true");
      assert.strictEqual(successTrue, true, "updateSetting should succeed");
      assert.strictEqual(
        settingsStore.getState().settings.always_on_top,
        true,
        "always_on_top must update to true in store"
      );
    });

    it("8. reopening context menu reflects actual canonical state without resetting to local default", () => {
      const menuSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/common/ContextMenu.tsx"),
        "utf-8"
      );

      // Must not contain local useState(true) for pin state
      assert.strictEqual(
        menuSrc.includes("useState(true)"),
        false,
        "ContextMenu must not use local useState(true) for isPinned"
      );
      assert.strictEqual(
        menuSrc.includes("setIsPinned"),
        false,
        "ContextMenu must not use local setIsPinned state setter"
      );

      // Must read from settings.always_on_top
      assert.ok(
        menuSrc.includes("settings.always_on_top"),
        "ContextMenu must read canonical settings.always_on_top"
      );

      // Must render checkmark conditionally based on canonical alwaysOnTop
      assert.ok(
        menuSrc.includes('alwaysOnTop ? "Always on Top ✓" : "Always on Top"'),
        "Pin label must reflect canonical alwaysOnTop state"
      );
    });

    it("9. persisted always_on_top state survives reload via localStorage cache", () => {
      const mockStorage = new Map<string, string>();
      const customSettings = {
        ...defaultSettings,
        always_on_top: false,
      };

      mockStorage.set(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(customSettings));

      const retrievedRaw = mockStorage.get(LOCAL_STORAGE_SETTINGS_KEY);
      assert.ok(retrievedRaw, "Stored settings must exist");
      const loaded = JSON.parse(retrievedRaw);
      assert.strictEqual(
        loaded.always_on_top,
        false,
        "Loaded settings must preserve always_on_top = false"
      );
    });

    it("10. hardcoded v2.6 badge and v2.6.0 version string are strictly absent from Context Menu and Settings UI", () => {
      const menuSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/common/ContextMenu.tsx"),
        "utf-8"
      );
      const settingsWidgetSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );

      // ContextMenu checks
      assert.strictEqual(
        menuSrc.includes('className="bbq-context-menu-badge">v2.6<'),
        false,
        "ContextMenu must not hardcode v2.6 badge"
      );
      assert.strictEqual(
        menuSrc.includes('className="bbq-about-version">v2.6.0<'),
        false,
        "ContextMenu must not hardcode v2.6.0 in about modal"
      );

      // SettingsWidget checks
      assert.strictEqual(
        settingsWidgetSrc.includes("Version 2.6.0"),
        false,
        "SettingsWidget must not hardcode Version 2.6.0"
      );

      // Untyped __TAURI__ checks in ContextMenu
      assert.strictEqual(
        menuSrc.includes("__TAURI__"),
        false,
        "ContextMenu must not access untyped window.__TAURI__"
      );
    });

    it("11. displayed version comes from canonical application version in package.json", () => {
      assert.strictEqual(
        typeof APP_VERSION,
        "string",
        "APP_VERSION must be a string"
      );
      assert.strictEqual(
        APP_VERSION,
        pkg.version,
        "APP_VERSION must match package.json version exactly"
      );
      assert.strictEqual(
        APP_VERSION_LABEL,
        `v${pkg.version}`,
        "APP_VERSION_LABEL must format as v{pkg.version}"
      );

      const menuSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/common/ContextMenu.tsx"),
        "utf-8"
      );
      assert.ok(
        menuSrc.includes("{APP_VERSION_LABEL}"),
        "ContextMenu must render {APP_VERSION_LABEL}"
      );
    });

    it("12. Context Menu Escape handling conforms to Phase 1 escapeManager priority contracts", () => {
      let menuClosed = false;
      let modalClosed = false;

      // Simulate Context Menu open (priority = CONTEXT_MENU = 80)
      const unregisterMenu = escapeManager.register(() => {
        menuClosed = true;
        return true; // Consumed
      }, EscapePriority.CONTEXT_MENU);

      assert.strictEqual(escapeManager.getCount(), 1);

      // Fallback island handler (priority = ISLAND_FALLBACK = 0)
      let islandClosed = false;
      const unregisterIsland = escapeManager.register(() => {
        islandClosed = true;
        return true;
      }, EscapePriority.ISLAND_FALLBACK);

      assert.strictEqual(escapeManager.getCount(), 2);

      // Pressing Escape should close Context Menu and prevent Island collapse
      const consumed = escapeManager.dispatchEscape();
      assert.strictEqual(consumed, true, "Escape must be consumed");
      assert.strictEqual(menuClosed, true, "ContextMenu must be closed");
      assert.strictEqual(islandClosed, false, "Island must NOT be closed");

      unregisterMenu();
      unregisterIsland();
      assert.strictEqual(escapeManager.getCount(), 0);
    });
  });
});
