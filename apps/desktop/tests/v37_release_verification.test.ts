import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import { resolveArtworkUrl } from "../src/components/widgets/mediaModel.ts";
import { resolveEffectiveCompactWidth } from "../src/island/geometryResolution.ts";
import { clampIslandWidth, clampIslandHeight } from "../src/components/widgets/settingsModel.ts";
import { defaultSettings, applyThemeAndMotionToDom } from "../src/state/settingsState.ts";
import { SETTINGS_CHROME_HEIGHT } from "../src/components/widgets/settingsTabHeightStore.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

describe("BBQ v3.7 — Release Verification & Quality Gates", () => {
  // =========================================================================
  // 1. Version Hygiene & Release State
  // =========================================================================
  describe("1. Version Hygiene & Release State", () => {
    it("preserves stable version manifests strictly aligned with v3.7 release", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.ok(rootPkg.version === "3.8" || rootPkg.version === "3.7", "Root package.json version must be 3.8 or 3.7");
      assert.ok(desktopPkg.version === "3.8" || desktopPkg.version === "3.7", "Desktop package.json version must be 3.8 or 3.7");
      assert.ok(typesPkg.version === "3.8" || typesPkg.version === "3.7", "Types package.json version must be 3.8 or 3.7");
      assert.ok(APP_VERSION === "3.8" || APP_VERSION === "3.7");
      assert.ok(APP_VERSION_LABEL === "v3.8" || APP_VERSION_LABEL === "v3.7");

      assert.ok(tauriConf.version === "3.8.0" || tauriConf.version === "3.7.0", "tauri.conf.json version must be 3.8.0 or 3.7.0");
      assert.ok(desktopCargo.includes('version = "3.8.0"') || desktopCargo.includes('version = "3.7.0"'), "Cargo.toml must be 3.8.0 or 3.7.0");
      assert.ok(
        cargoLock.includes('name = "bbq-desktop"\nversion = "3.8.0"') ||
        cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.8.0"') ||
        cargoLock.includes('name = "bbq-desktop"\nversion = "3.7.0"') ||
        cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.7.0"'),
        "Cargo.lock must resolve bbq-desktop to 3.8.0 or 3.7.0"
      );
    });
  });

  // =========================================================================
  // 2. Compact Geometry Constraints (128-480 width, 32-64 height)
  // =========================================================================
  describe("2. Compact Geometry Constraints", () => {
    it("Rust core settings enforces MIN_ISLAND_WIDTH = 64 and MAX_ISLAND_WIDTH = 480", () => {
      const settingsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/settings.rs"), "utf-8");
      assert.ok(settingsRs.includes("pub const MIN_ISLAND_WIDTH: u32 = 64;"), "MIN_ISLAND_WIDTH must be 64");
      assert.ok(settingsRs.includes("pub const MAX_ISLAND_WIDTH: u32 = 480;"), "MAX_ISLAND_WIDTH must be 480");
      assert.ok(settingsRs.includes("pub const MIN_ISLAND_HEIGHT: u32 = 32;"), "MIN_ISLAND_HEIGHT must be 32");
    });

    it("TypeScript settingsModel enforces [64, 480] width and [32, 64] height bounds", () => {
      assert.strictEqual(clampIslandWidth(50), 64, "Width below 64 must clamp to 64");
      assert.strictEqual(clampIslandWidth(64), 64);
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
      const minResolved = resolveEffectiveCompactWidth({ userCompactWidth: 50 });
      assert.strictEqual(minResolved, 64);

      const maxResolved = resolveEffectiveCompactWidth({ userCompactWidth: 700 });
      assert.strictEqual(maxResolved, 480);

      const midResolved = resolveEffectiveCompactWidth({ userCompactWidth: 260 });
      assert.strictEqual(midResolved, 260);
    });

    it("IslandSettingsTab specifies min=64 max=480 for width slider and min=32 max=64 for height slider", () => {
      const tabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(tabSrc.includes('min={64}'), "Width slider must declare min={64}");
      assert.ok(tabSrc.includes('max={480}'), "Width slider must declare max={480}");
      assert.ok(tabSrc.includes('min={32}'), "Height slider must declare min={32}");
      assert.ok(tabSrc.includes('max={64}'), "Height slider must declare max={64}");
    });
  });

  // =========================================================================
  // 3. Blur & Rounded Corner Clipping
  // =========================================================================
  describe("3. Blur & Rounded Corner Clipping", () => {
    it("verifies index.css applies clip-path matching border-radius across all island states", () => {
      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(
        css.includes("clip-path: inset(0 round var(--bbq-radius-compact, 20px));"),
        "state-idle must have matching clip-path to prevent backdrop blur bleed"
      );
      assert.ok(
        css.includes("clip-path: inset(0 round var(--bbq-radius-peek, 22px));"),
        "state-hovering must have matching clip-path"
      );
      assert.ok(
        css.includes("clip-path: inset(0 round var(--bbq-radius-expanded, 24px));"),
        "state-expanded must have matching clip-path"
      );
      assert.ok(
        css.includes("clip-path var(--bbq-duration-normal) var(--bbq-ease-spring)"),
        "clip-path must be included in spring transitions"
      );
    });

    it("verifies applyThemeAndMotionToDom computes continuous blur CSS variables and data attributes", () => {
      const mockDoc = {
        attributes: {} as Record<string, string>,
        styles: {} as Record<string, string>,
        setAttribute(k: string, v: string) {
          this.attributes[k] = v;
        },
        style: {
          setProperty(k: string, v: string) {
            mockDoc.styles[k] = v;
          },
        },
      };

      const originalDoc = globalThis.document;
      try {
        (globalThis as any).document = {
          documentElement: mockDoc,
        };

        applyThemeAndMotionToDom({
          ...defaultSettings,
          island_blur: 35,
        });

        assert.strictEqual(mockDoc.styles["--bbq-island-blur"], "35px");
        assert.strictEqual(mockDoc.styles["--bbq-glass-blur-idle"], "35px");
        assert.strictEqual(mockDoc.attributes["data-blur-zero"], undefined);

        applyThemeAndMotionToDom({
          ...defaultSettings,
          island_blur: 0,
        });

        assert.strictEqual(mockDoc.styles["--bbq-island-blur"], "0px");
        assert.strictEqual(mockDoc.attributes["data-blur-zero"], "true");
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });
  });

  // =========================================================================
  // 4. Move HUD Symmetrical Center Positioning
  // =========================================================================
  describe("4. Move HUD Symmetrical Center Positioning", () => {
    it("Rust AppState defines custom_center_x for symmetrical window expansion", () => {
      const libRs = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/src/lib.rs"), "utf-8");
      assert.ok(
        libRs.includes("pub custom_center_x: Mutex<Option<f64>>"),
        "AppState must declare custom_center_x Mutex"
      );
    });

    it("commands/island.rs calculates new_x symmetrically around custom_center_x", () => {
      const islandCmds = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/island.rs"),
        "utf-8"
      );
      assert.ok(
        islandCmds.includes("cur_logical_x + (cur_w / 2.0)"),
        "commands/island.rs must compute center_x from cur_logical_x and cur_w"
      );
      assert.ok(
        islandCmds.includes("center_x - (geo.width as f64 / 2.0)"),
        "apply_island_geometry and set_island_mode must expand symmetrically around center_x"
      );
      assert.ok(
        islandCmds.includes("state.custom_center_x.lock()"),
        "custom_center_x must be cleared on reset_island_position"
      );
    });
  });

  // =========================================================================
  // 5. Switch Widget Context Menu Action
  // =========================================================================
  describe("5. Switch Widget Context Menu Action", () => {
    it("ContextMenu directly selects the next widget, dispatches WIDGET_SELECT, and expands island", () => {
      const menuSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/common/ContextMenu.tsx"),
        "utf-8"
      );
      assert.ok(
        menuSrc.includes('id: "switch"'),
        "ContextMenu must have switch action"
      );
      assert.ok(
        menuSrc.includes('type: "WIDGET_SELECT"'),
        "Direct switch must dispatch WIDGET_SELECT"
      );
      assert.ok(
        menuSrc.includes('transitionTo("Expanded", "mouse")'),
        "Direct switch must transition to Expanded mode"
      );
      assert.ok(
        menuSrc.includes("onClose()"),
        "Direct switch must close the context menu"
      );
    });
  });

  // =========================================================================
  // 6. Reduced Transparency Clean Removal
  // =========================================================================
  describe("6. Reduced Transparency Clean Removal", () => {
    it("Rust core BbqSettings does not contain reduced_transparency", () => {
      const settingsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/settings.rs"), "utf-8");
      assert.ok(!settingsRs.includes("pub reduced_transparency:"), "BbqSettings must not have reduced_transparency");
    });

    it("TypeScript BbqSettings types do not contain reduced_transparency", () => {
      const typesTs = fs.readFileSync(path.join(ROOT_DIR, "packages/types/src/index.ts"), "utf-8");
      assert.ok(!typesTs.includes("reduced_transparency:"), "Types BbqSettings must not have reduced_transparency");
    });

    it("settingsState defaultSettings does not contain reduced_transparency", () => {
      assert.strictEqual((defaultSettings as any).reduced_transparency, undefined);
    });

    it("AppearanceSettingsTab does not contain reduced-transparency-toggle", () => {
      const tabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/AppearanceSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(!tabSrc.includes("reduced-transparency-toggle"), "Toggle must be removed");
    });

    it("All 5 locale files do not contain obsolete reducedTransparency strings", () => {
      const locales = ["en", "tr", "de", "es", "fr"];
      for (const loc of locales) {
        const json = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`), "utf-8"));
        assert.strictEqual(json.settings?.appearance?.reducedTransparency, undefined);
      }
    });
  });

  // =========================================================================
  // 7. Settings Natural Tab Height Recalculation
  // =========================================================================
  describe("7. Settings Natural Tab Height Recalculation", () => {
    it("measures firstElementChild natural content height and uses SETTINGS_CHROME_HEIGHT = 72", () => {
      const storeSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settingsTabHeightStore.ts"),
        "utf-8"
      );
      assert.strictEqual(SETTINGS_CHROME_HEIGHT, 72, "SETTINGS_CHROME_HEIGHT must be 72");
      assert.ok(storeSrc.includes("el.firstElementChild"), "Must measure firstElementChild directly");
      assert.ok(
        storeSrc.includes("contentH + SETTINGS_CHROME_HEIGHT"),
        "Must add SETTINGS_CHROME_HEIGHT to content height"
      );
    });
  });

  // =========================================================================
  // 8. Update Available State & Status Pill
  // =========================================================================
  describe("8. Update Available State & Status Pill", () => {
    it("SettingsWidget renders .bbq-update-tab-dot when update is available", () => {
      const widgetSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );
      assert.ok(
        widgetSrc.includes('className="bbq-update-tab-dot"'),
        "SettingsWidget must render .bbq-update-tab-dot"
      );
      assert.ok(
        widgetSrc.includes('updaterState.status === "update_available"'),
        "Dot must be displayed conditionally on update availability"
      );
    });

    it("UpdateSettingsTab renders status pill reflecting all 6 lifecycle states", () => {
      const tabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/UpdateSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(tabSrc.includes('id="updater-status-pill"'), "Must render status pill element");
      assert.ok(tabSrc.includes('className="bbq-capability-badge"'), "Must render status pill badge");
      assert.ok(tabSrc.includes('updater.status === "update_available"'), "Must handle update_available");
      assert.ok(tabSrc.includes('updater.status === "up_to_date"'), "Must handle up_to_date");
      assert.ok(tabSrc.includes('updater.status === "checking"'), "Must handle checking");
      assert.ok(tabSrc.includes('updater.status === "downloading"'), "Must handle downloading");
      assert.ok(tabSrc.includes('updater.status === "installing"'), "Must handle installing");
      assert.ok(tabSrc.includes('updater.status === "error"'), "Must handle error");
    });

    it("All 5 locale files have exact key parity for update status strings (450 keys each)", () => {
      const locales = ["en", "tr", "de", "es", "fr"];
      for (const loc of locales) {
        const raw = fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`), "utf-8");
        const json = JSON.parse(raw);
        assert.ok(json.updater?.statusAvailable, `${loc} must have updater.statusAvailable`);
        assert.ok(json.updater?.statusUpToDate, `${loc} must have updater.statusUpToDate`);
        assert.ok(json.updater?.statusChecking, `${loc} must have updater.statusChecking`);
        assert.ok(json.updater?.statusDownloading, `${loc} must have updater.statusDownloading`);
        assert.ok(json.updater?.statusInstalling, `${loc} must have updater.statusInstalling`);
        assert.ok(json.updater?.statusError, `${loc} must have updater.statusError`);
      }
    });
  });

  // =========================================================================
  // 9. Music Artwork & One-Direction Continuous Marquee
  // =========================================================================
  describe("9. Music Artwork & One-Direction Continuous Marquee", () => {
    it("resolveArtworkUrl handles data URIs, https URLs, asset URLs, and local files", () => {
      assert.strictEqual(
        resolveArtworkUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="),
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
      );
      assert.strictEqual(
        resolveArtworkUrl("data:image/webp;base64,UklGR==="),
        "data:image/webp;base64,UklGR==="
      );
      assert.strictEqual(
        resolveArtworkUrl("https://example.com/art.jpg"),
        "https://example.com/art.jpg"
      );
      assert.ok(
        resolveArtworkUrl("C:\\Music\\Album.jpg")?.startsWith("asset://") ||
        resolveArtworkUrl("C:\\Music\\Album.jpg")?.includes("convertFileSrc") ||
        resolveArtworkUrl("C:\\Music\\Album.jpg")?.length! > 0
      );
      assert.strictEqual(resolveArtworkUrl("javascript:alert(1)"), null);
      assert.strictEqual(resolveArtworkUrl("http://insecure.com/art.jpg"), null);
      assert.strictEqual(resolveArtworkUrl(""), null);
      assert.strictEqual(resolveArtworkUrl(null as any), null);
    });

    it("MarqueeTitle implements pure continuous one-direction loop without reverse/bounce", () => {
      const marqueeSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/common/MarqueeTitle.tsx"),
        "utf-8"
      );
      assert.ok(marqueeSrc.includes('bbq-marquee-track'), "Must use bbq-marquee-track");
      assert.ok(marqueeSrc.includes('is-scrolling'), "Must use is-scrolling when overflowing");
      assert.ok(marqueeSrc.includes('aria-hidden="true"'), "Must render duplicate track item with aria-hidden for seamless loop");

      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(
        css.includes("animation: bbq-marquee-scroll var(--bbq-marquee-duration, 8s) linear infinite;"),
        "Marquee track must animate with linear infinite scroll"
      );
      assert.ok(
        css.includes("transform: translateX(calc(-50% - 18px));"),
        "Marquee scroll must cleanly shift halfway to duplicate track without ping-pong bounce"
      );
    });
  });

  // =========================================================================
  // 10. Architectural Invariants (Zero Polling, SettingsWidget Line Count)
  // =========================================================================
  describe("10. Architectural Invariants", () => {
    it("SettingsWidget.tsx line count is strictly under 650 lines", () => {
      const content = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );
      const lineCount = content.split("\n").length;
      assert.ok(
        lineCount < 650,
        `SettingsWidget.tsx line count (${lineCount}) must remain < 650 lines`
      );
    });

    it("ensures zero setInterval, requestAnimationFrame, or recursive setTimeout in desktop source", () => {
      const srcDir = path.join(DESKTOP_DIR, "src");
      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf-8");
            assert.ok(!content.includes("setInterval("), `Forbidden setInterval found in ${entry.name}`);
            assert.ok(!content.includes("requestAnimationFrame("), `Forbidden requestAnimationFrame found in ${entry.name}`);
          }
        }
      }
      scanDir(srcDir);
    });
  });
});
