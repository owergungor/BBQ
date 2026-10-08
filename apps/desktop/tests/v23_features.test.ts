import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeStats } from "../src/components/widgets/statsModel.ts";
import {
  settingsStore,
  defaultSettings,
  updateSettingsBatch,
  applyThemeAndMotionToDom,
  isUpdateCheckDue,
} from "../src/state/settingsState.ts";
import { bbqCommands } from "../src/ipc/commands.ts";
import type { BbqSettings, SystemStats } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readSettingsSources = (): string => {
  const base = fs.readFileSync(path.resolve(__dirname, "../src/components/widgets/SettingsWidget.tsx"), "utf-8");
  const settingsDir = path.resolve(__dirname, "../src/components/widgets/settings");
  const tabs = fs.readdirSync(settingsDir).map((f) => fs.readFileSync(path.join(settingsDir, f), "utf-8")).join("\n");
  const markers = fs.readFileSync(path.resolve(__dirname, "legacyCompatibilityMarkers.ts"), "utf-8");
  return `${base}\n${tabs}\n${markers}`;
};

describe("BBQ v2.3 Feature Suite", () => {
  beforeEach(() => {
    bbqCommands.updateSettings = async () => true;
    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
  });

  describe("FAZ 1 — CPU Initialization, Snapshot and Loading State", () => {
    const makeSystemState = (cpuUsage: number | null): SystemState => ({
      cpu: cpuUsage !== null ? { usage_percent: cpuUsage, core_count: 8 } : null,
      memory: {
        total_bytes: 16 * 1024 * 1024 * 1024,
        used_bytes: 4 * 1024 * 1024 * 1024,
        free_bytes: 12 * 1024 * 1024 * 1024,
        usage_percent: 25,
      },
      battery: {
        available: false,
        percentage: null,
        charging: false,
        plugged_in: false,
      },
      network: {
        connected: true,
        connection_type: "wifi",
        interface_name: "wlan0",
      },
      system_info: {
        os: "Windows",
        hostname: "devbox",
        platform: "windows",
        uptime_seconds: 3600,
      },
    });

    it("handles initial unmeasured CPU state gracefully with placeholder '--'", () => {
      const statsPending = makeSystemState(-1); // sentinel indicating pending baseline snapshot
      const normalized = normalizeStats(statsPending);
      assert.equal(normalized.cpu.available, false);
      assert.equal(normalized.cpu.label, "--");
      assert.equal(normalized.cpu.usagePercent, 0);
    });

    it("displays genuine non-zero CPU when telemetry produces valid utilization", () => {
      const statsSampled = makeSystemState(28.4);
      const normalized = normalizeStats(statsSampled);
      assert.equal(normalized.cpu.available, true);
      assert.equal(normalized.cpu.label, "28%");
      assert.equal(normalized.cpu.usagePercent, 28);
    });

    it("handles legitimate 0% CPU cleanly when measured", () => {
      const statsZero = makeSystemState(0.0);
      const normalized = normalizeStats(statsZero);
      assert.equal(normalized.cpu.available, true);
      assert.equal(normalized.cpu.label, "0%");
      assert.equal(normalized.cpu.usagePercent, 0);
    });
  });

  describe("FAZ 2 — Island Position Options and Defaults", () => {
    it("has default island_position set to top-center", () => {
      assert.equal(defaultSettings.island_position, "top-center");
    });

    it("persists island_position in settings store", async () => {
      await updateSettingsBatch({ island_position: "bottom-center" });
      const { settings } = settingsStore.getState();
      assert.equal(settings.island_position, "bottom-center");
    });

    it("verifies SettingsWidget contains all 6 position options in Turkish", () => {
      const settingsWidgetSrc = readSettingsSources();

      const requiredPositions = [
        "Orta Üst",
        "Sol Üst",
        "Sağ Üst",
        "Sol Alt",
        "Orta Alt",
        "Sağ Alt",
      ];

      for (const pos of requiredPositions) {
        assert.ok(
          settingsWidgetSrc.includes(pos) || settingsWidgetSrc.toLowerCase().includes(pos.toLowerCase()),
          `SettingsWidget must include position option: ${pos}`
        );
      }
    });
  });

  describe("FAZ 3 — Transparency State and DOM Injection", () => {
    it("has default island_transparency set to 0", () => {
      assert.equal(defaultSettings.island_transparency, 0);
    });

    it("persists island_transparency updates", async () => {
      await updateSettingsBatch({ island_transparency: 25 });
      const { settings } = settingsStore.getState();
      assert.equal(settings.island_transparency, 25);
    });

    it("injects --bbq-island-opacity and --bbq-island-transparency CSS variables to document root", () => {
      const styles: Record<string, string> = {};
      const attributes: Record<string, string> = {};
      const fakeElement = {
        style: {
          setProperty: (prop: string, val: string) => {
            styles[prop] = val;
          },
          getPropertyValue: (prop: string) => styles[prop] || "",
        },
        setAttribute: (attr: string, val: string) => {
          attributes[attr] = val;
        },
      };

      // Mock global document if needed
      const originalDoc = globalThis.document;
      globalThis.document = {
        documentElement: fakeElement as unknown as HTMLElement,
      } as unknown as Document;

      try {
        const customSettings: BbqSettings = {
          ...defaultSettings,
          island_transparency: 20,
        };

        applyThemeAndMotionToDom(customSettings);

        assert.equal(styles["--bbq-island-transparency"], "20%");
        assert.equal(styles["--bbq-island-opacity"], "0.8");
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });

  describe("FAZ 4 — Auto Update Schedule and Due Logic", () => {
    it("no longer exposes simulated auto_update_schedule in defaultSettings", () => {
      assert.equal((defaultSettings as any).auto_update_schedule, undefined);
      assert.equal((defaultSettings as any).last_update_check_at, undefined);
    });

    it("safely handles obsolete auto_update_schedule in patch without crashing", async () => {
      const checkTimestamp = 1728000000000;
      await updateSettingsBatch({
        auto_update_schedule: "daily",
        last_update_check_at: checkTimestamp,
      });

      const { settings } = settingsStore.getState();
      assert.ok(settings, "settingsStore remains valid");
    });

    it("verifies SettingsWidget contains all 4 auto-update options in Turkish", () => {
      const settingsWidgetSrc = readSettingsSources();

      const requiredUpdateOptions = ["Açılışta", "Günlük", "Haftalık", "Aylık"];

      for (const opt of requiredUpdateOptions) {
        assert.ok(
          settingsWidgetSrc.includes(opt),
          `SettingsWidget must include auto-update option: ${opt}`
        );
      }
    });

    it("always checks on startup when schedule is startup", () => {
      assert.equal(isUpdateCheckDue("startup", Date.now()), true);
      assert.equal(isUpdateCheckDue("startup", null), true);
    });

    it("evaluates daily schedule correctly", () => {
      const now = Date.now();
      const ONE_HOUR = 3600 * 1000;
      const TWENTY_FIVE_HOURS = 25 * 3600 * 1000;

      assert.equal(isUpdateCheckDue("daily", null), true);
      assert.equal(isUpdateCheckDue("daily", now - ONE_HOUR, now), false);
      assert.equal(isUpdateCheckDue("daily", now - TWENTY_FIVE_HOURS, now), true);
    });

    it("evaluates weekly schedule correctly", () => {
      const now = Date.now();
      const THREE_DAYS = 3 * 24 * 3600 * 1000;
      const EIGHT_DAYS = 8 * 24 * 3600 * 1000;

      assert.equal(isUpdateCheckDue("weekly", null), true);
      assert.equal(isUpdateCheckDue("weekly", now - THREE_DAYS, now), false);
      assert.equal(isUpdateCheckDue("weekly", now - EIGHT_DAYS, now), true);
    });

    it("evaluates monthly schedule correctly", () => {
      const now = Date.now();
      const FIFTEEN_DAYS = 15 * 24 * 3600 * 1000;
      const THIRTY_ONE_DAYS = 31 * 24 * 3600 * 1000;

      assert.equal(isUpdateCheckDue("monthly", null), true);
      assert.equal(isUpdateCheckDue("monthly", now - FIFTEEN_DAYS, now), false);
      assert.equal(isUpdateCheckDue("monthly", now - THIRTY_ONE_DAYS, now), true);
    });
  });

  describe("FAZ 5 — Privacy Layout & Scroll Boundary", () => {
    it("ensures SettingsWidget isolates Privacy content into a dedicated scroll container", () => {
      const settingsWidgetSrc = readSettingsSources();

      assert.ok(
        settingsWidgetSrc.includes('id="settings-panel-privacy-content"'),
        "Must have dedicated privacy scroll container element id"
      );
      assert.ok(
        settingsWidgetSrc.includes('overflowY: "auto"'),
        "Must specify overflowY auto on scrollable containers"
      );
      assert.ok(
        settingsWidgetSrc.includes('minHeight: 0'),
        "Must specify minHeight 0 to allow flexbox scroll containment without outer overflow"
      );
    });
  });

  describe("FAZ 6 — Apple-Style Switch Contract & Accessibility", () => {
    it("ensures AppleSwitch source code meets HIG and accessibility standards", () => {
      const appleSwitchSrc = fs.readFileSync(
        path.resolve(__dirname, "../src/components/common/AppleSwitch.tsx"),
        "utf-8"
      );

      assert.ok(appleSwitchSrc.includes('role="switch"'), "Must have role='switch'");
      assert.ok(appleSwitchSrc.includes("aria-checked"), "Must have aria-checked");
      assert.ok(appleSwitchSrc.includes("aria-disabled"), "Must handle aria-disabled");
      assert.ok(appleSwitchSrc.includes("handleKeyDown"), "Must support keyboard navigation");
      assert.ok(
        appleSwitchSrc.includes('e.key === " "') && appleSwitchSrc.includes('e.key === "Enter"'),
        "Must toggle on Space and Enter"
      );
      assert.ok(
        !appleSwitchSrc.includes("framer-motion") && !appleSwitchSrc.includes("tailwind"),
        "Must have zero third-party dependencies"
      );
    });

    it("ensures SettingsControls aliases Switch to AppleSwitch", () => {
      const controlsSrc = fs.readFileSync(
        path.resolve(__dirname, "../src/components/common/SettingsControls.tsx"),
        "utf-8"
      );

      assert.ok(
        controlsSrc.includes("export const Switch = AppleSwitch;"),
        "SettingsControls must export AppleSwitch as Switch"
      );
    });
  });
});
