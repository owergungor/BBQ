import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  clampClipboardCapacity,
  clampClipboardRetention,
  MIN_CLIPBOARD_CAPACITY,
  MAX_CLIPBOARD_CAPACITY,
  MIN_CLIPBOARD_RETENTION_DAYS,
  MAX_CLIPBOARD_RETENTION_DAYS,
} from "../src/components/widgets/settingsModel.ts";
import {
  settingsStore,
  defaultSettings,
  updateSettingsBatch,
  resetSettingsToDefaults,
} from "../src/state/settingsState.ts";
import { bbqCommands } from "../src/ipc/commands.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.8 — Phase 2: Settings & Privacy UI Regression Tests", () => {
  const settingsWidgetSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/widgets/SettingsWidget.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const privacyTabSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/widgets/settings/PrivacySettingsTab.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const islandTabSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/widgets/settings/IslandSettingsTab.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const controlsSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/common/SettingsControls.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const iconSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/common/Icon.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const cssSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"), "utf8")
    .replace(/\r\n/g, "\n");

  beforeEach(() => {
    bbqCommands.updateSettings = async () => true;
    bbqCommands.resetSettingsToDefaults = async () => ({ ...defaultSettings });
    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
  });

  // =========================================================================
  // 1. Icon-only Tabs with 1:1 Semantics & Accessibility
  // =========================================================================
  describe("1. Settings Tab 1:1 Icons & Accessible Labels", () => {
    it("ensures all 7 settings tabs map to distinct 1:1 native SVG icons", () => {
      const expectedMapping: Record<string, string> = {
        appearance: "palette",
        island: "monitor",
        hotkey: "keyboard",
        privacy: "lock",
        notifications: "bell",
        widgets: "layout",
        about: "info",
      };

      for (const [tabId, expectedIcon] of Object.entries(expectedMapping)) {
        assert.ok(
          settingsWidgetSrc.includes(`${tabId}: "${expectedIcon}"`),
          `Tab '${tabId}' must map to 1:1 icon '${expectedIcon}' in TAB_ICONS`
        );
        assert.ok(
          iconSrc.includes(`case "${expectedIcon}":`),
          `Icon.tsx must provide native SVG implementation for '${expectedIcon}'`
        );
      }
    });

    it("verifies icon-only tab buttons maintain accessible names and discoverable tooltips", () => {
      assert.ok(
        settingsWidgetSrc.includes('className={`bbq-settings-tab-btn ${isSelected ? "active" : ""}`}'),
        "Must use bbq-settings-tab-btn class"
      );
      assert.ok(
        settingsWidgetSrc.includes("aria-label={tab.label}"),
        "Tab buttons must declare aria-label for screen readers"
      );
      assert.ok(
        settingsWidgetSrc.includes("title={tab.label}"),
        "Tab buttons must provide title tooltip for OS-level discoverability"
      );
      assert.ok(
        settingsWidgetSrc.includes('<span className="bbq-tab-tooltip" role="tooltip" aria-hidden="true">'),
        "Tab buttons must provide visible floating tooltip on hover/focus"
      );
      assert.ok(
        cssSrc.includes(".bbq-tab-tooltip"),
        "CSS must style .bbq-tab-tooltip with hover/focus-visible visibility"
      );
    });

    it("ensures keyboard navigation implements W3C tab pattern (ArrowLeft, ArrowRight, Home, End)", () => {
      assert.ok(
        settingsWidgetSrc.includes("handleTabKeyDown"),
        "Must implement keyboard navigation handler for tabs"
      );
      assert.ok(
        settingsWidgetSrc.includes('e.key === "ArrowRight"'),
        "Must handle ArrowRight navigation"
      );
      assert.ok(
        settingsWidgetSrc.includes('e.key === "ArrowLeft"'),
        "Must handle ArrowLeft navigation"
      );
      assert.ok(
        settingsWidgetSrc.includes('e.key === "Home"'),
        "Must handle Home key navigation"
      );
      assert.ok(
        settingsWidgetSrc.includes('e.key === "End"'),
        "Must handle End key navigation"
      );
    });
  });

  // =========================================================================
  // 2. Privacy Retention Numeric Controls
  // =========================================================================
  describe("2. Privacy Tab Numeric Retention Controls", () => {
    it("replaces sliders with NumberInput controls having programmatic labels and units", () => {
      assert.ok(
        privacyTabSrc.includes("<NumberInput"),
        "PrivacySettingsTab must render NumberInput controls"
      );
      assert.ok(
        privacyTabSrc.includes('id="clipboard-max-input"'),
        "Must provide clipboard-max-input ID"
      );
      assert.ok(
        privacyTabSrc.includes('id="clipboard-retention-input"'),
        "Must provide clipboard-retention-input ID"
      );
      assert.ok(
        privacyTabSrc.includes('unit="items"'),
        "Max entries input must declare 'items' unit"
      );
      assert.ok(
        privacyTabSrc.includes('unit="days"'),
        "Retention period input must declare 'days' unit"
      );
      assert.ok(
        controlsSrc.includes('htmlFor={id}'),
        "NumberInput must programmatically associate label with input via htmlFor"
      );
      assert.ok(
        controlsSrc.includes('type="number"'),
        "NumberInput must render an HTML number input"
      );
    });

    it("verifies clipboard capacity domain bounds [10, 100] and persistence", async () => {
      assert.equal(clampClipboardCapacity(5), MIN_CLIPBOARD_CAPACITY);
      assert.equal(clampClipboardCapacity(10), 10);
      assert.equal(clampClipboardCapacity(50), 50);
      assert.equal(clampClipboardCapacity(100), MAX_CLIPBOARD_CAPACITY);
      assert.equal(clampClipboardCapacity(200), MAX_CLIPBOARD_CAPACITY);
      assert.equal(clampClipboardCapacity(NaN), 100);
      assert.equal(clampClipboardCapacity(null), 100);

      await updateSettingsBatch({ clipboard_max_entries: 50 });
      assert.equal(settingsStore.getState().settings.clipboard_max_entries, 50);
    });

    it("verifies clipboard retention period domain bounds [1, 90] and persistence", async () => {
      assert.equal(clampClipboardRetention(0), MIN_CLIPBOARD_RETENTION_DAYS);
      assert.equal(clampClipboardRetention(1), 1);
      assert.equal(clampClipboardRetention(30), 30);
      assert.equal(clampClipboardRetention(90), MAX_CLIPBOARD_RETENTION_DAYS);
      assert.equal(clampClipboardRetention(120), MAX_CLIPBOARD_RETENTION_DAYS);
      assert.equal(clampClipboardRetention(NaN), 30);
      assert.equal(clampClipboardRetention(null), 30);

      await updateSettingsBatch({ clipboard_retention_days: 14 });
      assert.equal(settingsStore.getState().settings.clipboard_retention_days, 14);
    });
  });

  // =========================================================================
  // 3. Reset Action Scope & Placement Exclusively in Privacy Tab
  // =========================================================================
  describe("3. Reset Action Scope & Placement", () => {
    it("ensures the Reset button is placed exclusively in the Privacy tab", () => {
      assert.ok(
        privacyTabSrc.includes('id="privacy-reset-defaults-btn"'),
        "PrivacySettingsTab must contain the reset action button"
      );
      assert.ok(
        privacyTabSrc.includes('id="privacy-reset-section"'),
        "PrivacySettingsTab must visually separate the reset action in its own section"
      );
      assert.ok(
        !settingsWidgetSrc.includes('aria-label="Reset all preferences to defaults"'),
        "General footer in SettingsWidget must no longer contain the global Reset button"
      );
    });

    it("verifies reset action behavior restores defaults through resetSettingsToDefaults", async () => {
      await updateSettingsBatch({
        theme: "light",
        island_width: 380,
        clipboard_max_entries: 20,
        clipboard_retention_days: 7,
      });

      assert.equal(settingsStore.getState().settings.theme, "light");
      assert.equal(settingsStore.getState().settings.clipboard_max_entries, 20);

      const ok = await resetSettingsToDefaults();
      assert.equal(ok, true);
      assert.equal(settingsStore.getState().settings.theme, defaultSettings.theme);
      assert.equal(settingsStore.getState().settings.clipboard_max_entries, defaultSettings.clipboard_max_entries);
    });
  });

  // =========================================================================
  // 4. Transparency Steps & Accessible Contrast
  // =========================================================================
  describe("4. Transparency Steps & Text Readability", () => {
    it("configures island transparency slider to step by 10 percentage points", () => {
      assert.ok(
        islandTabSrc.includes("step={10}"),
        "IslandSettingsTab transparency slider must use step={10}"
      );
      assert.ok(
        islandTabSrc.includes("Math.round(val / 10) * 10"),
        "IslandSettingsTab must clamp transparency updates to multiples of 10"
      );
      assert.ok(
        settingsWidgetSrc.includes("Math.round(val / 10) * 10"),
        "SettingsWidget commitTransparency must clamp transparency to multiples of 10"
      );
    });

    it("persists transparency in increments of 10 within valid range [0, 80]", async () => {
      const validSteps = [0, 10, 20, 30, 40, 50, 60, 70, 80];
      for (const step of validSteps) {
        await updateSettingsBatch({ island_transparency: step });
        assert.equal(settingsStore.getState().settings.island_transparency, step);
      }
    });

    it("ensures CSS tokens enhance text contrast when island transparency is active", () => {
      assert.ok(
        cssSrc.includes('html:not([data-opaque="true"])'),
        "CSS must define enhanced text contrast tokens for transparent HUD mode"
      );
      assert.ok(
        cssSrc.includes("--bbq-text-muted: #a1a1aa;"),
        "Dark theme transparent mode must elevate --bbq-text-muted to high-contrast #a1a1aa"
      );
      assert.ok(
        cssSrc.includes('html[data-theme="light"]:not([data-opaque="true"])'),
        "Light theme transparent mode must elevate contrast tokens"
      );
    });
  });
});
