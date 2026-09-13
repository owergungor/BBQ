import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_COMPACT_INDICATOR_ORDER,
  resolveEffectiveIndicatorOrder,
} from "../src/island/compactOrder.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ — Milestone 17: Production UX & Visual System", () => {
  const cssPath = path.resolve(__dirname, "../src/styles/index.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  describe("1. BBQ Visual Design Tokens", () => {
    it("defines comprehensive semantic tokens in :root", () => {
      const requiredTokens = [
        "--bbq-bg",
        "--bbq-surface",
        "--bbq-surface-elevated",
        "--bbq-border",
        "--bbq-text",
        "--bbq-text-muted",
        "--bbq-accent",
        "--bbq-danger",
        "--bbq-success",
        "--bbq-warning",
        "--bbq-shadow",
        "--bbq-focus-ring",
      ];

      for (const token of requiredTokens) {
        assert.ok(
          cssContent.includes(token),
          `Missing required semantic token ${token} in index.css`
        );
      }
    });

    it("defines light theme overrides for semantic tokens", () => {
      assert.ok(
        cssContent.includes('[data-theme="light"]'),
        'Missing [data-theme="light"] selector in index.css'
      );
      assert.ok(
        cssContent.includes('@media (prefers-color-scheme: light)'),
        "Missing prefers-color-scheme media query for system theme support"
      );
    });

    it("enforces universal visible focus rings on :focus-visible", () => {
      assert.ok(
        cssContent.includes(":focus-visible"),
        "Missing :focus-visible rules in index.css"
      );
      assert.ok(
        cssContent.includes("outline: 2px solid var(--bbq-accent)"),
        "Missing standard high-contrast keyboard focus ring in index.css"
      );
    });

    it("enforces reduced motion overrides without layout thrashing", () => {
      assert.ok(
        cssContent.includes('[data-reduced-motion="true"]'),
        'Missing [data-reduced-motion="true"] rules in index.css'
      );
      assert.ok(
        cssContent.includes("animation-duration: 0.01ms"),
        "Reduced motion does not damp animation duration"
      );
    });
  });

  describe("2. Compact Indicator Ordering Pipeline", () => {
    it("exports DEFAULT_COMPACT_INDICATOR_ORDER with all standard indicators", () => {
      assert.ok(Array.isArray(DEFAULT_COMPACT_INDICATOR_ORDER));
      assert.deepEqual(DEFAULT_COMPACT_INDICATOR_ORDER, [
        "drop",
        "media",
        "timer",
        "reminder",
        "files",
        "clipboard",
        "launcher",
        "system",
      ]);
    });

    it("returns default order when persisted order is empty", () => {
      const effective = resolveEffectiveIndicatorOrder([], []);
      assert.deepEqual(effective, DEFAULT_COMPACT_INDICATOR_ORDER);
    });

    it("applies user custom persisted order and appends missing defaults", () => {
      const customOrder = ["timer", "launcher", "media"];
      const effective = resolveEffectiveIndicatorOrder(customOrder, []);

      // First 3 should be the user-specified priority
      assert.equal(effective[0], "timer");
      assert.equal(effective[1], "launcher");
      assert.equal(effective[2], "media");

      // Remaining should be the unlisted defaults in standard order
      const remaining = effective.slice(3);
      assert.deepEqual(remaining, ["drop", "reminder", "files", "clipboard", "system"]);
    });

    it("filters out disabled widgets from effective order deterministically", () => {
      const disabled = ["media", "clipboard"];
      const effective = resolveEffectiveIndicatorOrder([], disabled);

      assert.ok(!effective.includes("media"), "media should be excluded");
      assert.ok(!effective.includes("clipboard"), "clipboard should be excluded");
      assert.equal(effective.length, DEFAULT_COMPACT_INDICATOR_ORDER.length - 2);
    });

    it("ignores unknown or deprecated indicator keys in persisted order", () => {
      const dirtyPersisted = ["invalid_indicator", "timer", "nonexistent"];
      const effective = resolveEffectiveIndicatorOrder(dirtyPersisted, []);

      assert.equal(effective[0], "timer");
      assert.ok(!effective.includes("invalid_indicator"));
      assert.ok(!effective.includes("nonexistent"));
      assert.equal(effective.length, DEFAULT_COMPACT_INDICATOR_ORDER.length);
    });
  });

  describe("3. Launcher UX Integrity", () => {
    const launcherPath = path.resolve(__dirname, "../src/components/widgets/LauncherWidget.tsx");
    const launcherCode = fs.readFileSync(launcherPath, "utf-8");

    it("routes open_settings action strictly to settings widget, not system", () => {
      const normalizedCode = launcherCode.replace(/\r\n/g, "\n");
      assert.ok(
        normalizedCode.includes('case "open_settings":\n            onSelectWidget("settings");'),
        "Launcher open_settings action must route to 'settings'"
      );
      assert.ok(
        !normalizedCode.includes('case "open_settings":\n            onSelectWidget("system");'),
        "Bug regression: open_settings must not route to 'system'"
      );
    });

    it("routes open_files action strictly to files widget", () => {
      const normalizedCode = launcherCode.replace(/\r\n/g, "\n");
      assert.ok(
        normalizedCode.includes('case "open_files":\n            onSelectWidget("files");'),
        "Launcher open_files action must route to 'files'"
      );
    });

    it("provides aria-activedescendant for accessible listbox navigation", () => {
      assert.ok(
        launcherCode.includes("aria-activedescendant="),
        "Launcher search input must provide aria-activedescendant"
      );
    });
  });

  describe("4. Settings Widget Structure & Accessibility", () => {
    const settingsPath = path.resolve(__dirname, "../src/components/widgets/SettingsWidget.tsx");
    const settingsCode = fs.readFileSync(settingsPath, "utf-8");

    it("defines the 6 production UX tabs", () => {
      const requiredTabs = ["appearance", "island", "hotkey", "privacy", "notifications", "widgets"];
      for (const tab of requiredTabs) {
        assert.ok(
          settingsCode.includes(`id: "${tab}"`),
          `SettingsWidget missing tab ${tab}`
        );
      }
    });

    it("implements notification sound controls", () => {
      assert.ok(
        settingsCode.includes("timer_sound_enabled"),
        "SettingsWidget missing timer_sound_enabled toggle"
      );
      assert.ok(
        settingsCode.includes("reminder_sound_enabled"),
        "SettingsWidget missing reminder_sound_enabled toggle"
      );
    });

    it("implements launch at login toggle in appearance preferences", () => {
      assert.ok(
        settingsCode.includes('handleToggle("start_at_login"'),
        "SettingsWidget missing start_at_login toggle"
      );
    });

    it("implements compact indicator priority reordering controls", () => {
      assert.ok(
        settingsCode.includes("moveIndicator(idx, \"up\")"),
        "SettingsWidget missing moveIndicator up action"
      );
      assert.ok(
        settingsCode.includes("moveIndicator(idx, \"down\")"),
        "SettingsWidget missing moveIndicator down action"
      );
      assert.ok(
        settingsCode.includes("resetIndicatorOrder"),
        "SettingsWidget missing resetIndicatorOrder action"
      );
    });

    it("uses accessible role=tablist and role=tabpanel", () => {
      assert.ok(
        settingsCode.includes('role="tablist"'),
        "SettingsWidget missing role=tablist"
      );
      assert.ok(
        settingsCode.includes('role="tabpanel"'),
        "SettingsWidget missing role=tabpanel"
      );
    });
  });

  describe("5. Keyboard Tab Navigation in IslandNavigation", () => {
    const navPath = path.resolve(__dirname, "../src/components/island/IslandNavigation.tsx");
    const navCode = fs.readFileSync(navPath, "utf-8");

    it("implements ArrowLeft and ArrowRight keyboard navigation across tabs", () => {
      assert.ok(
        navCode.includes('e.key === "ArrowRight"'),
        "IslandNavigation missing ArrowRight keyboard handler"
      );
      assert.ok(
        navCode.includes('e.key === "ArrowLeft"'),
        "IslandNavigation missing ArrowLeft keyboard handler"
      );
      assert.ok(
        navCode.includes('e.key === "Home"'),
        "IslandNavigation missing Home key handler"
      );
      assert.ok(
        navCode.includes('e.key === "End"'),
        "IslandNavigation missing End key handler"
      );
    });
  });
});
