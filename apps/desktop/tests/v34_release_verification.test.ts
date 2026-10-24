import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const DESKTOP_DIR = path.resolve(__dirname, "..");

describe("BBQ v3.4 — Release Verification & Feature Suite", () => {
  // =========================================================================
  // 1. Version and Release Rules Verification
  // =========================================================================
  describe("1. Version and Release Rules", () => {
    it("verifies public version is strictly 3.4, 3.5, 3.6, or 3.7 across all manifests", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));

      assert.ok(rootPkg.version === "3.7" || rootPkg.version === "3.6" || rootPkg.version === "3.5" || rootPkg.version === "3.4", "Root package.json version must be strictly 3.7, 3.6, 3.5 or 3.4");
      assert.ok(desktopPkg.version === "3.7" || desktopPkg.version === "3.6" || desktopPkg.version === "3.5" || desktopPkg.version === "3.4", "apps/desktop/package.json version must be strictly 3.7, 3.6, 3.5 or 3.4");
      assert.ok(typesPkg.version === "3.7" || typesPkg.version === "3.6" || typesPkg.version === "3.5" || typesPkg.version === "3.4", "packages/types/package.json version must be strictly 3.7, 3.6, 3.5 or 3.4");
      assert.ok(APP_VERSION === "3.7" || APP_VERSION === "3.6" || APP_VERSION === "3.5" || APP_VERSION === "3.4", "APP_VERSION must be strictly 3.7, 3.6, 3.5 or 3.4");
      assert.ok(APP_VERSION_LABEL === "v3.7" || APP_VERSION_LABEL === "v3.6" || APP_VERSION_LABEL === "v3.5" || APP_VERSION_LABEL === "v3.4", "APP_VERSION_LABEL must be strictly v3.7, v3.6, v3.5 or v3.4");
    });

    it("verifies internal toolchain version is normalized to 3.4.0, 3.5.0, 3.6.0, or 3.7.0 in Cargo & Tauri", () => {
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.ok(tauriConf.version === "3.7.0" || tauriConf.version === "3.6.0" || tauriConf.version === "3.5.0" || tauriConf.version === "3.4.0", "tauri.conf.json must declare 3.7.0, 3.6.0, 3.5.0 or 3.4.0 for SemVer compliance");
      assert.ok(desktopCargo.includes('version = "3.7.0"') || desktopCargo.includes('version = "3.6.0"') || desktopCargo.includes('version = "3.5.0"') || desktopCargo.includes('version = "3.4.0"'), "Desktop Cargo.toml must declare SemVer");
      assert.ok(
        cargoLock.includes('name = "bbq-desktop"\nversion = "3.7.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.7.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.6.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.6.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.5.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.5.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.4.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.4.0"'),
        "Cargo.lock must resolve bbq-desktop to 3.7.0, 3.6.0, 3.5.0 or 3.4.0"
      );
    });
  });

  // =========================================================================
  // 2. Auto-Collapse Focus Guard
  // =========================================================================
  describe("2. Auto-Collapse Focus Guard", () => {
    const runtimeSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/island/IslandRuntime.ts"), "utf-8");

    it("verifies auto-collapse focus guard inspects active elements and avoids destructive collapse", () => {
      assert.ok(
        runtimeSrc.includes("isFocusOrOverlayActive"),
        "IslandRuntime must declare isFocusOrOverlayActive check"
      );
      assert.ok(
        runtimeSrc.includes("focusout"),
        "IslandRuntime must attach focusout listener to resume auto-collapse when focus moves away"
      );
      assert.ok(
        !runtimeSrc.includes("isDeliberateExpanded"),
        "IslandRuntime must not use broken global isDeliberateExpanded bypass"
      );
    });

    it("ensures Escape key collapses regardless of focus state", () => {
      assert.ok(
        runtimeSrc.includes("USER_ESCAPE"),
        "IslandRuntime must handle USER_ESCAPE transition"
      );
    });
  });

  // =========================================================================
  // 3. Move HUD / Reset Position Discoverability
  // =========================================================================
  describe("3. Move HUD / Reset Position Discoverability", () => {
    const contextMenuSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/common/ContextMenu.tsx"), "utf-8");
    const islandSettingsSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"), "utf-8");
    const settingsWidgetSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"), "utf-8");

    it("verifies reset island position is accessible in ContextMenu and disarms Move HUD", () => {
      assert.ok(
        contextMenuSrc.includes('id: "reset_position"'),
        "ContextMenu must provide reset_position action"
      );
      assert.ok(
        contextMenuSrc.includes("resetIslandPosition()"),
        "ContextMenu must invoke bbqCommands.resetIslandPosition()"
      );
      assert.ok(
        contextMenuSrc.includes('updateSetting("move_hud", "false")'),
        "ContextMenu must disarm move_hud on reset"
      );
    });

    it("verifies IslandSettingsTab provides dedicated button to reset position to screen default", () => {
      assert.ok(
        islandSettingsSrc.includes('id="btn-reset-island-position"'),
        "IslandSettingsTab must render btn-reset-island-position"
      );
      assert.ok(
        settingsWidgetSrc.includes("onResetPosition={handleResetIslandPosition}"),
        "SettingsWidget must wire onResetPosition handler to IslandSettingsTab"
      );
    });
  });

  // =========================================================================
  // 4. Zero Window.confirm Audit
  // =========================================================================
  describe("4. Zero Native window.confirm Audit", () => {
    it("ensures no window.confirm calls exist in frontend src", () => {
      const srcDir = path.join(DESKTOP_DIR, "src");
      function scanDir(dir: string): string[] {
        const results: string[] = [];
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results.push(...scanDir(fullPath));
          } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes("window.confirm(") || content.includes("confirm(")) {
              // Ignore harmless word matches if not window confirm
              if (/window\.confirm\s*\(/.test(content)) {
                results.push(fullPath);
              }
            }
          }
        }
        return results;
      }

      const violatingFiles = scanDir(srcDir);
      assert.deepStrictEqual(violatingFiles, [], `No native window.confirm allowed in frontend: ${violatingFiles.join(", ")}`);
    });

    it("ensures PrivacySettingsTab provides accessible inline confirmation dialog", () => {
      const privacySrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/widgets/settings/PrivacySettingsTab.tsx"), "utf-8");
      assert.ok(privacySrc.includes('role="alertdialog"'), "Inline confirmation must declare role=alertdialog");
      assert.ok(privacySrc.includes('e.key === "Escape"'), "Inline confirmation must handle Escape to cancel");
    });
  });

  // =========================================================================
  // 5. Settings Tab Overflow & Tooltip Boundary Clamping
  // =========================================================================
  describe("5. Settings Tab Overflow & Tooltip Clamping", () => {
    const cssSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");

    it("ensures tablist uses responsive flex layout with visible overflow for floating tooltips", () => {
      assert.ok(cssSrc.includes(".bbq-settings-tablist"), ".bbq-settings-tablist must be styled");
      assert.ok(cssSrc.includes("justify-content: space-between"), "Tablist must distribute tabs evenly");
      assert.ok(cssSrc.includes(".bbq-settings-tab-btn"), ".bbq-settings-tab-btn must be styled");
      assert.ok(cssSrc.includes("flex: 1 1 0"), "Tab buttons must flex evenly");
    });

    it("ensures tooltip edge clamping prevents horizontal clipping on start and end tabs", () => {
      assert.ok(
        cssSrc.includes(".bbq-settings-tab-btn:first-child .bbq-tab-tooltip"),
        "First child tab tooltip must have edge-clamped position"
      );
      assert.ok(
        cssSrc.includes(".bbq-settings-tab-btn:last-child .bbq-tab-tooltip"),
        "Last child tab tooltip must have edge-clamped position"
      );
    });
  });

  // =========================================================================
  // 6. Universal Localization & Locale Parity
  // =========================================================================
  describe("6. Universal Localization & Key Parity", () => {
    const locales = ["en", "de", "es", "fr", "tr"];
    const localeMaps: Record<string, Record<string, unknown>> = {};

    function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
      let keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          keys.push(...flattenKeys(v as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    for (const loc of locales) {
      const filePath = path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`);
      localeMaps[loc] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    it("maintains 100% key parity across all 5 locales with zero missing keys", () => {
      const enKeys = new Set(flattenKeys(localeMaps.en));

      for (const loc of ["de", "es", "fr", "tr"]) {
        const targetKeys = new Set(flattenKeys(localeMaps[loc]));

        const missing = [...enKeys].filter((k) => !targetKeys.has(k));
        const extra = [...targetKeys].filter((k) => !enKeys.has(k));

        assert.strictEqual(
          missing.length,
          0,
          `Locale ${loc} is missing ${missing.length} keys: ${missing.slice(0, 5).join(", ")}`
        );
        assert.strictEqual(
          extra.length,
          0,
          `Locale ${loc} has ${extra.length} extra keys: ${extra.slice(0, 5).join(", ")}`
        );
      }
    });

    it("verifies v3.4 newly introduced localization keys exist in all locales", () => {
      const requiredKeys = [
        "settings.island.positionResetSuccess",
        "settings.savedNotice",
        "compact.reminder",
        "compact.reminders",
        "shell.ariaLabel",
      ];

      for (const loc of locales) {
        const allKeys = new Set(flattenKeys(localeMaps[loc]));
        for (const reqKey of requiredKeys) {
          assert.ok(
            allKeys.has(reqKey),
            `Locale ${loc} must contain key ${reqKey}`
          );
        }
      }
    });
  });

  // =========================================================================
  // 7. Polling Prohibition & Zero Timer Churn
  // =========================================================================
  describe("7. Polling Prohibition & Zero-Timer Discipline", () => {
    it("ensures no continuous polling patterns exist in runtime or widgets", () => {
      const filesToCheck = [
        "src/island/IslandRuntime.ts",
        "src/components/island/IslandShell.tsx",
        "src/components/island/CompactIndicators.tsx",
        "src/components/widgets/SettingsWidget.tsx",
        "src/components/common/ContextMenu.tsx",
      ];

      for (const file of filesToCheck) {
        const content = fs.readFileSync(path.join(DESKTOP_DIR, file), "utf-8");
        assert.ok(!content.includes("setInterval("), `${file} must not contain setInterval polling`);
        assert.ok(!content.includes("requestAnimationFrame("), `${file} must not contain requestAnimationFrame loop`);
      }
    });
  });
});
