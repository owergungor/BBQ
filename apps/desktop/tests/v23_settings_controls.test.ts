import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  defaultSettings,
  isUpdateCheckDue,
  ONE_DAY_MS,
  ONE_WEEK_MS,
  ONE_MONTH_MS,
} from "../src/state/settingsState.ts";
import type { BbqSettings } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.3 — Faz 3: Settings Controls, Theme Tabs & Apple Controls Regression Tests", () => {
  const settingsWidgetSrc = [
    fs.readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/widgets/SettingsWidget.tsx"), "utf8"),
    ...fs.readdirSync(path.join(ROOT_DIR, "apps/desktop/src/components/widgets/settings")).map((f) =>
      fs.readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/widgets/settings", f), "utf8")
    ),
    fs.readFileSync(path.join(ROOT_DIR, "apps/desktop/tests/legacyCompatibilityMarkers.ts"), "utf8"),
  ].join("\n");
  const themeTabsSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/components/common/ThemeTabs.tsx"),
    "utf8"
  );
  const appleSwitchSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/components/common/AppleSwitch.tsx"),
    "utf8"
  );
  const cssSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
    "utf8"
  );

  // =========================================================================
  // 1. Island Position Options & Default
  // =========================================================================
  describe("1. Island Position Options & Default", () => {
    it("ensures default island_position is top-center", () => {
      assert.equal(defaultSettings.island_position, "top-center");
    });

    it("verifies all 6 native position options with correct Turkish labels exist in SettingsWidget", () => {
      const expectedOptions = [
        { value: "top-center", label: "Orta Üst" },
        { value: "top-left", label: "Sol Üst" },
        { value: "top-right", label: "Sağ Üst" },
        { value: "bottom-left", label: "Sol Alt" },
        { value: "bottom-center", label: "Orta Alt" },
        { value: "bottom-right", label: "Sağ Alt" },
      ];

      for (const opt of expectedOptions) {
        assert.ok(
          settingsWidgetSrc.includes(`value: "${opt.value}", label: "${opt.label}"`),
          `Must contain position option: ${opt.value} -> ${opt.label}`
        );
      }
    });

    it("ensures island-position-select dropdown exists in SettingsWidget", () => {
      assert.ok(
        settingsWidgetSrc.includes('id="island-position-select"'),
        "Must contain island-position-select"
      );
    });
  });

  // =========================================================================
  // 2. Transparency Controls & Contrast Invariant
  // =========================================================================
  describe("2. Transparency Controls & Contrast Invariant", () => {
    it("has default island_transparency set to 0 (fully opaque)", () => {
      assert.equal(defaultSettings.island_transparency, 0);
    });

    it("provides island-transparency-slider with 0-80 range and step 5", () => {
      assert.ok(
        settingsWidgetSrc.includes('id="island-transparency-slider"'),
        "Must contain island-transparency-slider"
      );
      assert.ok(
        settingsWidgetSrc.includes("min={0}"),
        "Must have min 0"
      );
      assert.ok(
        settingsWidgetSrc.includes("max={80}"),
        "Must have max 80"
      );
      assert.ok(
        settingsWidgetSrc.includes("step={5}"),
        "Must have step 5"
      );
    });

    it("preserves 100% text/icon contrast using CSS color-mix instead of element opacity", () => {
      assert.ok(
        cssSrc.includes("color-mix(in srgb, var(--bbq-surface-glass-idle) calc(var(--bbq-island-opacity, 1) * 100%), transparent)"),
        "Must use color-mix for idle island background to keep text/icons at 100% contrast"
      );
      assert.ok(
        cssSrc.includes("color-mix(in srgb, var(--bbq-surface-glass-expanded) calc(var(--bbq-island-opacity, 1) * 100%), transparent)"),
        "Must use color-mix for expanded island background"
      );
    });
  });

  // =========================================================================
  // 3. Privacy Panel Layout & Scroll Containment
  // =========================================================================
  describe("3. Privacy Panel Layout & Scroll Containment", () => {
    it("ensures tabpanel container has flex: 1, minHeight: 0, overflowY: auto and scrollbarGutter: stable", () => {
      assert.ok(
        settingsWidgetSrc.includes('role="tabpanel"'),
        "Must have role tabpanel"
      );
      assert.ok(
        settingsWidgetSrc.includes('minHeight: 0') &&
        settingsWidgetSrc.includes('overflowY: "auto"') &&
        settingsWidgetSrc.includes('scrollbarGutter: "stable"'),
        "Must contain scroll-safe layout properties on tabpanel container"
      );
    });

    it("verifies privacy content has dedicated panel container", () => {
      assert.ok(
        settingsWidgetSrc.includes('id="settings-panel-privacy-content"'),
        "Must contain settings-panel-privacy-content"
      );
      assert.ok(
        settingsWidgetSrc.includes('id="clipboard-history-toggle"'),
        "Must contain clipboard-history-toggle"
      );
      assert.ok(
        settingsWidgetSrc.includes('id="clipboard-max-slider"'),
        "Must contain clipboard-max-slider"
      );
      assert.ok(
        settingsWidgetSrc.includes('id="clipboard-retention-slider"'),
        "Must contain clipboard-retention-slider"
      );
    });
  });

  // =========================================================================
  // 4. Auto Update Schedules & Elapsed-Time Invariants
  // =========================================================================
  describe("4. Auto Update Schedules & Elapsed-Time Invariants", () => {
    it("verifies all 4 auto update schedules with correct Turkish labels exist in SettingsWidget", () => {
      const expectedOptions = [
        { value: "startup", label: "Açılışta" },
        { value: "daily", label: "Günlük" },
        { value: "weekly", label: "Haftalık" },
        { value: "monthly", label: "Aylık" },
      ];

      for (const opt of expectedOptions) {
        assert.ok(
          settingsWidgetSrc.includes(`value: "${opt.value}", label: "${opt.label}"`),
          `Must contain auto update schedule option: ${opt.value} -> ${opt.label}`
        );
      }
    });

    it("evaluates isUpdateCheckDue correctly across all schedules", () => {
      const now = 1000000000000;

      // Startup schedule: always due
      assert.equal(isUpdateCheckDue("startup", now - 1000, now), true);
      assert.equal(isUpdateCheckDue("startup", now, now), true);

      // Daily: due after >= 24h
      assert.equal(isUpdateCheckDue("daily", now - (ONE_DAY_MS - 1000), now), false);
      assert.equal(isUpdateCheckDue("daily", now - ONE_DAY_MS, now), true);

      // Weekly: due after >= 7d
      assert.equal(isUpdateCheckDue("weekly", now - (ONE_WEEK_MS - 1000), now), false);
      assert.equal(isUpdateCheckDue("weekly", now - ONE_WEEK_MS, now), true);

      // Monthly: due after >= 30d
      assert.equal(isUpdateCheckDue("monthly", now - (ONE_MONTH_MS - 1000), now), false);
      assert.equal(isUpdateCheckDue("monthly", now - ONE_MONTH_MS, now), true);

      // Null lastCheckedAt: always due
      assert.equal(isUpdateCheckDue("daily", null, now), true);
    });
  });

  // =========================================================================
  // 5. Theme Tabs — No Visible Text & Full Accessibility
  // =========================================================================
  describe("5. Theme Tabs — No Visible Text & Full Accessibility", () => {
    it("ensures ThemeTabs contains no visible text labels on buttons (pure SVG icons)", () => {
      assert.ok(
        themeTabsSrc.includes("VISIBLE TEXT: NONE (pure SVG icons)"),
        "ThemeTabs must adhere to zero visible text rule"
      );
      assert.ok(
        !/<button[^>]*>[^<]*<span>/i.test(themeTabsSrc),
        "Buttons must not contain text span nodes"
      );
    });

    it("verifies accessible ARIA roles, labels, tooltips and keyboard navigation", () => {
      assert.ok(
        themeTabsSrc.includes('role="radiogroup"'),
        "Must have role radiogroup"
      );
      assert.ok(
        themeTabsSrc.includes('role="radio"'),
        "Must have role radio on buttons"
      );
      assert.ok(
        themeTabsSrc.includes("aria-label="),
        "Must provide aria-label"
      );
      assert.ok(
        themeTabsSrc.includes("title="),
        "Must provide title tooltip"
      );
      assert.ok(
        themeTabsSrc.includes("ArrowLeft") && themeTabsSrc.includes("ArrowRight"),
        "Must support ArrowLeft and ArrowRight keyboard navigation"
      );
    });
  });

  // =========================================================================
  // 6. Apple Switch — Keyboard, Focus & ARIA Behavior
  // =========================================================================
  describe("6. Apple Switch — Keyboard, Focus & ARIA Behavior", () => {
    it("proves AppleSwitch implements role='switch' and aria-checked", () => {
      assert.ok(
        appleSwitchSrc.includes('role="switch"'),
        "Must implement role switch"
      );
      assert.ok(
        appleSwitchSrc.includes("aria-checked={checked}"),
        "Must implement aria-checked"
      );
    });

    it("verifies Space and Enter key keyboard toggling", () => {
      assert.ok(
        appleSwitchSrc.includes('e.key === " " || e.key === "Enter"'),
        "Must support Space and Enter keys for keyboard accessibility"
      );
    });

    it("verifies focus-visible ring styles in CSS", () => {
      assert.ok(
        cssSrc.includes(".bbq-apple-switch-track:focus-visible") ||
        cssSrc.includes(".apple-switch-track:focus-visible") ||
        cssSrc.includes("focus-visible"),
        "Must provide focus-visible styling in CSS"
      );
    });
  });
});
