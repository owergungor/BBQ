import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLauncherItemIcon } from "../src/components/widgets/launcherModel.ts";
import { resolveEffectiveCompactWidth } from "../src/island/geometryResolution.ts";
import { defaultSettings, applyThemeAndMotionToDom } from "../src/state/settingsState.ts";
import type { LauncherItem, BbqSettings } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, "../src");

/**
 * Strips comments from JS/TS source code to isolate user-visible tokens.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "") // Block comments
    .replace(/\/\/.*/g, ""); // Line comments
}

describe("BBQ v2.6 — UI Polish, Geometry, Theme Dropdowns & English Invariants", () => {
  // =========================================================================
  // 1. Full English UI Scan (Zero User-Facing Turkish Strings)
  // =========================================================================
  describe("1. Full English UI Scan", () => {
    const TURKISH_CHAR_REGEX = /[çğıöşüÇĞİÖŞÜ]/;

    it("verifies zero Turkish characters exist in user-facing frontend code", () => {
      const getFilesRecursively = (dir: string): string[] => {
        let results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(getFilesRecursively(fullPath));
          } else if (
            (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
            !entry.name.endsWith(".d.ts")
          ) {
            results.push(fullPath);
          }
        }
        return results;
      };

      const srcFiles = getFilesRecursively(SRC_DIR);
      const violations: Array<{ file: string; match: string }> = [];

      for (const file of srcFiles) {
        const rawContent = fs.readFileSync(file, "utf-8");
        const cleanContent = stripComments(rawContent);

        const match = cleanContent.match(TURKISH_CHAR_REGEX);
        if (match) {
          violations.push({
            file: path.relative(SRC_DIR, file),
            match: match[0],
          });
        }
      }

      assert.deepStrictEqual(
        violations,
        [],
        `Found user-facing Turkish characters in active code:\n${JSON.stringify(violations, null, 2)}`
      );
    });

    it("verifies timer notifications use natural English", () => {
      const timerNotifSrc = fs.readFileSync(
        path.resolve(SRC_DIR, "state/timerNotification.ts"),
        "utf-8"
      );
      assert.ok(timerNotifSrc.includes("Countdown completed."));
      assert.ok(timerNotifSrc.includes("Focus session complete. Time for a well-deserved break!"));
      assert.ok(timerNotifSrc.includes("Break ended. Ready to focus again!"));
      assert.ok(!timerNotifSrc.includes("tamamlandı"));
      assert.ok(!timerNotifSrc.includes("başladı"));
    });
  });

  // =========================================================================
  // 2. Launcher Download Icon
  // =========================================================================
  describe("2. Launcher Download Icon", () => {
    it("maps download-related launcher items to 'download' instead of generic 'folder'", () => {
      const items: Partial<LauncherItem>[] = [
        { id: "sys_downloads", title: "Downloads" },
        { id: "my_downloads", title: "User Downloads Folder" },
        { id: "dl_mgr", title: "Download Manager" },
        {
          id: "action_dl",
          title: "Get Downloads",
          action: { type: "bbq_action", payload: { action: "open_downloads" } },
        },
      ];

      for (const item of items) {
        const icon = resolveLauncherItemIcon(item as LauncherItem);
        assert.strictEqual(
          icon,
          "download",
          `Item ${item.id} (${item.title}) must resolve to 'download' icon, got '${icon}'`
        );
      }
    });

    it("verifies Icon.tsx defines a native SVG for download", () => {
      const iconSrc = fs.readFileSync(path.resolve(SRC_DIR, "components/common/Icon.tsx"), "utf-8");
      assert.ok(iconSrc.includes('case "download":'), "Icon.tsx must handle 'download' case");
      assert.ok(iconSrc.includes("<svg"), "Must render native SVG element");
    });
  });

  // =========================================================================
  // 3. Compact Width Centering & Geometry
  // =========================================================================
  describe("3. Compact Width Symmetrical Centering Invariant", () => {
    it("resolves compact width within platform constraints [180, 640]", () => {
      assert.strictEqual(resolveEffectiveCompactWidth({ userCompactWidth: 100 }), 180);
      assert.strictEqual(resolveEffectiveCompactWidth({ userCompactWidth: 300 }), 300);
      assert.strictEqual(resolveEffectiveCompactWidth({ userCompactWidth: 800 }), 640);
    });

    it("verifies core Rust geometry anchors horizontal center to display bounds for symmetric expansion", () => {
      const rustGeoSrc = fs.readFileSync(
        path.resolve(__dirname, "../../../crates/core/src/geometry.rs"),
        "utf-8"
      );
      assert.ok(
        rustGeoSrc.includes("display.bounds.x + (display.bounds.width as i32) / 2"),
        "TopCenter and BottomCenter must calculate center relative to display.bounds"
      );
    });
  });

  // =========================================================================
  // 4. Transparency: Explicit Opaque Option
  // =========================================================================
  describe("4. Transparency Opaque Option (0% / 100% Opacity)", () => {
    it("sets data-opaque='true' attribute when island_transparency is 0", () => {
      const attributes: Record<string, string> = {};
      const fakeElement = {
        style: {
          setProperty: () => {},
          getPropertyValue: () => "",
        },
        setAttribute: (attr: string, val: string) => {
          attributes[attr] = val;
        },
        removeAttribute: (attr: string) => {
          delete attributes[attr];
        },
      };

      const originalDoc = globalThis.document;
      globalThis.document = {
        documentElement: fakeElement as unknown as HTMLElement,
      } as unknown as Document;

      try {
        // 0% transparency = 100% opaque
        applyThemeAndMotionToDom({
          ...defaultSettings,
          island_transparency: 0,
        });
        assert.strictEqual(attributes["data-opaque"], "true");

        // 20% transparency = translucent (data-opaque removed)
        applyThemeAndMotionToDom({
          ...defaultSettings,
          island_transparency: 20,
        });
        assert.strictEqual(attributes["data-opaque"], undefined);
      } finally {
        globalThis.document = originalDoc;
      }
    });

    it("includes solid opaque CSS overrides in index.css without drop-shadow", () => {
      const cssSrc = fs.readFileSync(path.resolve(SRC_DIR, "styles/index.css"), "utf-8");
      assert.ok(cssSrc.includes(':root[data-opaque="true"]'));
      assert.ok(cssSrc.includes("backdrop-filter: none"));
      assert.ok(!cssSrc.includes("filter: drop-shadow("));
    });
  });

  // =========================================================================
  // 5. Context Menu v2.6 & Dynamic Context-Aware Actions
  // =========================================================================
  describe("5. Context Menu Application Version Polish", () => {
    it("displays canonical application version in context menu header badge and about modal", () => {
      const contextSrc = fs.readFileSync(
        path.resolve(SRC_DIR, "components/common/ContextMenu.tsx"),
        "utf-8"
      );
      assert.ok(
        contextSrc.includes("{APP_VERSION_LABEL}"),
        "Header badge and about modal must use dynamic APP_VERSION_LABEL"
      );
      assert.ok(
        !contextSrc.includes('className="bbq-context-menu-badge">v2.6<'),
        "Header badge must not hardcode v2.6"
      );
      assert.ok(
        !contextSrc.includes('className="bbq-about-version">v2.6.0<'),
        "About modal must not hardcode v2.6.0"
      );
    });

    it("includes context-aware action hooks for media, timer, and drop shelf", () => {
      const contextSrc = fs.readFileSync(
        path.resolve(SRC_DIR, "components/common/ContextMenu.tsx"),
        "utf-8"
      );
      assert.ok(contextSrc.includes("isMediaActive"), "Must check media state");
      assert.ok(contextSrc.includes("isTimerActive"), "Must check timer state");
      assert.ok(contextSrc.includes("hasDropItems"), "Must check drop shelf state");
      assert.ok(contextSrc.includes("Pause Track") || contextSrc.includes("Play Track"));
      assert.ok(contextSrc.includes("Pause Timer") || contextSrc.includes("Resume Timer"));
      assert.ok(contextSrc.includes("Clear Drop Shelf"));
    });
  });
});
