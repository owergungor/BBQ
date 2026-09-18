import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import { islandStore, initialIslandState } from "../src/island/islandState.ts";
import type { WidgetDefinition } from "../src/island/widgetRegistry.ts";
import {
  getWidgetIconName,
  isTabSelectable,
  getNextSelectableIndex,
  getFirstSelectableIndex,
  getLastSelectableIndex,
  getClampedWheelIndex,
} from "../src/components/island/segmentedTabBarModel.ts";
import {
  applyThemeAndMotionToDom,
  defaultSettings,
  getAccentPalette,
  SYSTEM_ACCENT_COLORS,
} from "../src/state/settingsState.ts";

describe("BBQ v1.3 — M3 Segmented Navigation & Atoll Parity Invariants", () => {
  let runtime: IslandRuntime;

  beforeEach(() => {
    runtime = new IslandRuntime();
    islandStore.setState(initialIslandState);
  });

  describe("1. Centralized & Type-Safe Icon Mapping (Zero Emoji Fallback)", () => {
    const testWidgets = [
      { id: "media", expected: "media" },
      { id: "stats", expected: "stats" },
      { id: "system", expected: "stats" },
      { id: "timer", expected: "timer" },
      { id: "clipboard", expected: "clipboard" },
      { id: "files", expected: "files" },
      { id: "launcher", expected: "launcher" },
      { id: "reminders", expected: "reminders" },
      { id: "reminder", expected: "reminders" },
      { id: "settings", expected: "settings" },
      { id: "drop", expected: "drop" },
      { id: "network", expected: "network" },
      { id: "notes", expected: "files" },
      { id: "bookmarks", expected: "pin" },
    ];

    it("correctly maps all known and declared widget IDs to valid SVG IconName", () => {
      for (const item of testWidgets) {
        const iconName = getWidgetIconName(item.id);
        assert.equal(
          iconName,
          item.expected,
          `Widget ${item.id} must map to ${item.expected}`
        );
      }
    });

    it("strictly forbids emoji fallback in tab icon mapping", () => {
      const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
      for (const item of testWidgets) {
        const iconName = getWidgetIconName(item.id);
        assert.ok(
          !emojiRegex.test(iconName),
          `Widget ${item.id} icon mapping '${iconName}' must not contain emojis`
        );
      }
      // Fallback unknown widget check
      const fallback = getWidgetIconName("unknown_custom_id");
      assert.equal(fallback, "sparkles");
      assert.ok(!emojiRegex.test(fallback));
    });
  });

  describe("2. Tab Navigation Helpers & Disabled/Invalid Tab Safety", () => {
    const mockWidgets: WidgetDefinition[] = [
      {
        id: "media",
        title: "Media",
        icon: "🎵",
        priority: 70,
        canActivate: () => true,
        lifecycle: "ready",
      },
      {
        id: "disabled_widget",
        title: "Disabled",
        icon: "🚫",
        priority: 60,
        canActivate: () => false,
        lifecycle: "ready",
      },
      {
        id: "unavailable_widget",
        title: "Unavailable",
        icon: "⚠️",
        priority: 50,
        canActivate: () => true,
        lifecycle: "unavailable",
      },
      {
        id: "timer",
        title: "Timer",
        icon: "⏱️",
        priority: 40,
        canActivate: () => true,
        lifecycle: "ready",
      },
      {
        id: "settings",
        title: "Settings",
        icon: "⚙️",
        priority: 15,
        canActivate: () => true,
        lifecycle: "ready",
      },
    ];

    it("correctly detects selectable vs unselectable tabs", () => {
      assert.equal(isTabSelectable(mockWidgets[0]), true);
      assert.equal(isTabSelectable(mockWidgets[1]), false); // canActivate === false
      assert.equal(isTabSelectable(mockWidgets[2]), false); // lifecycle === unavailable
      assert.equal(isTabSelectable(mockWidgets[3]), true);
      assert.equal(isTabSelectable(mockWidgets[4]), true);
      assert.equal(isTabSelectable(undefined), false);
    });

    it("skips disabled and unavailable tabs on keyboard navigation (ArrowRight/ArrowLeft)", () => {
      // From 0 (media), next selectable tab should skip 1 & 2 and go straight to 3 (timer)
      const nextIdx = getNextSelectableIndex(0, mockWidgets, 1);
      assert.equal(nextIdx, 3);
      assert.equal(mockWidgets[nextIdx].id, "timer");

      // From 3 (timer), prev selectable tab should skip 2 & 1 and go back to 0 (media)
      const prevIdx = getNextSelectableIndex(3, mockWidgets, -1);
      assert.equal(prevIdx, 0);
      assert.equal(mockWidgets[prevIdx].id, "media");
    });

    it("correctly resolves first and last selectable indices", () => {
      const first = getFirstSelectableIndex(mockWidgets);
      assert.equal(first, 0); // media
      const last = getLastSelectableIndex(mockWidgets);
      assert.equal(last, 4); // settings
    });

    it("handles empty widget array safely without crashing", () => {
      assert.equal(getNextSelectableIndex(0, [], 1), -1);
      assert.equal(getFirstSelectableIndex([]), -1);
      assert.equal(getLastSelectableIndex([]), -1);
      assert.equal(getClampedWheelIndex(0, [], 1), -1);
    });
  });

  describe("3. Keyboard Navigation (ArrowLeft, ArrowRight, Home, End)", () => {
    const validWidgets: WidgetDefinition[] = [
      { id: "files", title: "Files", icon: "📁", priority: 80, canActivate: () => true, lifecycle: "ready" },
      { id: "clipboard", title: "Clipboard", icon: "📋", priority: 70, canActivate: () => true, lifecycle: "ready" },
      { id: "media", title: "Media", icon: "🎵", priority: 60, canActivate: () => true, lifecycle: "ready" },
      { id: "timer", title: "Timer", icon: "⏱️", priority: 50, canActivate: () => true, lifecycle: "ready" },
    ];

    it("advances with ArrowRight and recedes with ArrowLeft", () => {
      let idx = 0;
      idx = getNextSelectableIndex(idx, validWidgets, 1);
      assert.equal(idx, 1);
      assert.equal(validWidgets[idx].id, "clipboard");

      idx = getNextSelectableIndex(idx, validWidgets, 1);
      assert.equal(idx, 2);
      assert.equal(validWidgets[idx].id, "media");

      idx = getNextSelectableIndex(idx, validWidgets, -1);
      assert.equal(idx, 1);
      assert.equal(validWidgets[idx].id, "clipboard");
    });

    it("moves directly to start with Home and end with End", () => {
      const firstIdx = getFirstSelectableIndex(validWidgets);
      assert.equal(firstIdx, 0);
      assert.equal(validWidgets[firstIdx].id, "files");

      const lastIdx = getLastSelectableIndex(validWidgets);
      assert.equal(lastIdx, 3);
      assert.equal(validWidgets[lastIdx].id, "timer");
    });

    it("verifies keyboard handlers are wired in SegmentedTabBar.tsx and IslandNavigation.tsx", () => {
      const tabBarSource = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/SegmentedTabBar.tsx"),
        "utf8"
      );
      const islandNavSource = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/IslandNavigation.tsx"),
        "utf8"
      );

      for (const src of [tabBarSource, islandNavSource]) {
        assert.ok(src.includes('e.key === "ArrowRight"'), "Must handle ArrowRight");
        assert.ok(src.includes('e.key === "ArrowLeft"'), "Must handle ArrowLeft");
        assert.ok(src.includes('e.key === "Home"'), "Must handle Home");
        assert.ok(src.includes('e.key === "End"'), "Must handle End");
      }
    });
  });

  describe("4. Mouse Wheel Navigation & Boundary Clamping", () => {
    const validWidgets: WidgetDefinition[] = [
      { id: "drop", title: "Drop", icon: "📥", priority: 90, canActivate: () => true, lifecycle: "ready" },
      { id: "files", title: "Files", icon: "📁", priority: 80, canActivate: () => true, lifecycle: "ready" },
      { id: "clipboard", title: "Clipboard", icon: "📋", priority: 70, canActivate: () => true, lifecycle: "ready" },
      { id: "media", title: "Media", icon: "🎵", priority: 60, canActivate: () => true, lifecycle: "ready" },
    ];

    it("advances tab on downward wheel (positive direction)", () => {
      const next = getClampedWheelIndex(0, validWidgets, 1);
      assert.equal(next, 1);
      assert.equal(validWidgets[next].id, "files");
    });

    it("recedes tab on upward wheel (negative direction)", () => {
      const prev = getClampedWheelIndex(2, validWidgets, -1);
      assert.equal(prev, 1);
      assert.equal(validWidgets[prev].id, "files");
    });

    it("strictly clamps at left/start boundary (scrolling left on first tab stays on first tab)", () => {
      const clampedStart = getClampedWheelIndex(0, validWidgets, -1);
      assert.equal(clampedStart, 0);
      assert.equal(validWidgets[clampedStart].id, "drop");
    });

    it("strictly clamps at right/end boundary (scrolling right on last tab stays on last tab)", () => {
      const lastIndex = validWidgets.length - 1;
      const clampedEnd = getClampedWheelIndex(lastIndex, validWidgets, 1);
      assert.equal(clampedEnd, lastIndex);
      assert.equal(validWidgets[clampedEnd].id, "media");
    });

    it("verifies 150ms event gate throttle in SegmentedTabBar.tsx source", () => {
      const tabBarSource = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/SegmentedTabBar.tsx"),
        "utf8"
      );
      assert.ok(
        tabBarSource.includes("150"),
        "Must throttle wheel events with 150ms threshold"
      );
      assert.ok(
        tabBarSource.includes("lastWheelTimeRef"),
        "Must use timestamp comparison event gate without persistent setInterval"
      );
    });
  });

  describe("5. Active Indicator Hardware-Accelerated CSS Transform Contract", () => {
    it("declares translate3d transform and spring easing in index.css", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      // Indicator container and styles
      assert.ok(
        cssContent.includes(".bbq-segmented-indicator {"),
        "Must declare .bbq-segmented-indicator class"
      );
      assert.ok(
        cssContent.includes("transform: translate3d(0, 0, 0);"),
        "Must use hardware-accelerated translate3d"
      );
      assert.ok(
        cssContent.includes("will-change: transform, width;"),
        "Must optimize compositor with will-change"
      );
      assert.ok(
        cssContent.includes("pointer-events: none;"),
        "Indicator must not block pointer events"
      );
      assert.ok(
        cssContent.includes("transition: transform var(--bbq-motion-spring)"),
        "Must use spring transition token"
      );

      // Motion tokens in :root
      assert.ok(
        cssContent.includes("--bbq-motion-spring:"),
        "Must define --bbq-motion-spring token"
      );
      assert.ok(
        cssContent.includes("--bbq-motion-fast:"),
        "Must define --bbq-motion-fast token"
      );
    });

    it("verifies source code of SegmentedTabBar contains zero JS animation loops and zero timer loops", () => {
      const componentSource = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/SegmentedTabBar.tsx"),
        "utf8"
      );

      assert.ok(
        !componentSource.includes("setInterval"),
        "SegmentedTabBar must NOT use setInterval"
      );
      assert.ok(
        !componentSource.includes("requestAnimationFrame"),
        "SegmentedTabBar must NOT use requestAnimationFrame loops"
      );
      assert.ok(
        componentSource.includes("translate3d"),
        "SegmentedTabBar must set translate3d transform for active indicator"
      );
    });
  });

  describe("6. Reduced Motion Support", () => {
    it("disables indicator transition in both media query and data attribute in index.css", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      // OS-level media query
      assert.ok(
        cssContent.includes("@media (prefers-reduced-motion: reduce)"),
        "Must support OS prefers-reduced-motion"
      );

      // In-app data attribute
      assert.ok(
        cssContent.includes('[data-reduced-motion="true"] .bbq-segmented-indicator'),
        "Must support data-reduced-motion in-app toggle"
      );
      assert.ok(
        cssContent.includes("transition: none !important;"),
        "Reduced motion must disable transitions completely"
      );
    });

    it("injects data-reduced-motion attribute via applyThemeAndMotionToDom", () => {
      const mockAttrs: Record<string, string> = {};
      const mockStyles: Record<string, string> = {};

      const mockDoc = {
        documentElement: {
          setAttribute: (k: string, v: string) => {
            mockAttrs[k] = v;
          },
          style: {
            setProperty: (k: string, v: string) => {
              mockStyles[k] = v;
            },
          },
        },
      };

      const originalDoc = (globalThis as any).document;
      try {
        (globalThis as any).document = mockDoc;

        applyThemeAndMotionToDom({
          ...defaultSettings,
          reduced_motion: true,
        });

        assert.equal(mockAttrs["data-reduced-motion"], "true");

        applyThemeAndMotionToDom({
          ...defaultSettings,
          reduced_motion: false,
        });

        assert.equal(mockAttrs["data-reduced-motion"], "false");
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });
  });

  describe("7. Theme & Accent Color Integration", () => {
    it("dynamically resolves accent colors for dark and light modes across all 11 system presets", () => {
      for (const [name, colors] of Object.entries(SYSTEM_ACCENT_COLORS)) {
        const darkPalette = getAccentPalette(name, "dark");
        const lightPalette = getAccentPalette(name, "light");

        assert.equal(darkPalette.accent, colors.dark);
        assert.equal(lightPalette.accent, colors.light);
        assert.ok(darkPalette.subtle.length > 0);
        assert.ok(lightPalette.subtle.length > 0);
      }
    });

    it("applies theme dataset (light, dark, system) to DOM", () => {
      const mockAttrs: Record<string, string> = {};
      const mockDoc = {
        documentElement: {
          setAttribute: (k: string, v: string) => {
            mockAttrs[k] = v;
          },
          style: {
            setProperty: () => {},
          },
        },
      };

      const originalDoc = (globalThis as any).document;
      try {
        (globalThis as any).document = mockDoc;

        applyThemeAndMotionToDom({ ...defaultSettings, theme: "dark" });
        assert.equal(mockAttrs["data-theme"], "dark");

        applyThemeAndMotionToDom({ ...defaultSettings, theme: "light" });
        assert.equal(mockAttrs["data-theme"], "light");

        applyThemeAndMotionToDom({ ...defaultSettings, theme: "system" });
        assert.equal(mockAttrs["data-theme"], "system");
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });
  });

  describe("8. Inside Click Propagation & Outside Click Collapse Invariants", () => {
    it("inside clicks on navigation elements stop propagation and preserve Expanded state", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      assert.equal(islandStore.getState().state, "Expanded");

      // Selecting tabs preserves Expanded state
      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "timer" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "timer");

      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "media" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "media");
    });

    it("outside click deterministically collapses Expanded island to Idle", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      assert.equal(islandStore.getState().state, "Expanded");

      // Outside click event
      await runtime.handleEvent({ type: "CLICK_OUTSIDE" });
      assert.equal(islandStore.getState().state, "Idle");
      assert.equal(islandStore.getState().mode, "IDLE");
      assert.equal(islandStore.getState().expanded, false);
    });

    it("verifies stopPropagation and collapse handler in IslandNavigation.tsx and SegmentedTabBar.tsx", () => {
      const islandNavSource = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/IslandNavigation.tsx"),
        "utf8"
      );
      const tabBarSource = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/SegmentedTabBar.tsx"),
        "utf8"
      );

      assert.ok(
        islandNavSource.includes("e.stopPropagation()"),
        "IslandNavigation must stop click propagation"
      );
      assert.ok(
        tabBarSource.includes("e.stopPropagation()"),
        "SegmentedTabBar must stop click propagation"
      );
      assert.ok(
        islandNavSource.includes("onCollapse()"),
        "IslandNavigation must invoke onCollapse on close button click"
      );
      assert.ok(
        islandNavSource.includes('Icon name="close"'),
        "IslandNavigation must use native SVG close icon"
      );
    });
  });

  describe("9. Zero-Halo & M2 Geometry Preservation", () => {
    it("verifies zero-halo outer shadow invariant is untouched", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      assert.ok(cssContent.includes("--bbq-shadow-idle: none;"));
      assert.ok(cssContent.includes("--bbq-shadow-expanded: none;"));
      assert.ok(cssContent.includes("--bbq-shadow: none;"));
      assert.ok(cssContent.includes("--shadow-island: none;"));
      assert.ok(!cssContent.includes("drop-shadow"), "No drop-shadow filter allowed");
    });

    it("verifies M2 geometry tokens remain exact Atoll parity", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      assert.ok(cssContent.includes("--bbq-compact-width: 240px;"));
      assert.ok(cssContent.includes("--bbq-compact-height: 38px;"));
      assert.ok(cssContent.includes("--bbq-peek-width: 280px;"));
      assert.ok(cssContent.includes("--bbq-peek-height: 44px;"));
      assert.ok(cssContent.includes("--bbq-expanded-width: 520px;"));
      assert.ok(cssContent.includes("--bbq-expanded-height: 360px;"));
      assert.ok(cssContent.includes("--bbq-top-margin: 8px;"));
    });
  });

  describe("10. ARIA Accessibility Contract in SegmentedTabBar.tsx", () => {
    it("verifies role=tablist and role=tab attributes in SegmentedTabBar.tsx", () => {
      const tabBarSource = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/SegmentedTabBar.tsx"),
        "utf8"
      );

      assert.ok(
        tabBarSource.includes('role="tablist"'),
        "SegmentedTabBar container must have role=tablist"
      );
      assert.ok(
        tabBarSource.includes('role="tab"'),
        "SegmentedTabBar items must have role=tab"
      );
      assert.ok(
        tabBarSource.includes("aria-selected={isActive}"),
        "Tab must have dynamic aria-selected"
      );
      assert.ok(
        tabBarSource.includes("tabIndex={isActive ? 0 : -1}"),
        "Tab must use roving tabIndex (0 for active, -1 for others)"
      );
      assert.ok(
        tabBarSource.includes("aria-controls={`widget-container-${widget.id}`}"),
        "Tab must link to widget container via aria-controls"
      );
    });
  });
});
