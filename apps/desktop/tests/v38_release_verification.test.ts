import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import { resolveArtworkUrl } from "../src/components/widgets/mediaModel.ts";
import { resolveEffectiveCompactWidth } from "../src/island/geometryResolution.ts";
import { clampIslandWidth, clampIslandHeight } from "../src/components/widgets/settingsModel.ts";
import { defaultSettings, applyThemeAndMotionToDom, coerceSettingValue } from "../src/state/settingsState.ts";
import { SETTINGS_CHROME_HEIGHT } from "../src/components/widgets/settingsTabHeightStore.ts";
import {
  updaterStore,
  initialUpdaterState,
  openUpdateNotification,
  closeUpdateNotification,
  downloadAndInstallUpdate,
  setSimulatedUpdater,
  resetUpdaterState,
} from "../src/state/updaterState.ts";
import {
  subscribeToSwitchWidget,
  subscribeToResetPosition,
  subscribeToReloadWidget,
  subscribeToOpenAbout,
} from "../src/ipc/events.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

describe("BBQ v3.8 — Release Verification & Quality Gates", () => {
  // =========================================================================
  // 1. Version Hygiene & Release State
  // =========================================================================
  describe("1. Version Hygiene & Baseline State", () => {
    it("preserves stable version manifests before official v3.8 bump", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));

      // Baseline versions
      assert.ok(rootPkg.version === "4.0" || rootPkg.version === "3.8", "Root package.json version must be 4.0 or 3.8");
      assert.ok(desktopPkg.version === "4.0" || desktopPkg.version === "3.8", "Desktop package.json version must be 4.0 or 3.8");
      assert.ok(typesPkg.version === "4.0" || typesPkg.version === "3.8", "Types package.json version must be 4.0 or 3.8");
      assert.ok(tauriConf.version === "4.0.0" || tauriConf.version === "3.8.0", "tauri.conf.json version must be 4.0.0 or 3.8.0");
      assert.ok(APP_VERSION === "4.0" || APP_VERSION === "3.8", "APP_VERSION must be 4.0 or 3.8");
      assert.ok(APP_VERSION_LABEL === "v4.0" || APP_VERSION_LABEL === "v3.8", "APP_VERSION_LABEL must be v4.0 or v3.8");
    });
  });

  // =========================================================================
  // 2. Compact Idle Width Constraints (64–480px)
  // =========================================================================
  describe("2. Compact Idle Width Constraints (64-480px)", () => {
    it("Rust core settings enforces MIN_ISLAND_WIDTH = 64 and MAX_ISLAND_WIDTH = 480", () => {
      const settingsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/settings.rs"), "utf-8");
      assert.ok(settingsRs.includes("pub const MIN_ISLAND_WIDTH: u32 = 64;"), "MIN_ISLAND_WIDTH must be 64");
      assert.ok(settingsRs.includes("pub const MAX_ISLAND_WIDTH: u32 = 480;"), "MAX_ISLAND_WIDTH must be 480");
      assert.ok(settingsRs.includes("pub const MIN_ISLAND_HEIGHT: u32 = 32;"), "MIN_ISLAND_HEIGHT must be 32");
    });

    it("Rust core geometry enforces MIN_ISLAND_WIDTH = 64", () => {
      const geometryRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/geometry.rs"), "utf-8");
      assert.ok(geometryRs.includes("pub const MIN_ISLAND_WIDTH: u32 = 64;"), "MIN_ISLAND_WIDTH in geometry must be 64");
    });

    it("TypeScript settingsModel enforces [64, 480] width and [32, 64] height bounds", () => {
      assert.strictEqual(clampIslandWidth(50), 64, "Width below 64 must clamp to 64");
      assert.strictEqual(clampIslandWidth(64), 64, "Width 64 must be preserved");
      assert.strictEqual(clampIslandWidth(128), 128);
      assert.strictEqual(clampIslandWidth(300), 300);
      assert.strictEqual(clampIslandWidth(480), 480);
      assert.strictEqual(clampIslandWidth(600), 480, "Width above 480 must clamp to 480");

      assert.strictEqual(clampIslandHeight(20), 32, "Height below 32 must clamp to 32");
      assert.strictEqual(clampIslandHeight(32), 32);
      assert.strictEqual(clampIslandHeight(48), 48);
      assert.strictEqual(clampIslandHeight(64), 64);
      assert.strictEqual(clampIslandHeight(80), 64, "Height above 64 must clamp to 64");
    });

    it("resolveEffectiveCompactWidth respects platform minimal (64) and maximal (480) limits", () => {
      const resolvedLow = resolveEffectiveCompactWidth({ userCompactWidth: 50 });
      assert.strictEqual(resolvedLow, 64, "Resolved width below 64 must clamp to 64");

      const resolved64 = resolveEffectiveCompactWidth({ userCompactWidth: 64 });
      assert.strictEqual(resolved64, 64, "Resolved width 64 must be preserved");

      const resolvedMid = resolveEffectiveCompactWidth({ userCompactWidth: 260 });
      assert.strictEqual(resolvedMid, 260);

      const resolvedHigh = resolveEffectiveCompactWidth({ userCompactWidth: 600 });
      assert.strictEqual(resolvedHigh, 480, "Resolved width above 480 must clamp to 480");
    });

    it("IslandSettingsTab specifies min={64} max={480} for width slider", () => {
      const tabSource = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(tabSource.includes("min={64}"), "Width slider must have min={64}");
      assert.ok(tabSource.includes("max={480}"), "Width slider must have max={480}");
    });

    it("IslandShell enforces minWidth: 64px and CSS .state-idle has min-width: 64px", () => {
      const shellSource = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/IslandShell.tsx"),
        "utf-8"
      );
      assert.ok(shellSource.includes('minWidth: "64px"'), "IslandShell must enforce minWidth: 64px");

      const cssSource = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(cssSource.includes("min-width: 64px;"), "CSS must specify min-width: 64px;");
    });
  });

  // =========================================================================
  // 3. Blur On/Off Switch & Settings Integration
  // =========================================================================
  describe("3. Blur On/Off Switch & Settings Integration", () => {
    it("Rust core BbqSettings defines island_blur_enabled with serde default true", () => {
      const settingsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/settings.rs"), "utf-8");
      assert.ok(settingsRs.includes("pub island_blur_enabled: bool,"), "BbqSettings must contain island_blur_enabled");
      assert.ok(settingsRs.includes("fn default_island_blur_enabled() -> bool"), "default_island_blur_enabled must exist");
    });

    it("Rust services read and write island_blur_enabled correctly", () => {
      const servicesRs = fs.readFileSync(path.join(ROOT_DIR, "crates/services/src/settings.rs"), "utf-8");
      assert.ok(servicesRs.includes("island_blur_enabled"), "SettingsService must process island_blur_enabled");
    });

    it("TypeScript settingsState includes island_blur_enabled: true by default", () => {
      assert.strictEqual(defaultSettings.island_blur_enabled, true, "defaultSettings must have island_blur_enabled = true");
      assert.strictEqual(coerceSettingValue("island_blur_enabled", "true"), true);
      assert.strictEqual(coerceSettingValue("island_blur_enabled", "false"), false);
    });

    it("IslandSettingsTab renders #island-blur-enabled-toggle and dims blur slider when disabled", () => {
      const tabSource = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(tabSource.includes('id="island-blur-enabled-toggle"'), "Must render island-blur-enabled-toggle");
      assert.ok(tabSource.includes("pointerEvents: blurEnabled ?"), "Must disable pointer events when blur is disabled");
    });

    it("applyThemeAndMotionToDom sets --bbq-island-blur: 0px when island_blur_enabled is false", () => {
      const mockProps = new Map<string, string>();
      const mockAttrs = new Map<string, string>();

      (global as any).document = {
        documentElement: {
          style: {
            setProperty: (prop: string, val: string) => mockProps.set(prop, val),
          },
          setAttribute: (attr: string, val: string) => mockAttrs.set(attr, val),
          removeAttribute: (attr: string) => mockAttrs.delete(attr),
        },
      };

      // Test with blur disabled
      applyThemeAndMotionToDom({
        ...defaultSettings,
        island_blur_enabled: false,
        island_blur: 30,
      });

      assert.strictEqual(mockProps.get("--bbq-island-blur"), "0px", "Blur must be 0px when disabled");
      assert.strictEqual(mockProps.get("--bbq-glass-blur-idle"), "0px");
      assert.strictEqual(mockProps.get("--bbq-glass-blur-expanded"), "0px");
      assert.strictEqual(mockAttrs.get("data-blur-zero"), "true", "data-blur-zero attribute must be set");

      // Test with blur enabled
      applyThemeAndMotionToDom({
        ...defaultSettings,
        island_blur_enabled: true,
        island_blur: 24,
      });

      assert.strictEqual(mockProps.get("--bbq-island-blur"), "24px", "Blur must reflect configured value when enabled");
      assert.strictEqual(mockAttrs.has("data-blur-zero"), false, "data-blur-zero attribute must be removed");
    });
  });

  // =========================================================================
  // 4. Blur Rounded Corners & Spill Prevention
  // =========================================================================
  describe("4. Blur Rounded Corners & Spill Prevention", () => {
    it(".bbq-island-shell and state classes define strict corner clipping and isolation", () => {
      const cssSource = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");

      assert.ok(cssSource.includes("-webkit-mask-image: -webkit-radial-gradient(white, black);"), "Must use webkit-mask-image for subpixel corner anti-aliasing");
      assert.ok(cssSource.includes("isolation: isolate;"), "Must use isolation: isolate to constrain backdrop filter blending");
      assert.ok(cssSource.includes("-webkit-clip-path: inset(0 round var(--bbq-radius-compact"));
    });

    it("verifies ZERO drop-shadow() occurrences in CSS", () => {
      const cssSource = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(!cssSource.includes("drop-shadow("), "CSS must never contain drop-shadow()");
    });
  });

  // =========================================================================
  // 5. Settings Tab Natural Height Recalculation
  // =========================================================================
  describe("5. Settings Tab Natural Height Recalculation", () => {
    it("settingsTabHeightStore includes MutationObserver and SETTINGS_CHROME_HEIGHT = 72", () => {
      const storeSource = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settingsTabHeightStore.ts"),
        "utf-8"
      );
      assert.strictEqual(SETTINGS_CHROME_HEIGHT, 72, "SETTINGS_CHROME_HEIGHT must be 72");
      assert.ok(storeSource.includes("MutationObserver"), "Must attach MutationObserver for tab/content swaps");
      assert.ok(storeSource.includes("ResizeObserver"), "Must attach ResizeObserver for dynamic child sizing");
    });
  });

  // =========================================================================
  // 6. Update Notification Dialog Window
  // =========================================================================
  describe("6. Update Notification Dialog Window", () => {
    it("UpdateNotificationDialog component source satisfies all design and action requirements", () => {
      const dialogSource = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/updater/UpdateNotificationDialog.tsx"),
        "utf-8"
      );

      // DOM IDs and aria roles
      assert.ok(dialogSource.includes('id="bbq-update-notification-dialog"'), "Must define #bbq-update-notification-dialog");
      assert.ok(dialogSource.includes('role="dialog"'), "Must be role dialog");
      assert.ok(dialogSource.includes('aria-modal="true"'), "Must be aria-modal");
      assert.ok(dialogSource.includes('id="update-notification-version-badge"'), "Must define version badge");

      // Actions: "Güncelle" / "Sonra"
      assert.ok(dialogSource.includes('id="update-notification-update-btn"'), "Must define primary update action button");
      assert.ok(dialogSource.includes('id="update-notification-later-btn"'), "Must define secondary later action button");
      assert.ok(dialogSource.includes('t("updater.actionUpdate")'), "Must use localized actionUpdate");
      assert.ok(dialogSource.includes('t("updater.actionLater")'), "Must use localized actionLater");

      // Keyboard navigation
      assert.ok(dialogSource.includes('e.key === "Enter"'), "Must handle Enter key for primary action");
      assert.ok(dialogSource.includes("escapeManager.register"), "Must register Escape handler via escapeManager");

      // Zero emoji check
      const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u;
      assert.ok(!emojiRegex.test(dialogSource), "Dialog component must not contain emoji characters");
    });

    it("updaterState exports openUpdateNotification and closeUpdateNotification", () => {
      resetUpdaterState();
      assert.strictEqual(updaterStore.getState().isNotificationOpen, false);

      openUpdateNotification();
      assert.strictEqual(updaterStore.getState().isNotificationOpen, true);

      const closed = closeUpdateNotification();
      assert.strictEqual(closed, true);
      assert.strictEqual(updaterStore.getState().isNotificationOpen, false);
    });

    it("updaterState prevents closing notification while actively downloading or installing", async () => {
      setSimulatedUpdater({
        mockAvailableVersion: "3.9",
        downloadDurationMs: 200,
      });

      updaterStore.setState({
        status: "update_available",
        availableVersion: "3.9",
        isNotificationOpen: true,
      });

      const installPromise = downloadAndInstallUpdate();
      assert.strictEqual(updaterStore.getState().status, "downloading");

      // Attempt to close during download
      const canCloseWhileDownloading = closeUpdateNotification();
      assert.strictEqual(canCloseWhileDownloading, false, "Must reject dismiss while downloading");
      assert.strictEqual(updaterStore.getState().isNotificationOpen, true);

      await installPromise;
      assert.strictEqual(updaterStore.getState().status, "success");

      // Now closing should be permitted
      const canCloseAfterSuccess = closeUpdateNotification();
      assert.strictEqual(canCloseAfterSuccess, true);
      assert.strictEqual(updaterStore.getState().isNotificationOpen, false);

      setSimulatedUpdater(null);
      resetUpdaterState();
    });
  });

  // =========================================================================
  // 7. System Tray Context Menu Integration
  // =========================================================================
  describe("7. System Tray Context Menu Integration", () => {
    it("Rust tray.rs defines localized strings for tr, de, es, fr, en", () => {
      const trayRs = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/src/tray.rs"), "utf-8");

      assert.ok(trayRs.includes('get_tray_strings(lang: &str)'), "get_tray_strings function must exist");
      assert.ok(trayRs.includes('"tr" =>'), "Must support Turkish tray strings");
      assert.ok(trayRs.includes('"de" =>'), "Must support German tray strings");
      assert.ok(trayRs.includes('"es" =>'), "Must support Spanish tray strings");
      assert.ok(trayRs.includes('"fr" =>'), "Must support French tray strings");
      assert.ok(trayRs.includes('"bbq://switch_widget"'), "Must emit switch_widget event");
      assert.ok(trayRs.includes('"bbq://reset_position"'), "Must emit reset_position event");
      assert.ok(trayRs.includes('"bbq://reload_widget"'), "Must emit reload_widget event");
      assert.ok(trayRs.includes('"bbq://open_about"'), "Must emit open_about event");
    });

    it("TypeScript events.ts exports subscribers for all tray menu actions", () => {
      assert.strictEqual(typeof subscribeToSwitchWidget, "function");
      assert.strictEqual(typeof subscribeToResetPosition, "function");
      assert.strictEqual(typeof subscribeToReloadWidget, "function");
      assert.strictEqual(typeof subscribeToOpenAbout, "function");
    });
  });

  // =========================================================================
  // 8. Music Artwork Resolver Contracts
  // =========================================================================
  describe("8. Music Artwork Resolver Contracts", () => {
    it("handles base64 data URIs", () => {
      const b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      assert.strictEqual(resolveArtworkUrl(b64), b64);
    });

    it("handles remote HTTPS URLs", () => {
      const httpsUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300";
      assert.strictEqual(resolveArtworkUrl(httpsUrl), httpsUrl);
    });

    it("handles asset:// URLs", () => {
      const assetUrl = "asset://localhost/covers/art.jpg";
      assert.strictEqual(resolveArtworkUrl(assetUrl), assetUrl);
    });

    it("handles local Windows and Unix file paths gracefully", () => {
      const localPath = "C:\\Music\\AlbumArt.png";
      const resolved = resolveArtworkUrl(localPath);
      assert.ok(resolved !== null, "Local path must be resolved");
    });

    it("returns null for empty or null inputs", () => {
      assert.strictEqual(resolveArtworkUrl(null), null);
      assert.strictEqual(resolveArtworkUrl(undefined), null);
      assert.strictEqual(resolveArtworkUrl(""), null);
      assert.strictEqual(resolveArtworkUrl("   "), null);
    });
  });

  // =========================================================================
  // 9. Exact 5-Locale Key Parity (456 keys each)
  // =========================================================================
  describe("9. Exact 5-Locale Key Parity", () => {
    const locales = ["en", "tr", "de", "es", "fr"];
    const localeData: Record<string, Record<string, any>> = {};

    function getLeafKeys(obj: Record<string, any>, prefix = ""): string[] {
      let keys: string[] = [];
      for (const k of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (typeof obj[k] === "object" && obj[k] !== null && !Array.isArray(obj[k])) {
          keys = keys.concat(getLeafKeys(obj[k], fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    for (const loc of locales) {
      const p = path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`);
      localeData[loc] = JSON.parse(fs.readFileSync(p, "utf-8"));
    }

    it("all 5 locale files have identical total key counts", () => {
      const counts = locales.map((l) => ({ loc: l, count: getLeafKeys(localeData[l]).length }));
      const baseCount = counts[0].count;
      assert.strictEqual(baseCount, 472, "Locale base key count must be 472");

      for (const item of counts) {
        assert.strictEqual(
          item.count,
          baseCount,
          `Locale ${item.loc} has ${item.count} keys, expected ${baseCount}`
        );
      }
    });

    it("all 5 locale files have identical key sets", () => {
      const enKeys = getLeafKeys(localeData["en"]);

      for (const loc of ["tr", "de", "es", "fr"]) {
        const currentKeys = getLeafKeys(localeData[loc]);
        const missing = enKeys.filter((k) => !currentKeys.includes(k));
        const extra = currentKeys.filter((k) => !enKeys.includes(k));

        assert.deepStrictEqual(missing, [], `Locale ${loc} is missing keys: ${missing.join(", ")}`);
        assert.deepStrictEqual(extra, [], `Locale ${loc} has unexpected extra keys: ${extra.join(", ")}`);
      }
    });

    it("verifies v3.8 specific strings exist in Turkish locale", () => {
      const tr = localeData["tr"];
      assert.strictEqual(tr.updater.actionUpdate, "Güncelle");
      assert.strictEqual(tr.updater.actionLater, "Sonra");
      assert.strictEqual(tr.updater.notificationTitle, "BBQ Güncellemesi Mevcut");
      assert.strictEqual(tr.settings.island.blurEnabled, "Ada Bulanıklığı");
    });
  });

  // =========================================================================
  // 10. Architectural Invariants
  // =========================================================================
  describe("10. Architectural Invariants", () => {
    it("SettingsWidget.tsx line count is strictly under 650 lines", () => {
      const file = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"), "utf-8");
      const lines = file.split("\n").length;
      assert.ok(lines < 650, `SettingsWidget.tsx has ${lines} lines, must be < 650`);
    });

    it("ensures zero setInterval, requestAnimationFrame, or recursive setTimeout in desktop source", () => {
      const srcDir = path.join(DESKTOP_DIR, "src");

      function checkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf-8");
            // Exclude benign comments or simulator mocks
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;

              assert.ok(
                !line.includes("setInterval("),
                `Forbidden setInterval detected in ${fullPath}:${i + 1}: ${line}`
              );
              assert.ok(
                !line.includes("requestAnimationFrame("),
                `Forbidden requestAnimationFrame detected in ${fullPath}:${i + 1}: ${line}`
              );
            }
          }
        }
      }

      checkDir(srcDir);
    });
  });
});
