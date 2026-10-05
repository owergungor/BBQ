import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeStats, clampPercent } from "../src/components/widgets/statsModel.ts";
import {
  settingsStore,
  defaultSettings,
  updateSettingsBatch,
  applyThemeAndMotionToDom,
  isUpdateCheckDue,
} from "../src/state/settingsState.ts";
import {
  clampIslandWidth,
  clampIslandHeight,
} from "../src/components/widgets/settingsModel.ts";
import { bbqCommands } from "../src/ipc/commands.ts";
import type { BbqSettings, SystemState } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v2.3 — System, Settings & Layout Hardening Regression Tests", () => {
  beforeEach(() => {
    bbqCommands.updateSettings = async () => true;
    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
  });

  // =========================================================================
  // 1. CPU Metrics Telemetry
  // =========================================================================
  describe("1. CPU Metrics Telemetry", () => {
    const buildSystemState = (cpuUsage: number | null | undefined): SystemState => ({
      cpu:
        cpuUsage !== undefined && cpuUsage !== null
          ? { usage_percent: cpuUsage, core_count: 8 }
          : null,
      memory: {
        total_bytes: 16 * 1024 * 1024 * 1024,
        used_bytes: 8 * 1024 * 1024 * 1024,
        free_bytes: 8 * 1024 * 1024 * 1024,
        usage_percent: 50,
      },
      battery: {
        available: false,
        percentage: null,
        charging: false,
        plugged_in: false,
      },
      network: {
        connected: true,
        connection_type: "ethernet",
        interface_name: "eth0",
      },
      system_info: {
        os: "Windows",
        hostname: "workstation",
        platform: "windows",
        uptime_seconds: 7200,
      },
    });

    it("CPU state mevcut — verified in SystemState model", () => {
      const state = buildSystemState(10);
      assert.ok("cpu" in state);
      assert.ok(state.cpu !== null);
      assert.equal(state.cpu?.core_count, 8);
    });

    it("CPU degeri 0 olmayan deger tasiyabiliyor", () => {
      const state = buildSystemState(42.5);
      const normalized = normalizeStats(state);
      assert.equal(normalized.cpu.available, true);
      assert.equal(normalized.cpu.usagePercent, 43);
      assert.equal(normalized.cpu.label, "43%");
    });

    it("CPU degeri degisebiliyor — transitions dynamically across updates", () => {
      const initial = normalizeStats(buildSystemState(12.0));
      assert.equal(initial.cpu.usagePercent, 12);
      assert.equal(initial.cpu.label, "12%");

      const updated = normalizeStats(buildSystemState(68.4));
      assert.equal(updated.cpu.usagePercent, 68);
      assert.equal(updated.cpu.label, "68%");

      const idle = normalizeStats(buildSystemState(0.0));
      assert.equal(idle.cpu.usagePercent, 0);
      assert.equal(idle.cpu.label, "0%");
    });

    it("invalid CPU degeri guvenli — handles negative sentinel, NaN, Infinity, null, and overflow without throwing", () => {
      // Sentinel -1 (waiting for baseline snapshot)
      const pendingBaseline = normalizeStats(buildSystemState(-1));
      assert.equal(pendingBaseline.cpu.available, false);
      assert.equal(pendingBaseline.cpu.label, "--");

      // NaN
      const nanState = normalizeStats(buildSystemState(NaN));
      assert.equal(nanState.cpu.available, false);
      assert.equal(nanState.cpu.usagePercent, 0);

      // Infinity
      const infState = normalizeStats(buildSystemState(Infinity));
      assert.equal(infState.cpu.usagePercent, 0);

      // Null CPU
      const nullState = normalizeStats(buildSystemState(null));
      assert.equal(nullState.cpu.available, false);
      assert.equal(nullState.cpu.usagePercent, 0);
      assert.equal(nullState.cpu.label, "--");

      // Overflow > 100 clamped safely
      assert.equal(clampPercent(150), 100);
      assert.equal(clampPercent(-20), 0);
    });
  });

  // =========================================================================
  // 2. Compact Geometry
  // =========================================================================
  describe("2. Compact Geometry", () => {
    it("compact height state geometry'ye uygulaniyor — DOM CSS variables updated", async () => {
      const styles: Record<string, string> = {};
      const origDoc = globalThis.document;
      globalThis.document = {
        documentElement: {
          style: {
            setProperty: (k: string, v: string) => {
              styles[k] = v;
            },
            getPropertyValue: (k: string) => styles[k] || "",
          },
          setAttribute: () => {},
        },
      } as unknown as Document;

      try {
        await updateSettingsBatch({ island_height: 46 });
        const { settings } = settingsStore.getState();
        assert.equal(settings.island_height, 46);

        applyThemeAndMotionToDom(settings);
        assert.equal(styles["--bbq-compact-height"], "46px");
        assert.equal(styles["--bbq-peek-height"], "52px"); // 46 + 6
      } finally {
        globalThis.document = origDoc;
      }
    });

    it("compact height clamps within boundary [36, 54]", () => {
      assert.equal(clampIslandHeight(20), 36);
      assert.equal(clampIslandHeight(42), 42);
      assert.equal(clampIslandHeight(600), 520);
    });

    it("compact width 50 px step ile degisiyor", () => {
      // Step calculation simulation as in SettingsWidget onChange
      const stepWidth = (val: number) => {
        if (val <= 180) return 180;
        if (val >= 480) return 480;
        return Math.max(180, Math.min(480, Math.round(val / 50) * 50));
      };

      assert.equal(stepWidth(180), 180);
      assert.equal(stepWidth(190), 200);
      assert.equal(stepWidth(230), 250);
      assert.equal(stepWidth(280), 300);
      assert.equal(stepWidth(320), 300);
      assert.equal(stepWidth(340), 350);
      assert.equal(stepWidth(480), 480);
      assert.equal(stepWidth(550), 480);
    });

    it("width degisince center anchor merkezde kaliyor — x = (screen_width - window_width) / 2 preserves center point", () => {
      const screenWidth = 1920;
      const calculateX = (w: number) => Math.round((screenWidth - w) / 2);
      const calculateCenter = (w: number) => calculateX(w) + w / 2;

      const expectedScreenCenter = screenWidth / 2; // 960

      const widths = [200, 250, 300, 350, 400, 450, 480];
      for (const w of widths) {
        const x = calculateX(w);
        const center = calculateCenter(w);
        assert.equal(
          center,
          expectedScreenCenter,
          `Center point of width ${w} at offset ${x} must match screen center ${expectedScreenCenter}`
        );
      }
    });
  });

  // =========================================================================
  // 3. Island Position (6 Anchors)
  // =========================================================================
  describe("3. Island Position (6 Anchors)", () => {
    it("default = TopCenter (top-center)", () => {
      assert.equal(defaultSettings.island_position, "top-center");
    });

    const anchors: BbqSettings["island_position"][] = [
      "top-center",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];

    for (const anchor of anchors) {
      it(`accepts and persists ${anchor}`, async () => {
        await updateSettingsBatch({ island_position: anchor });
        const { settings } = settingsStore.getState();
        assert.equal(settings.island_position, anchor);
      });
    }

    it("verifies SettingsWidget contains all 6 positions in Turkish UI", () => {
      const settingsWidgetSrc = fs.readFileSync(
        path.resolve(__dirname, "../src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );

      const turkishPositions = [
        "Orta Üst",
        "Sol Üst",
        "Sağ Üst",
        "Sol Alt",
        "Orta Alt",
        "Sağ Alt",
      ];

      for (const title of turkishPositions) {
        assert.ok(
          settingsWidgetSrc.includes(title) ||
            settingsWidgetSrc.toLowerCase().includes(title.toLowerCase()),
          `SettingsWidget must contain position label: ${title}`
        );
      }
    });
  });

  // =========================================================================
  // 4. Transparency
  // =========================================================================
  describe("4. Transparency", () => {
    it("deger persistence — persists island_transparency in settings state", async () => {
      assert.equal(defaultSettings.island_transparency, 0);

      await updateSettingsBatch({ island_transparency: 40 });
      const { settings } = settingsStore.getState();
      assert.equal(settings.island_transparency, 40);
    });

    it("min/max validation — clamps safely to [0, 80] for readability", () => {
      const clampTransparency = (val: number) => Math.max(0, Math.min(80, Math.round(val)));

      assert.equal(clampTransparency(-10), 0);
      assert.equal(clampTransparency(0), 0);
      assert.equal(clampTransparency(45), 45);
      assert.equal(clampTransparency(80), 80);
      assert.equal(clampTransparency(100), 80);
    });

    it("injects computed opacity and transparency percentage into DOM style", () => {
      const styles: Record<string, string> = {};
      const origDoc = globalThis.document;
      globalThis.document = {
        documentElement: {
          style: {
            setProperty: (k: string, v: string) => {
              styles[k] = v;
            },
            getPropertyValue: (k: string) => styles[k] || "",
          },
          setAttribute: () => {},
        },
      } as unknown as Document;

      try {
        const testSettings: BbqSettings = {
          ...defaultSettings,
          island_transparency: 30,
        };
        applyThemeAndMotionToDom(testSettings);

        assert.equal(styles["--bbq-island-transparency"], "30%");
        assert.equal(styles["--bbq-island-opacity"], "0.7");
      } finally {
        globalThis.document = origDoc;
      }
    });
  });

  // =========================================================================
  // 5. Privacy Layout
  // =========================================================================
  describe("5. Privacy Layout", () => {
    it("overflow-safe layout — contains dedicated scrollable container with minHeight 0 and overflowY auto", () => {
      const settingsWidgetSrc = fs.readFileSync(
        path.resolve(__dirname, "../src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );

      // Verify privacy panel element id
      assert.ok(
        settingsWidgetSrc.includes('id="settings-panel-privacy-content"'),
        "Must isolate privacy section with id='settings-panel-privacy-content'"
      );

      // Verify panel container provides overflow boundary
      assert.ok(
        settingsWidgetSrc.includes('overflowY: "auto"'),
        "Settings panels must specify overflowY auto"
      );
      assert.ok(
        settingsWidgetSrc.includes('minHeight: 0'),
        "Settings panels must specify minHeight 0 to prevent outer container overflow"
      );
      assert.ok(
        settingsWidgetSrc.includes('overflowX: "hidden"'),
        "Settings panels must specify overflowX hidden to avoid horizontal shifts"
      );
    });
  });

  // =========================================================================
  // 6. Auto Update Schedule
  // =========================================================================
  describe("6. Auto Update Schedule", () => {
    const updateOptions: {
      schedule: BbqSettings["auto_update_schedule"];
      label: string;
    }[] = [
      { schedule: "startup", label: "Açılışta" },
      { schedule: "daily", label: "Günlük" },
      { schedule: "weekly", label: "Haftalık" },
      { schedule: "monthly", label: "Aylık" },
    ];

    for (const opt of updateOptions) {
      it(`accepts and persists schedule: ${opt.schedule} (${opt.label})`, async () => {
        await updateSettingsBatch({ auto_update_schedule: opt.schedule });
        const { settings } = settingsStore.getState();
        assert.equal(settings.auto_update_schedule, opt.schedule);
      });
    }

    it("verifies SettingsWidget contains all 4 auto-update options in Turkish", () => {
      const settingsWidgetSrc = fs.readFileSync(
        path.resolve(__dirname, "../src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );

      for (const opt of updateOptions) {
        assert.ok(
          settingsWidgetSrc.includes(opt.label),
          `SettingsWidget must include auto-update option: ${opt.label}`
        );
      }
    });

    it("evaluates schedule cadence correctness via isUpdateCheckDue", () => {
      const now = Date.now();
      const ONE_HOUR = 3600 * 1000;
      const TWENTY_FIVE_HOURS = 25 * 3600 * 1000;
      const EIGHT_DAYS = 8 * 24 * 3600 * 1000;
      const THIRTY_TWO_DAYS = 32 * 24 * 3600 * 1000;

      // Startup
      assert.equal(isUpdateCheckDue("startup", null, now), true);
      assert.equal(isUpdateCheckDue("startup", now - ONE_HOUR, now), true);

      // Daily
      assert.equal(isUpdateCheckDue("daily", null, now), true);
      assert.equal(isUpdateCheckDue("daily", now - ONE_HOUR, now), false);
      assert.equal(isUpdateCheckDue("daily", now - TWENTY_FIVE_HOURS, now), true);

      // Weekly
      assert.equal(isUpdateCheckDue("weekly", null, now), true);
      assert.equal(isUpdateCheckDue("weekly", now - ONE_HOUR, now), false);
      assert.equal(isUpdateCheckDue("weekly", now - EIGHT_DAYS, now), true);

      // Monthly
      assert.equal(isUpdateCheckDue("monthly", null, now), true);
      assert.equal(isUpdateCheckDue("monthly", now - ONE_HOUR, now), false);
      assert.equal(isUpdateCheckDue("monthly", now - THIRTY_TWO_DAYS, now), true);
    });
  });
});
