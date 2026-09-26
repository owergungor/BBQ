import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THEME_OPTIONS } from "../src/components/common/themeTabsModel.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v2.1 — Phase 9: Theme Tabs Contracts", () => {
  const componentPath = path.resolve(
    __dirname,
    "../src/components/common/ThemeTabs.tsx"
  );
  const iconPath = path.resolve(
    __dirname,
    "../src/components/common/Icon.tsx"
  );
  const cssPath = path.resolve(__dirname, "../src/styles/index.css");

  const componentSource = fs.readFileSync(componentPath, "utf-8");
  const iconSource = fs.readFileSync(iconPath, "utf-8");
  const cssSource = fs.readFileSync(cssPath, "utf-8");

  describe("9A. Required Options and SVG Icons", () => {
    it("provides exactly System, Light, and Dark options", () => {
      const optionIds = THEME_OPTIONS.map((o) => o.id);
      assert.deepEqual(optionIds, ["system", "light", "dark"]);
    });

    it("maps options to monitor, sun, and moon SVG icons", () => {
      const iconMap = Object.fromEntries(THEME_OPTIONS.map((o) => [o.id, o.icon]));
      assert.equal(iconMap.system, "monitor");
      assert.equal(iconMap.light, "sun");
      assert.equal(iconMap.dark, "moon");

      // Verify monitor, sun, moon exist in Icon.tsx
      assert.ok(iconSource.includes('case "monitor":'), "Must have monitor SVG icon");
      assert.ok(iconSource.includes('case "sun":'), "Must have sun SVG icon");
      assert.ok(iconSource.includes('case "moon":'), "Must have moon SVG icon");
    });

    it("strictly enforces VISIBLE TEXT: NONE inside theme tab buttons", () => {
      // Must not render visible label text inside buttons
      assert.ok(
        !componentSource.includes("<span>{opt.label}</span>"),
        "Must NOT render visible text label inside tab button"
      );
      assert.ok(
        componentSource.includes("VISIBLE TEXT: NONE"),
        "Must have explicit design comment/invariant"
      );
    });
  });

  describe("9B. Accessibility and Tooltips", () => {
    it("provides accessible aria-label and tooltip title for all theme buttons", () => {
      assert.ok(
        componentSource.includes('aria-label={`${opt.label} theme`}'),
        "Must provide descriptive aria-label"
      );
      assert.ok(
        componentSource.includes('title={`${opt.label} theme`}'),
        "Must provide tooltip title"
      );
    });

    it("implements role='radiogroup' and role='radio'", () => {
      assert.ok(componentSource.includes('role="radiogroup"'));
      assert.ok(componentSource.includes('role="radio"'));
    });
  });

  describe("9C. Keyboard Navigation & Theme Transitions", () => {
    it("handles ArrowLeft, ArrowRight, Enter, and Space keys", () => {
      assert.ok(componentSource.includes('e.key === "ArrowLeft"'));
      assert.ok(componentSource.includes('e.key === "ArrowRight"'));
      assert.ok(componentSource.includes('e.key === "Enter"'));
      assert.ok(componentSource.includes('e.key === " "'));
    });

    it("computes transitions cyclically across options", () => {
      const len = THEME_OPTIONS.length;
      // System (0) -> ArrowRight -> Light (1)
      let idx = 0;
      idx = (idx + 1) % len;
      assert.equal(THEME_OPTIONS[idx].id, "light");

      // Light (1) -> ArrowRight -> Dark (2)
      idx = (idx + 1) % len;
      assert.equal(THEME_OPTIONS[idx].id, "dark");

      // Dark (2) -> ArrowRight -> System (0)
      idx = (idx + 1) % len;
      assert.equal(THEME_OPTIONS[idx].id, "system");

      // System (0) -> ArrowLeft -> Dark (2)
      idx = (idx - 1 + len) % len;
      assert.equal(THEME_OPTIONS[idx].id, "dark");
    });
  });

  describe("9D. Reduced Motion & CSS Token Integration", () => {
    it("defines styles for .bbq-theme-tabs and .bbq-theme-tab-indicator", () => {
      assert.ok(cssSource.includes(".bbq-theme-tabs"));
      assert.ok(cssSource.includes(".bbq-theme-tab-indicator"));
      assert.ok(cssSource.includes(".bbq-theme-tab-btn"));
    });

    it("disables indicator transition when reduced motion is preferred", () => {
      const normalizedCss = cssSource.replace(/\r\n/g, "\n");
      assert.ok(
        normalizedCss.includes(
          '@media (prefers-reduced-motion: reduce) {\n  .bbq-theme-tab-indicator {\n    transition: none !important;'
        )
      );
      assert.ok(
        normalizedCss.includes(
          '[data-reduced-motion="true"] .bbq-theme-tab-indicator {\n  transition: none !important;'
        )
      );
    });

    it("verifies NO HeroUI or third-party UI libraries are imported", () => {
      assert.ok(!componentSource.includes("@heroui"), "HeroUI must NOT be imported");
      assert.ok(!componentSource.includes("@radix-ui"), "Radix UI must NOT be imported");
      assert.ok(!componentSource.includes("tailwind"), "Tailwind must NOT be imported");
    });
  });
});
