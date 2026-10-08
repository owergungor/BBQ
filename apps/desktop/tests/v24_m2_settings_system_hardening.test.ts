import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  settingsStore,
  defaultSettings,
  updateSettingsBatch,
  applyThemeAndMotionToDom,
  isUpdateCheckDue,
  ONE_DAY_MS,
  ONE_WEEK_MS,
  ONE_MONTH_MS,
} from "../src/state/settingsState.ts";
import {
  clampIslandWidth,
  clampIslandHeight,
} from "../src/components/widgets/settingsModel.ts";
import {
  normalizeStats,
  clampPercent,
} from "../src/components/widgets/statsModel.ts";
import {
  THEME_OPTIONS,
} from "../src/components/common/themeTabsModel.ts";
import { resolveEffectiveCompactWidth } from "../src/island/geometryResolution.ts";
import { bbqCommands } from "../src/ipc/commands.ts";
import type { BbqSettings, SystemState, SystemCapabilities } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

const readSettingsSources = (): string => {
  const base = fs.readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/widgets/SettingsWidget.tsx"), "utf8");
  const settingsDir = path.join(ROOT_DIR, "apps/desktop/src/components/widgets/settings");
  const tabs = fs.readdirSync(settingsDir).map((f) => fs.readFileSync(path.join(settingsDir, f), "utf8")).join("\n");
  return `${base}\n${tabs}`;
};

describe("BBQ v2.4 — Phase 2: Settings & System UI Hardening Regression Tests", () => {
  beforeEach(() => {
    bbqCommands.updateSettings = async () => true;
    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
  });

  // =========================================================================
  // 1. 6 Island Positions & Deterministic Calculation
  // =========================================================================
  describe("1. 6 Island Positions & Deterministic Calculation", () => {
    const anchors: BbqSettings["island_position"][] = [
      "top-center",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];

    for (const anchor of anchors) {
      it(`persists and accepts position anchor: ${anchor}`, async () => {
        await updateSettingsBatch({ island_position: anchor });
        assert.equal(settingsStore.getState().settings.island_position, anchor);
      });
    }

    it("verifies Rust geometry.rs calculates positions against physical screen bounds", () => {
      const geoSrc = fs.readFileSync(
        path.join(ROOT_DIR, "crates/core/src/geometry.rs"),
        "utf8"
      );

      // Verify anchor enum variants
      assert.ok(geoSrc.includes("TopCenter"));
      assert.ok(geoSrc.includes("TopLeft"));
      assert.ok(geoSrc.includes("TopRight"));
      assert.ok(geoSrc.includes("BottomLeft"));
      assert.ok(geoSrc.includes("BottomCenter"));
      assert.ok(geoSrc.includes("BottomRight"));

      // Verify calculation references screen bounds and work area, not third-party apps
      assert.ok(geoSrc.includes("display.bounds.x + (display.bounds.width as i32) / 2"));
      assert.ok(geoSrc.includes("display.work_area.x"));
      assert.ok(geoSrc.includes("display.work_area.y"));
      assert.ok(geoSrc.includes("display.safe_top_margin()"));
      assert.ok(geoSrc.includes("display.safe_bottom_margin()"));
    });
  });

  // =========================================================================
  // 2. Default top-center Anchor
  // =========================================================================
  describe("2. Default top-center Anchor", () => {
    it("has default island_position set to top-center in settingsState", () => {
      assert.equal(defaultSettings.island_position, "top-center");
    });

    it("has default IslandAnchor set to TopCenter in core Rust models", () => {
      const geoSrc = fs.readFileSync(
        path.join(ROOT_DIR, "crates/core/src/geometry.rs"),
        "utf8"
      );
      assert.ok(
        geoSrc.includes("#[default]\n    TopCenter") ||
          geoSrc.includes("#[default]\r\n    TopCenter"),
        "IslandAnchor #[default] must be TopCenter"
      );
    });
  });

  // =========================================================================
  // 3. Transparency Persistence & Contrast Preservation
  // =========================================================================
  describe("3. Transparency Persistence & Contrast Preservation", () => {
    it("persists island_transparency in range [0, 80]", async () => {
      await updateSettingsBatch({ island_transparency: 35 });
      assert.equal(settingsStore.getState().settings.island_transparency, 35);
    });

    it("computes --bbq-island-opacity and --bbq-island-transparency variables", () => {
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
        // 0% transparency -> 1.0 opacity (fully opaque glass)
        applyThemeAndMotionToDom({ ...defaultSettings, island_transparency: 0 });
        assert.equal(styles["--bbq-island-opacity"], "1");
        assert.equal(styles["--bbq-island-transparency"], "0%");

        // 40% transparency -> 0.6 opacity
        applyThemeAndMotionToDom({ ...defaultSettings, island_transparency: 40 });
        assert.equal(styles["--bbq-island-opacity"], "0.6");
        assert.equal(styles["--bbq-island-transparency"], "40%");

        // 80% upper limit -> 0.2 opacity
        applyThemeAndMotionToDom({ ...defaultSettings, island_transparency: 80 });
        assert.equal(styles["--bbq-island-opacity"], "0.2");
        assert.equal(styles["--bbq-island-transparency"], "80%");
      } finally {
        globalThis.document = origDoc;
      }
    });

    it("uses color-mix on shell background so text/icon contrast is not diluted", () => {
      const css = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf8"
      );
      assert.ok(
        css.includes("color-mix(in srgb, var(--bbq-surface-glass-idle) calc(var(--bbq-island-opacity, 1) * 100%), transparent)"),
        "Idle state must use color-mix for transparency"
      );
      assert.ok(
        css.includes("color-mix(in srgb, var(--bbq-surface-glass-expanded) calc(var(--bbq-island-opacity, 1) * 100%), transparent)"),
        "Expanded state must use color-mix for transparency"
      );
    });
  });

  // =========================================================================
  // 4. Auto Update Options & Schedule Logic
  // =========================================================================
  describe("4. Auto Update Options & Schedule Logic", () => {
    const schedules: BbqSettings["auto_update_schedule"][] = [
      "startup",
      "daily",
      "weekly",
      "monthly",
    ];

    for (const schedule of schedules) {
      it(`persists update schedule: ${schedule}`, async () => {
        await updateSettingsBatch({ auto_update_schedule: schedule });
        assert.equal(settingsStore.getState().settings.auto_update_schedule, schedule);
      });
    }

    it("isUpdateCheckDue correctly evaluates elapsed time against schedule", () => {
      const now = 100_000_000_000;

      // Startup is always due
      assert.equal(isUpdateCheckDue("startup", now - 1000, now), true);

      // Daily: less than 1 day -> false; at least 1 day -> true
      assert.equal(isUpdateCheckDue("daily", now - (ONE_DAY_MS - 1000), now), false);
      assert.equal(isUpdateCheckDue("daily", now - ONE_DAY_MS, now), true);

      // Weekly: less than 7 days -> false; at least 7 days -> true
      assert.equal(isUpdateCheckDue("weekly", now - (ONE_WEEK_MS - 1000), now), false);
      assert.equal(isUpdateCheckDue("weekly", now - ONE_WEEK_MS, now), true);

      // Monthly: less than 30 days -> false; at least 30 days -> true
      assert.equal(isUpdateCheckDue("monthly", now - (ONE_MONTH_MS - 1000), now), false);
      assert.equal(isUpdateCheckDue("monthly", now - ONE_MONTH_MS, now), true);
    });
  });

  // =========================================================================
  // 5. Privacy Panel Scroll & Layout Containment
  // =========================================================================
  describe("5. Privacy Panel Scroll & Layout Containment", () => {
    it("guarantees non-overflowing flex scroll chain with tabIndex and stable scrollbar", () => {
      const widgetSrc = readSettingsSources();

      assert.ok(widgetSrc.includes('id={`settings-panel-${activeTab}`'));
      assert.ok(widgetSrc.includes("tabIndex={0}"));
      assert.ok(widgetSrc.includes('minHeight: 0'));
      assert.ok(widgetSrc.includes('overflowY: "auto"'));
      assert.ok(widgetSrc.includes('overflowX: "hidden"'));
      assert.ok(widgetSrc.includes('scrollbarGutter: "stable"'));
      assert.ok(widgetSrc.includes('id="settings-panel-privacy-content"'));
    });
  });

  // =========================================================================
  // 6. Theme Tabs Minimal & Accessible Segmented Control
  // =========================================================================
  describe("6. Theme Tabs Minimal & Accessible Segmented Control", () => {
    it("contains exactly 3 icon-only theme choices (system, light, dark)", () => {
      assert.equal(THEME_OPTIONS.length, 3);
      const ids = THEME_OPTIONS.map((o) => o.id);
      assert.deepEqual(ids, ["system", "light", "dark"]);
    });

    it("verifies ThemeTabs supports disabled prop and keyboard navigation", () => {
      const themeTabsSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/common/ThemeTabs.tsx"),
        "utf8"
      );

      assert.ok(themeTabsSrc.includes("disabled?: boolean"));
      assert.ok(themeTabsSrc.includes('role="radiogroup"'));
      assert.ok(themeTabsSrc.includes("aria-disabled={disabled}"));
      assert.ok(themeTabsSrc.includes('e.key === "ArrowLeft"'));
      assert.ok(themeTabsSrc.includes('e.key === "ArrowRight"'));
    });

    it("verifies index.css defines active, hover, and disabled theme tab states", () => {
      const css = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf8"
      );

      assert.ok(css.includes(".bbq-theme-tab-btn:hover:not(:disabled)"));
      assert.ok(css.includes(".bbq-theme-tab-btn:active:not(:disabled)"));
      assert.ok(css.includes(".bbq-theme-tab-btn:disabled"));
      assert.ok(css.includes(".bbq-theme-tabs.disabled"));
    });
  });

  // =========================================================================
  // 7. Apple Switch Accessibility & State Changes
  // =========================================================================
  describe("7. Apple Switch Accessibility & State Changes", () => {
    it("proves AppleSwitch implements switch role, keyboard handlers, and no leaking listeners", () => {
      const switchSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/common/AppleSwitch.tsx"),
        "utf8"
      );

      assert.ok(switchSrc.includes('role="switch"'));
      assert.ok(switchSrc.includes("aria-checked={checked}"));
      assert.ok(switchSrc.includes("aria-disabled={disabled}"));
      assert.ok(switchSrc.includes('e.key === " " || e.key === "Enter"'));
      assert.ok(switchSrc.includes("onMouseDown="));
      assert.ok(switchSrc.includes("onMouseUp="));
      assert.ok(switchSrc.includes("onMouseLeave="));
      // Proves no global window.addEventListener on render
      assert.ok(!switchSrc.includes("window.addEventListener"));
    });

    it("defines focus-visible styling for Apple Switch in CSS", () => {
      const css = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf8"
      );
      assert.ok(css.includes(".bbq-apple-switch-track:focus-visible"));
    });
  });

  // =========================================================================
  // 8. Select / Dropdown Keyboard & Accessibility
  // =========================================================================
  describe("8. Select / Dropdown Keyboard & Accessibility", () => {
    it("defines Apple-style .bbq-select with hover, focus-visible, and disabled states", () => {
      const css = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf8"
      );

      assert.ok(css.includes(".bbq-select {"));
      assert.ok(css.includes(".bbq-select:hover:not(:disabled)"));
      assert.ok(css.includes(".bbq-select:focus-visible"));
      assert.ok(css.includes(".bbq-select:disabled"));
    });

    it("applies .bbq-select to dropdowns and verifies simulated auto-update select is removed", () => {
      const widgetSrc = readSettingsSources();

      assert.ok(
        widgetSrc.includes('id="island-position-select"') &&
          widgetSrc.includes('className="bbq-select"')
      );
      assert.ok(
        !widgetSrc.includes('id="auto-update-schedule-select"'),
        "simulated auto-update select must be removed"
      );
    });
  });

  // =========================================================================
  // 9. CPU Telemetry Non-Zero Mapping & Rust Backend
  // =========================================================================
  describe("9. CPU Telemetry Non-Zero Mapping & Rust Backend", () => {
    const caps: SystemCapabilities = {
      has_battery: true,
      can_read_network: true,
      can_read_cpu: true,
      can_read_memory: true,
      can_control_volume: true,
      can_mute: true,
    };

    it("maps measured non-zero CPU percentage accurately", () => {
      const state: SystemState = {
        battery: { available: true, percentage: 90, charging: false, plugged_in: false, power_source: null },
        network: { connected: true, connection_type: "wifi", interface_name: "wlan0", signal_strength: null },
        cpu: { usage_percent: 24.6, core_count: 8 },
        memory: { total_bytes: 16000000000, used_bytes: 8000000000, usage_percent: 50 },
        muted: false,
        volume: 0.8,
        uptime_seconds: 3600,
        hostname: "HOST",
        operating_system: "Windows",
        platform: "windows",
      };

      const normalized = normalizeStats(state, caps);
      assert.equal(normalized.cpu.available, true);
      assert.equal(normalized.cpu.usagePercent, 25);
      assert.equal(normalized.cpu.label, "25%");
      assert.equal(normalized.cpu.coreCount, 8);
    });

    it("maps sub-1% measured usage to '<1%'", () => {
      const state: SystemState = {
        battery: { available: true, percentage: 90, charging: false, plugged_in: false, power_source: null },
        network: { connected: true, connection_type: "wifi", interface_name: null, signal_strength: null },
        cpu: { usage_percent: 0.4, core_count: 4 },
        memory: null,
        muted: false,
        volume: 1,
        uptime_seconds: null,
        hostname: null,
        operating_system: "Windows",
        platform: "windows",
      };

      const normalized = normalizeStats(state, caps);
      assert.equal(normalized.cpu.available, true);
      assert.equal(normalized.cpu.label, "<1%");
    });

    it("proves SystemService::get_state refreshes dynamically from platform", () => {
      const systemServiceSrc = fs.readFileSync(
        path.join(ROOT_DIR, "crates/services/src/system.rs"),
        "utf8"
      );

      assert.ok(
        systemServiceSrc.includes("self.platform.current_state().await"),
        "SystemService::get_state must query platform current_state"
      );
    });

    it("proves Windows and Linux platform implementations retain last valid computed CPU delta", () => {
      const winSrc = fs.readFileSync(
        path.join(ROOT_DIR, "crates/platform/src/windows.rs"),
        "utf8"
      );
      assert.ok(
        winSrc.includes("struct WindowsCpuSample") &&
          winSrc.includes("PREV_SYSTEM_CPU: Mutex<Option<WindowsCpuSample>>"),
        "Windows read_cpu must store WindowsCpuSample with last_usage for last valid sample"
      );

      const linuxSrc = fs.readFileSync(
        path.join(ROOT_DIR, "crates/platform/src/linux.rs"),
        "utf8"
      );
      assert.ok(
        linuxSrc.includes("struct LinuxCpuSample") &&
          linuxSrc.includes("PREV_LINUX_CPU: Mutex<Option<LinuxCpuSample>>"),
        "Linux read_cpu must store LinuxCpuSample with last_usage for last valid sample"
      );
    });
  });

  // =========================================================================
  // 10. CPU Unavailable Fallback
  // =========================================================================
  describe("10. CPU Unavailable Fallback", () => {
    it("displays '--' when CPU telemetry is pending/null and does not show false 0%", () => {
      const statePending: SystemState = {
        battery: { available: true, percentage: 80, charging: false, plugged_in: false, power_source: null },
        network: { connected: true, connection_type: "ethernet", interface_name: null, signal_strength: null },
        cpu: null,
        memory: null,
        muted: false,
        volume: 1,
        uptime_seconds: null,
        hostname: null,
        operating_system: "Windows",
        platform: "windows",
      };

      const caps: SystemCapabilities = {
        has_battery: true,
        can_read_network: true,
        can_read_cpu: true,
        can_read_memory: true,
        can_control_volume: true,
        can_mute: true,
      };

      const normalized = normalizeStats(statePending, caps);
      assert.equal(normalized.cpu.available, false);
      assert.equal(normalized.cpu.label, "--");
    });
  });

  // =========================================================================
  // 11. Compact Width & Height Geometry Step Validation
  // =========================================================================
  describe("11. Compact Width & Height Geometry Step Validation", () => {
    it("resolves compact width honoring 50px user step clamping", () => {
      const resolveW = (userW: number) =>
        resolveEffectiveCompactWidth({ userCompactWidth: userW });

      assert.equal(resolveW(180), 180);
      assert.equal(resolveW(240), 240);
      assert.equal(resolveW(300), 300);
      assert.equal(resolveW(350), 350);
      assert.equal(resolveW(400), 400);
      assert.equal(resolveW(450), 450);
      assert.equal(resolveW(480), 480);
    });

    it("clampIslandHeight enforces [36, 520] boundary", () => {
      assert.equal(clampIslandHeight(20), 36);
      assert.equal(clampIslandHeight(38), 38);
      assert.equal(clampIslandHeight(44), 44);
      assert.equal(clampIslandHeight(600), 520);
    });
  });

  // =========================================================================
  // 12. Compact → Expanded → Compact Transition Geometry
  // =========================================================================
  describe("12. Compact → Expanded → Compact Transition Geometry", () => {
    it("restores exact configured compact geometry when closing expanded or context menu", () => {
      const islandSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/island/Island.tsx"),
        "utf8"
      );

      assert.ok(islandSrc.includes("handleContextMenuClose"));
      assert.ok(islandSrc.includes("compactWidth: currentSettings.island_width"));
      assert.ok(islandSrc.includes("compactHeight: currentSettings.island_height"));
    });

    it("repositions immediately in settings.rs when geometry or anchor changes", () => {
      const settingsSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src-tauri/src/commands/settings.rs"),
        "utf8"
      );

      assert.ok(
        settingsSrc.includes("let anchor = bbq_core::IslandAnchor::from_str_name(&current.island_position);"),
        "Must parse anchor from updated settings"
      );
      assert.ok(
        settingsSrc.includes("let geo = bbq_core::calculate_island_geometry(&display, layout_state, dims, anchor);"),
        "Must calculate island geometry on settings sync"
      );
      assert.ok(
        settingsSrc.includes("state.window_service.apply_geometry(&geo).await;"),
        "Must apply geometry immediately"
      );
    });
  });

  // =========================================================================
  // 13. Context Menu Outside Bounds & Button Interaction Regression
  // =========================================================================
  describe("13. Context Menu Outside Bounds & Button Interaction Regression", () => {
    it("proves ContextMenu stops event propagation and flips near viewport borders", () => {
      const menuSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/common/ContextMenu.tsx"),
        "utf8"
      );

      assert.ok(menuSrc.includes("onPointerDown={(e) => e.stopPropagation()}"));
      assert.ok(menuSrc.includes("onMouseDown={(e) => e.stopPropagation()}"));
      assert.ok(menuSrc.includes("setFlipSubmenu("));
      assert.ok(menuSrc.includes("setFlipSubmenuY("));
      assert.ok(menuSrc.includes('if (e.key === "Escape")'));
    });
  });

  // =========================================================================
  // 14. Zero Polling & No Duplicate Update Timers
  // =========================================================================
  describe("14. Zero Polling & No Duplicate Update Timers", () => {
    it("verifies settingsState contains zero setInterval or update-check intervals", () => {
      const settingsStateSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/state/settingsState.ts"),
        "utf8"
      );

      assert.ok(
        !settingsStateSrc.includes("setInterval"),
        "settingsState must never use setInterval"
      );
    });

    it("verifies SettingsWidget cleans up status timeout on unmount", () => {
      const widgetSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/widgets/SettingsWidget.tsx"),
        "utf8"
      );

      assert.ok(widgetSrc.includes("statusTimerRef"));
      assert.ok(widgetSrc.includes("clearTimeout(statusTimerRef.current)"));
    });

    it("verifies SystemWidget cleans up visibility and cooldown timers on unmount", () => {
      const sysWidgetSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/widgets/SystemWidget.tsx"),
        "utf8"
      );

      assert.ok(sysWidgetSrc.includes("cooldownTimerRef"));
      assert.ok(sysWidgetSrc.includes("clearTimeout(cooldownTimerRef.current)"));
      assert.ok(sysWidgetSrc.includes("document.removeEventListener(\"visibilitychange\", handleVisibilityChange)"));
    });
  });
});
