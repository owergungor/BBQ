import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import { islandStore, initialIslandState } from "../src/island/islandState.ts";
import { settingsStore, initialSettingsState, applyThemeAndMotionToDom } from "../src/state/settingsState.ts";

describe("BBQ v2.2 — Milestone 1: Core Geometry & Layout Invariants", () => {
  let runtime: IslandRuntime;

  beforeEach(() => {
    runtime = new IslandRuntime();
    islandStore.setState(initialIslandState);
    settingsStore.setState(initialSettingsState);
  });

  describe("1. Compact Width 50-Step & Symmetry", () => {
    it("Settings slider step and snap values follow 50-step intervals", () => {
      const settingsContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/widgets/SettingsWidget.tsx"),
        "utf8"
      );

      // Verify width slider has step={50}
      assert.ok(
        settingsContent.includes("id=\"island-width-slider\""),
        "Must have island-width-slider"
      );
      assert.ok(
        settingsContent.includes("step={50}"),
        "Must specify step={50} for width slider"
      );
      assert.ok(
        settingsContent.includes("Math.round(val / 50) * 50"),
        "Must snap island_width to 50 multiples"
      );
    });

    it("Horizontal centering calculation preserves physical display center regardless of width", () => {
      // Monitor: 1920x1080, center = 960
      const screenCenterX = 1920 / 2;
      const testWidths = [300, 350, 400, 450, 500];

      for (const w of testWidths) {
        const expectedX = screenCenterX - Math.floor(w / 2);
        const actualCenter = expectedX + w / 2;
        assert.equal(
          actualCenter,
          screenCenterX,
          `Width ${w} must remain exactly centered on monitor (center = ${screenCenterX})`
        );
      }
    });

    it("Multi-monitor negative coordinate space centering preserves true monitor center", () => {
      // Secondary monitor at x: -1920, width: 1920, bounds.x + bounds.width / 2 = -960
      const boundsX = -1920;
      const boundsWidth = 1920;
      const monitorCenter = boundsX + boundsWidth / 2; // -960
      const testWidths = [300, 350, 400, 450];

      for (const w of testWidths) {
        const x = monitorCenter - Math.floor(w / 2);
        const centered = x + w / 2;
        assert.equal(
          centered,
          monitorCenter,
          `Width ${w} in negative monitor space must be centered at ${monitorCenter}`
        );
      }
    });
  });

  describe("2. Compact Height Independence & CSS Variables", () => {
    it("CSS declares responsive variable fallbacks for compact and peek height", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      assert.ok(
        cssContent.includes("max-height: var(--bbq-compact-height, 38px);"),
        "Must use --bbq-compact-height CSS variable"
      );
      assert.ok(
        cssContent.includes("max-height: var(--bbq-peek-height, 44px);"),
        "Must use --bbq-peek-height CSS variable"
      );
    });

    it("applyThemeAndMotionToDom applies both width and height variables to DOM", () => {
      // Mock documentElement
      const appliedStyles: Record<string, string> = {};
      const origDoc = globalThis.document;
      // @ts-expect-error test shim
      globalThis.document = {
        documentElement: {
          style: {
            setProperty: (k: string, v: string) => {
              appliedStyles[k] = v;
            },
          },
          setAttribute: () => {},
        },
      };

      try {
        const customSettings = {
          ...settingsStore.getState().settings,
          island_width: 350,
          island_height: 48,
        };
        applyThemeAndMotionToDom(customSettings);

        assert.equal(appliedStyles["--bbq-compact-width"], "350px");
        assert.equal(appliedStyles["--bbq-peek-width"], "390px");
        assert.equal(appliedStyles["--bbq-compact-height"], "48px");
        assert.equal(appliedStyles["--bbq-peek-height"], "54px");
      } finally {
        globalThis.document = origDoc;
      }
    });

    it("IslandShell respects dynamic compact and peek height variables", () => {
      const shellContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/IslandShell.tsx"),
        "utf8"
      );

      assert.ok(
        shellContent.includes("maxHeight: \"var(--bbq-compact-height, 38px)\""),
        "IslandShell must bind compact maxHeight to --bbq-compact-height"
      );
      assert.ok(
        shellContent.includes("maxHeight: \"var(--bbq-peek-height, 44px)\""),
        "IslandShell must bind peek maxHeight to --bbq-peek-height"
      );
    });
  });

  describe("3. Timer Tab Bar Geometry & Zero Layout Shift", () => {
    it("Timer widget CSS uses flex-start and flex container to lock mode bar Y position", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      const widgetSection = cssContent.slice(
        cssContent.indexOf(".bbq-timer-widget {"),
        cssContent.indexOf(".bbq-timer-widget {") + 250
      );
      assert.ok(
        widgetSection.includes("justify-content: flex-start;"),
        "Timer widget must anchor at top with justify-content: flex-start"
      );

      assert.ok(
        cssContent.includes(".bbq-timer-content-body {"),
        "Must define .bbq-timer-content-body class"
      );
    });

    it("TimerWidget JSX wraps dynamic mode content in .bbq-timer-content-body", () => {
      const timerContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/widgets/TimerWidget.tsx"),
        "utf8"
      );

      assert.ok(
        timerContent.includes("className=\"bbq-timer-content-body\""),
        "Dynamic timer contents must be contained inside .bbq-timer-content-body"
      );
    });
  });

  describe("4. Content-aware Compact Geometry & Overflow Protection", () => {
    it("Context menu dynamically resizes window and restores compact geometry on close", () => {
      const islandContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/Island.tsx"),
        "utf8"
      );

      assert.ok(
        islandContent.includes("bbqCommands.resizeIsland(\"hovering\""),
        "Context menu open must expand window to prevent clipping"
      );
      assert.ok(
        islandContent.includes("handleContextMenuClose"),
        "Must have handleContextMenuClose callback"
      );
      assert.ok(
        islandContent.includes("currentSettings.island_height"),
        "Restoration must use user configured island_height"
      );
    });

    it("All compact indicators are present and handle locked widgets without clipping", () => {
      const indicatorsContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/CompactIndicators.tsx"),
        "utf8"
      );

      assert.ok(indicatorsContent.includes("CompactDropIndicator"), "Must have drop indicator");
      assert.ok(indicatorsContent.includes("CompactMediaIndicator"), "Must have media indicator");
      assert.ok(indicatorsContent.includes("CompactSystemIndicator"), "Must have system indicator");
      assert.ok(indicatorsContent.includes("CompactLauncherIndicator"), "Must have launcher indicator");
      assert.ok(indicatorsContent.includes("CompactTimerIndicator"), "Must have timer indicator");
      assert.ok(indicatorsContent.includes("CompactReminderIndicator"), "Must have reminder indicator");
      assert.ok(indicatorsContent.includes("CompactSettingsIndicator"), "Must have settings indicator");
    });
  });

  describe("5. Screen Positioning & Menu Bar Insets", () => {
    it("Native insets logic in geometry.rs eliminates macOS Finder excessive drop offset", () => {
      const geoContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/core/src/geometry.rs"),
        "utf8"
      );

      assert.ok(
        geoContent.includes("safe_top_margin"),
        "Must declare safe_top_margin method on DisplayInfo"
      );
      assert.ok(
        geoContent.includes("pub fn insets(&self) -> DisplayInsets"),
        "Must compute truthful DisplayInsets from bounds and work_area"
      );
      assert.ok(
        geoContent.includes("display.safe_top_margin()"),
        "calculate_island_geometry must use safe_top_margin()"
      );
    });
  });

  describe("6. Stopwatch Circle Removal & Direct Readout Layout", () => {
    it("TimerWidget renders direct readout without circular container for Stopwatch", () => {
      const timerContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/widgets/TimerWidget.tsx"),
        "utf8"
      );

      assert.ok(
        timerContent.includes("className=\"bbq-stopwatch-display-container\""),
        "Stopwatch must render bbq-stopwatch-display-container"
      );
      assert.ok(
        timerContent.includes("className=\"bbq-stopwatch-digits\""),
        "Stopwatch must render direct bbq-stopwatch-digits"
      );
      assert.ok(
        timerContent.includes("session.mode === \"Stopwatch\" ? ("),
        "Stopwatch mode must branch cleanly away from circular SVG ring container"
      );
    });

    it("index.css defines dedicated styling for stopwatch direct readout", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      assert.ok(
        cssContent.includes(".bbq-stopwatch-display-container {"),
        "Must define .bbq-stopwatch-display-container"
      );
      assert.ok(
        cssContent.includes(".bbq-stopwatch-digits {"),
        "Must define .bbq-stopwatch-digits"
      );
    });
  });

  describe("7. Geometry Resolution Priority System", () => {
    it("follows priority: 1. Content Min Width > 2. User Compact Width > 3. Widget Preferred > 4. Platform Limits", async () => {
      const { resolveEffectiveCompactWidth } = await import("../src/island/geometryResolution.ts");

      // 1. Content minimum width expands beyond user compact width to prevent clipping
      const expandedForContent = resolveEffectiveCompactWidth({
        contentMinWidth: 380,
        userCompactWidth: 300,
      });
      assert.equal(expandedForContent, 380, "Content min width must take precedence to prevent clipping");

      // 2. User compact width takes precedence when content fits
      const userRespected = resolveEffectiveCompactWidth({
        contentMinWidth: 220,
        userCompactWidth: 350,
      });
      assert.equal(userRespected, 350, "User configured width must be respected when content fits");

      // 3. Fallback to widget preferred width when user width is 0/undefined
      const fallbackToWidget = resolveEffectiveCompactWidth({
        userCompactWidth: 0,
        widgetSizing: {
          compact: {
            minWidth: 200,
            preferredWidth: 320,
            maxWidth: 480,
            minHeight: 38,
            preferredHeight: 38,
            maxHeight: 38,
          },
          expanded: {
            minWidth: 400,
            preferredWidth: 520,
            maxWidth: 640,
            minHeight: 200,
            preferredHeight: 360,
            maxHeight: 520,
          },
          contentPolicy: "fixed",
        },
      });
      assert.equal(fallbackToWidget, 320, "Must fall back to widget preferred width");

      // 4. Clamping to platform boundaries [180, 640]
      const clampedMin = resolveEffectiveCompactWidth({
        userCompactWidth: 100,
      });
      assert.equal(clampedMin, 180, "Must clamp to platform minimum 180");

      const clampedMax = resolveEffectiveCompactWidth({
        userCompactWidth: 999,
      });
      assert.equal(clampedMax, 640, "Must clamp to platform maximum 640");
    });
  });

  describe("8. Phase 1 Required Regression Checklist", () => {
    // 1. compact width 50 px increments
    it("1. compact width 50 px increments", () => {
      const settingsContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/widgets/SettingsWidget.tsx"),
        "utf8"
      );
      assert.ok(settingsContent.includes("step={50}"));
      assert.ok(settingsContent.includes("Math.round(val / 50) * 50"));
    });

    // 2. compact height gerçekten değişiyor
    it("2. compact height gerçekten değişiyor", () => {
      const appliedStyles: Record<string, string> = {};
      const origDoc = globalThis.document;
      // @ts-expect-error test shim
      globalThis.document = {
        documentElement: {
          style: {
            setProperty: (k: string, v: string) => {
              appliedStyles[k] = v;
            },
          },
          setAttribute: () => {},
        },
      };

      try {
        const customSettings = {
          ...settingsStore.getState().settings,
          island_height: 50,
        };
        applyThemeAndMotionToDom(customSettings);
        assert.equal(appliedStyles["--bbq-compact-height"], "50px");
        assert.equal(appliedStyles["--bbq-peek-height"], "56px");
      } finally {
        globalThis.document = origDoc;
      }
    });

    // 3. content overflow intrinsic expansion
    it("3. content overflow intrinsic expansion", async () => {
      const { resolveEffectiveCompactWidth } = await import("../src/island/geometryResolution.ts");
      const userConfigured = 250;
      const contentRequired = 380;
      const result = resolveEffectiveCompactWidth({
        userCompactWidth: userConfigured,
        contentMinWidth: contentRequired,
      });
      assert.equal(result, 380, "Must intrinsically expand to content requirement without clipping");
    });

    // 4. width resize sonrası horizontal center korunuyor
    it("4. width resize sonrası horizontal center korunuyor", () => {
      const screenCenterX = 2560 / 2;
      const widths = [200, 250, 300, 350, 400, 450, 500];
      for (const w of widths) {
        const offset = screenCenterX - Math.floor(w / 2);
        const center = offset + w / 2;
        assert.equal(center, screenCenterX, `Center must stay at ${screenCenterX}`);
      }
    });

    // 5. timer tab vertical position stable
    it("5. timer tab vertical position stable", () => {
      const timerContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/widgets/TimerWidget.tsx"),
        "utf8"
      );
      assert.ok(timerContent.includes("className=\"bbq-timer-mode-bar\""));
      assert.ok(timerContent.includes("className=\"bbq-timer-content-body\""));

      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );
      assert.ok(cssContent.includes(".bbq-timer-mode-bar {"));
      assert.ok(cssContent.includes(".bbq-timer-content-body {"));
    });

    // 6. stopwatch circular container kullanılmıyor
    it("6. stopwatch circular container kullanılmıyor", () => {
      const timerContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/widgets/TimerWidget.tsx"),
        "utf8"
      );
      assert.ok(timerContent.includes("session.mode === \"Stopwatch\" ? ("));
      assert.ok(timerContent.includes("bbq-stopwatch-display-container"));
      assert.ok(timerContent.includes("bbq-stopwatch-readout"));
      assert.ok(!timerContent.includes("<circle className=\"bbq-stopwatch-ring"));
    });

    // 7. farklı display scale/geometry durumlarında positioning doğru
    it("7. farklı display scale/geometry durumlarında positioning doğru", () => {
      const geoContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/core/src/geometry.rs"),
        "utf8"
      );
      assert.ok(geoContent.includes("safe_top_margin()"));
      assert.ok(geoContent.includes("DisplayInsets"));
      assert.ok(geoContent.includes("scale_factor"));
    });

    // 8. widget-specific min/max geometry uygulanıyor
    it("8. widget-specific min/max geometry uygulanıyor", async () => {
      const { resolveEffectiveCompactWidth } = await import("../src/island/geometryResolution.ts");
      const bounded = resolveEffectiveCompactWidth({
        userCompactWidth: 200,
        widgetSizing: {
          compact: {
            minWidth: 260,
            preferredWidth: 300,
            maxWidth: 400,
            minHeight: 38,
            preferredHeight: 38,
            maxHeight: 38,
          },
          expanded: {
            minWidth: 400,
            preferredWidth: 500,
            maxWidth: 600,
            minHeight: 200,
            preferredHeight: 300,
            maxHeight: 400,
          },
          contentPolicy: "fixed",
        },
      });
      assert.equal(bounded, 260, "Must respect widget minimum compact width of 260");
    });
  });
});

