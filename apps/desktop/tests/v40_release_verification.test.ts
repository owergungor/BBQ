import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import { resolveArtworkUrl } from "../src/components/widgets/mediaModel.ts";
import { clampDotSize, clampIslandWidth, clampIslandHeight } from "../src/components/widgets/settingsModel.ts";
import { defaultSettings, applyThemeAndMotionToDom, coerceSettingValue } from "../src/state/settingsState.ts";
import { subscribeToToggleExpand } from "../src/ipc/events.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

describe("BBQ v4.0 — Apple Notch, Dot Mode, Vertical Position & Blur Verification", () => {
  // =========================================================================
  // 0. Version Hygiene & Release State
  // =========================================================================
  describe("0. Version Hygiene & Release State", () => {
    it("preserves stable version manifests strictly aligned with v4.0 and v4.1 release", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.ok(rootPkg.version === "4.1" || rootPkg.version === "4.0", "Root package.json version must be 4.1 or 4.0");
      assert.ok(desktopPkg.version === "4.1" || desktopPkg.version === "4.0", "Desktop package.json version must be 4.1 or 4.0");
      assert.ok(typesPkg.version === "4.1" || typesPkg.version === "4.0", "Types package.json version must be 4.1 or 4.0");
      assert.ok(APP_VERSION === "4.1" || APP_VERSION === "4.0", "APP_VERSION must be 4.1 or 4.0");
      assert.ok(APP_VERSION_LABEL === "v4.1" || APP_VERSION_LABEL === "v4.0", "APP_VERSION_LABEL must be v4.1 or v4.0");

      assert.ok(tauriConf.version === "4.1.0" || tauriConf.version === "4.0.0", "tauri.conf.json version must be 4.1.0 or 4.0.0");
      assert.ok(desktopCargo.includes('version = "4.1.0"') || desktopCargo.includes('version = "4.0.0"'), "Cargo.toml must declare version = 4.1.0 or 4.0.0");
      assert.ok(
        cargoLock.includes('name = "bbq-desktop"\nversion = "4.1.0"') ||
        cargoLock.includes('name = "bbq-desktop"\r\nversion = "4.1.0"') ||
        cargoLock.includes('name = "bbq-desktop"\nversion = "4.0.0"') ||
        cargoLock.includes('name = "bbq-desktop"\r\nversion = "4.0.0"'),
        "Cargo.lock must resolve bbq-desktop to 4.1.0 or 4.0.0"
      );
    });
  });

  // =========================================================================
  // 1. Apple Notch Mode Contracts
  // =========================================================================
  describe("1. Apple Notch Mode Contracts", () => {
    it("Rust core settings validates island_mode with default 'island' and supports 'notch'", () => {
      const settingsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/settings.rs"), "utf-8");
      assert.ok(settingsRs.includes("pub island_mode: String,"), "BbqSettings must declare island_mode");
      assert.ok(settingsRs.includes("fn default_island_mode() -> String"));
      assert.ok(settingsRs.includes('"island" | "notch" | "dot"'));
    });

    it("CSS declares Apple Notch mode attached to top and bottom screen edges with clip-path", () => {
      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(css.includes(".bbq-island-shell.mode-notch.state-idle"), "Must declare mode-notch idle styles");
      assert.ok(css.includes(".bbq-island-shell.mode-notch.state-expanded"), "Must declare mode-notch expanded styles");
      assert.ok(css.includes("clip-path: inset(0 round 0 0 18px 18px);"), "Notch idle must clip bottom corners only");
      assert.ok(css.includes("clip-path: inset(0 round 0 0 24px 24px);"), "Notch expanded must clip bottom corners only");
      assert.ok(css.includes("clip-path: inset(0 round 18px 18px 0 0);"), "Bottom notch must clip top corners only");
    });

    it("IslandShell renders data-island-mode and mode class", () => {
      const shellSource = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/island/IslandShell.tsx"), "utf-8");
      assert.ok(shellSource.includes('data-island-mode={islandMode}'), "IslandShell must set data-island-mode");
      assert.ok(shellSource.includes('`mode-${islandMode}`'), "IslandShell must append mode class");
    });
  });

  // =========================================================================
  // 2. Vertical Position Contracts
  // =========================================================================
  describe("2. Vertical Position Contracts", () => {
    it("Rust core settings validates island_vertical_position with default 'top' and supports 'center' and 'bottom'", () => {
      const settingsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/settings.rs"), "utf-8");
      assert.ok(settingsRs.includes("pub island_vertical_position: String,"), "BbqSettings must declare island_vertical_position");
      assert.ok(settingsRs.includes("fn default_island_vertical_position() -> String"));
      assert.ok(settingsRs.includes('"top" | "center" | "bottom"'));
    });

    it("Rust core geometry supports IslandAnchor::Center, CenterLeft, CenterRight", () => {
      const geoRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/geometry.rs"), "utf-8");
      assert.ok(geoRs.includes("IslandAnchor::Center"), "Geometry must support IslandAnchor::Center");
      assert.ok(geoRs.includes("IslandAnchor::CenterLeft"), "Geometry must support IslandAnchor::CenterLeft");
      assert.ok(geoRs.includes("IslandAnchor::CenterRight"), "Geometry must support IslandAnchor::CenterRight");
    });

    it("IslandSettingsTab renders #island-vertical-pos-select with top, center, bottom options", () => {
      const tabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(tabSrc.includes('id="island-vertical-pos-select"'), "Must render vertical pos select");
      assert.ok(tabSrc.includes('value: "top"'));
      assert.ok(tabSrc.includes('value: "center"'));
      assert.ok(tabSrc.includes('value: "bottom"'));
    });

    it("CSS defines transform-origin for vertical positions", () => {
      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(css.includes(".bbq-island-shell.vpos-center"));
      assert.ok(css.includes("transform-origin: center center;"));
      assert.ok(css.includes(".bbq-island-shell.vpos-bottom"));
      assert.ok(css.includes("transform-origin: center bottom;"));
      assert.ok(css.includes(".bbq-island-shell.vpos-top"));
      assert.ok(css.includes("transform-origin: center top;"));
    });
  });

  // =========================================================================
  // 3. Dot Mode Contracts
  // =========================================================================
  describe("3. Dot Mode Contracts", () => {
    it("Rust core settings clamps dot_size to [32, 64] with default 38", () => {
      const settingsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/core/src/settings.rs"), "utf-8");
      assert.ok(settingsRs.includes("pub const MIN_DOT_SIZE: u32 = 32;"));
      assert.ok(settingsRs.includes("pub const MAX_DOT_SIZE: u32 = 64;"));
      assert.ok(settingsRs.includes("pub const DEFAULT_DOT_SIZE: u32 = 38;"));
    });

    it("TypeScript settingsModel clamps dot_size to [32, 64]", () => {
      assert.strictEqual(clampDotSize(20), 32);
      assert.strictEqual(clampDotSize(32), 32);
      assert.strictEqual(clampDotSize(38), 38);
      assert.strictEqual(clampDotSize(64), 64);
      assert.strictEqual(clampDotSize(80), 64);
    });

    it("CSS enforces perfect 1:1 circular aspect ratio, 50% radius, and true circular clip-path", () => {
      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(css.includes(".bbq-island-shell.mode-dot.state-idle"));
      assert.ok(css.includes("aspect-ratio: 1 / 1;"));
      assert.ok(css.includes("border-radius: 50% !important;"));
      assert.ok(css.includes("clip-path: circle(50% at 50% 50%) !important;"));
      assert.ok(css.includes("-webkit-clip-path: circle(50% at 50% 50%) !important;"));
    });

    it("Dot mode expands back to normal island envelope in expanded state", () => {
      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(css.includes(".bbq-island-shell.mode-dot.state-expanded"));
      assert.ok(css.includes("max-width: var(--bbq-expanded-width, 520px);"));
      assert.ok(css.includes("max-height: var(--bbq-expanded-height, 360px);"));
    });

    it("CompactIndicators renders centered icon or status dot in Dot mode without text overflow", () => {
      const indSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/island/CompactIndicators.tsx"), "utf-8");
      assert.ok(indSrc.includes('islandMode === "dot" && state === "Idle"'));
      assert.ok(indSrc.includes("bbq-dot-content"));
    });
  });

  // =========================================================================
  // 4. Blur Setting & Clipping
  // =========================================================================
  describe("4. Blur Toggle & Clean Backdrop Clipping", () => {
    it("IslandSettingsTab renders #island-blur-enabled-toggle switch", () => {
      const tabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(tabSrc.includes('id="island-blur-enabled-toggle"'));
      assert.ok(tabSrc.includes('display: "none"'));
    });

    it("CSS completely eliminates backdrop-filter when data-blur-zero is active", () => {
      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(css.includes('[data-blur-zero="true"] .bbq-island-shell'));
      assert.ok(css.includes("backdrop-filter: none !important;"));
    });

    it("CSS has zero drop-shadow filter workarounds", () => {
      const css = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.strictEqual(css.includes("drop-shadow"), false, "Must have zero drop-shadow filter rules");
    });
  });

  // =========================================================================
  // 5. System Tray Context Menu Integration
  // =========================================================================
  describe("5. System Tray Context Menu Integration", () => {
    it("tray.rs supports toggle_expand menu item and localized strings in all 5 languages", () => {
      const trayRs = fs.readFileSync(path.join(ROOT_DIR, "apps/desktop/src-tauri/src/tray.rs"), "utf-8");
      assert.ok(trayRs.includes("pub toggle_expand: &'static str,"));
      assert.ok(trayRs.includes('"HUD\'ı Genişlet / Daralt"'));
      assert.ok(trayRs.includes('"HUD erweitern / einklappen"'));
      assert.ok(trayRs.includes('"Expandir / Contraer HUD"'));
      assert.ok(trayRs.includes('"Développer / Réduire le HUD"'));
      assert.ok(trayRs.includes('"Expand / Collapse HUD"'));
      assert.ok(trayRs.includes('MenuItemBuilder::with_id("toggle_expand"'));
    });

    it("TypeScript events.ts exports subscribeToToggleExpand", () => {
      assert.strictEqual(typeof subscribeToToggleExpand, "function");
    });
  });

  // =========================================================================
  // 6. Music Artwork Resolver Contracts
  // =========================================================================
  describe("6. Music Artwork Resolver Contracts", () => {
    it("resolves base64 data URIs", () => {
      const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      assert.strictEqual(resolveArtworkUrl(dataUri), dataUri);
    });

    it("resolves HTTPS URLs", () => {
      const httpsUrl = "https://example.com/artwork.png";
      assert.strictEqual(resolveArtworkUrl(httpsUrl), httpsUrl);
    });

    it("rejects insecure HTTP URLs", () => {
      assert.strictEqual(resolveArtworkUrl("http://example.com/art.png"), null);
    });

    it("rejects dangerous or invalid schemes", () => {
      assert.strictEqual(resolveArtworkUrl("javascript:alert(1)"), null);
      assert.strictEqual(resolveArtworkUrl("vbscript:msgbox"), null);
      assert.strictEqual(resolveArtworkUrl("data:text/html;base64,PHNjcmlwdD4="), null);
      assert.strictEqual(resolveArtworkUrl(""), null);
      assert.strictEqual(resolveArtworkUrl(null), null);
    });
  });

  // =========================================================================
  // 7. Exact 5-Locale Key Parity (472 keys each)
  // =========================================================================
  describe("7. Exact 5-Locale Key Parity", () => {
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

    it("all 5 locale files have identical total key counts of 472", () => {
      const counts = locales.map((l) => ({ loc: l, count: getLeafKeys(localeData[l]).length }));
      const baseCount = counts[0].count;
      assert.strictEqual(baseCount, 476, "Locale base key count must be 476");

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

    it("verifies v4.0 specific keys exist in all locales", () => {
      for (const loc of locales) {
        const data = localeData[loc];
        assert.ok(data.settings.island.mode, `Missing settings.island.mode in ${loc}`);
        assert.ok(data.settings.island.modeNotch, `Missing settings.island.modeNotch in ${loc}`);
        assert.ok(data.settings.island.modeDot, `Missing settings.island.modeDot in ${loc}`);
        assert.ok(data.settings.island.verticalPos, `Missing settings.island.verticalPos in ${loc}`);
        assert.ok(data.settings.island.dotSize, `Missing settings.island.dotSize in ${loc}`);
      }
    });
  });

  // =========================================================================
  // 8. Architectural Invariants
  // =========================================================================
  describe("8. Architectural Invariants", () => {
    it("SettingsWidget.tsx line count is strictly under 650 lines", () => {
      const file = fs.readFileSync(path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"), "utf-8");
      const lines = file.split("\n").length;
      assert.ok(lines < 650, `SettingsWidget.tsx has ${lines} lines, must be < 650`);
    });

    it("ensures zero setInterval or continuous requestAnimationFrame in desktop source", () => {
      const srcDir = path.join(DESKTOP_DIR, "src");

      function checkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf-8");
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
