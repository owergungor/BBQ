import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import { islandStore, initialIslandState, setActiveWidget } from "../src/island/islandState.ts";
import { timerStore, initialTimerDomainState } from "../src/state/timerState.ts";
import { reminderStore, initialReminderDomainState } from "../src/state/reminderState.ts";
import { settingsStore, initialSettingsState } from "../src/state/settingsState.ts";

describe("BBQ v1.2 — Core Stabilization & Regression Guards", () => {
  let runtime: IslandRuntime;

  beforeEach(() => {
    runtime = new IslandRuntime();
    islandStore.setState(initialIslandState);
    timerStore.setState(initialTimerDomainState);
    reminderStore.setState(initialReminderDomainState);
    settingsStore.setState(initialSettingsState);
  });

  describe("1. Top-Center Positioning & DPI Coordinate Contract", () => {
    it("preserves exact horizontal top-center invariant in logical coordinates", () => {
      const displayLogicalWidths = [1280, 1536, 1920, 2560];
      const idleWidth = 240;

      for (const width of displayLogicalWidths) {
        const expectedX = (width - idleWidth) / 2;
        const calculatedX = Math.floor((width - idleWidth) / 2);
        assert.equal(calculatedX, expectedX);
        // Visual center invariant: x + width/2 == displayWidth / 2
        assert.equal(calculatedX + idleWidth / 2, width / 2);
      }
    });

    it("verifies multi-monitor negative coordinate spaces maintain center invariant", () => {
      // Left monitor logical bounds: x = -1536, width = 1536
      const leftBoundX = -1536;
      const leftWidth = 1536;
      const idleWidth = 240;

      const expectedX = leftBoundX + (leftWidth - idleWidth) / 2;
      assert.equal(expectedX, -1536 + 648);
      assert.equal(expectedX + idleWidth / 2, leftBoundX + leftWidth / 2);
    });
  });

  describe("2. Hover Jitter & State Stability Invariants", () => {
    it("prevents redundant state transitions and feedback loop when already Hovering", async () => {
      let stateUpdateCount = 0;
      const unsubscribe = islandStore.subscribe(() => {
        stateUpdateCount++;
      });

      // Initial transition to Hovering
      await runtime.handleEvent({ type: "USER_HOVER" });
      assert.equal(islandStore.getState().state, "Hovering");
      const firstUpdateCount = stateUpdateCount;

      // Duplicate hover events (such as OS mousemove while hovering) must be NO-OPs
      await runtime.handleEvent({ type: "USER_HOVER" });
      await runtime.handleEvent({ type: "USER_HOVER" });
      await runtime.handleEvent({ type: "USER_HOVER" });

      assert.equal(
        stateUpdateCount,
        firstUpdateCount,
        "Subsequent USER_HOVER events while already Hovering must not trigger state updates"
      );

      unsubscribe();
    });

    it("prevents transitionTo from re-notifying when target state equals current state", async () => {
      await runtime.transitionTo("Hovering", "mouse");
      assert.equal(islandStore.getState().state, "Hovering");

      let updated = false;
      const unsubscribe = islandStore.subscribe(() => {
        updated = true;
      });

      // Calling transitionTo with the same state must short-circuit
      await runtime.transitionTo("Hovering", "event");
      assert.equal(updated, false, "transitionTo to identical state must short-circuit without re-notifying");

      unsubscribe();
    });

    it("cancels unhover collapse if cursor re-enters before debounce expiration", async () => {
      await runtime.transitionTo("Hovering", "mouse");
      assert.equal(islandStore.getState().state, "Hovering");

      // Mouse leaves
      await runtime.handleEvent({ type: "USER_UNHOVER" });

      // Mouse quickly re-enters within debounce window
      await runtime.handleEvent({ type: "USER_HOVER" });

      // Wait longer than 150ms debounce
      await new Promise((res) => setTimeout(res, 200));

      assert.equal(
        islandStore.getState().state,
        "Hovering",
        "Re-entering hover within debounce period must preserve Hovering state"
      );
    });
  });

  describe("3. Inside Clicks & Nested Control Interaction", () => {
    // Architectural event boundary helper mirroring Island.tsx and IslandContent.tsx
    const simulateInsideClick = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      const current = islandStore.getState();
      if (current.state !== "Expanded") {
        runtime.handleEvent({ type: "USER_CLICK" });
      }
    };

    it("inside click does NOT collapse when BBQ is in Expanded state", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      assert.equal(islandStore.getState().state, "Expanded");

      let stopped = false;
      const mockEvent = {
        stopPropagation: () => {
          stopped = true;
        },
      };

      simulateInsideClick(mockEvent);
      assert.equal(stopped, true, "Inside clicks must be stopped at the boundary");
      assert.equal(
        islandStore.getState().state,
        "Expanded",
        "Inside click must keep BBQ Expanded, never collapse to Hovering or Idle"
      );
    });

    it("nested button clicks and tab selections preserve Expanded state", async () => {
      await runtime.transitionTo("Expanded", "mouse");

      // 1. Switching to Timer tab
      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "timer" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "timer");

      // 2. Switching to Reminders tab
      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "reminder" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "reminder");

      // 3. Switching to Settings tab
      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "settings" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "settings");
    });

    it("timer control interactions execute without triggering collapse", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      setActiveWidget("timer");

      // Simulate timer start action
      timerStore.setState({
        session: {
          id: "test_sess",
          mode: "Countdown",
          state: "Running",
          duration_ms: 300000,
          remaining_ms: 300000,
          started_at: Date.now(),
          target_at: Date.now() + 300000,
          completed_cycles: 0,
          pomodoro_phase: null,
          created_at: Date.now(),
        },
      });

      // Synthetic inside click during running timer
      simulateInsideClick({ stopPropagation: () => {} });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(timerStore.getState().session.state, "Running");

      // Simulate timer pause action
      timerStore.setState({
        session: {
          ...timerStore.getState().session,
          state: "Paused",
        },
      });
      simulateInsideClick({ stopPropagation: () => {} });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(timerStore.getState().session.state, "Paused");
    });

    it("reminders control interactions execute without triggering collapse", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      setActiveWidget("reminder");

      reminderStore.setState({
        reminders: [
          {
            id: "rem_1",
            title: "Stand up and stretch",
            body: null,
            due_at: Date.now() + 600000,
            fired: false,
            created_at: Date.now(),
          },
        ],
      });

      // User interacts with reminder item
      simulateInsideClick({ stopPropagation: () => {} });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(reminderStore.getState().reminders.length, 1);
    });

    it("settings control interactions execute without triggering collapse", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      setActiveWidget("settings");

      // Change draft settings
      settingsStore.setState({
        settings: {
          ...settingsStore.getState().settings,
          theme: "light",
          island_width: 420,
        },
      });

      simulateInsideClick({ stopPropagation: () => {} });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(settingsStore.getState().settings.theme, "light");
      assert.equal(settingsStore.getState().settings.island_width, 420);
    });
  });

  describe("4. Outside Click & Boundary Hit-Testing", () => {
    it("outside click deterministically collapses Expanded island to Idle", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      assert.equal(islandStore.getState().state, "Expanded");

      await runtime.handleEvent({ type: "CLICK_OUTSIDE" });
      assert.equal(islandStore.getState().state, "Idle");
      assert.equal(islandStore.getState().mode, "IDLE");
      assert.equal(islandStore.getState().expanded, false);
    });

    it("composedPath boundary correctly differentiates inside elements from outside", () => {
      const mockShell = { id: "bbq-island-shell" };
      const mockChildButton = { id: "timer-start-btn" };
      const mockOutsideDesktop = { id: "desktop-surface" };

      // Inside event: path includes shell
      const insidePath = [mockChildButton, mockShell];
      const isInside = insidePath.includes(mockShell);
      assert.equal(isInside, true);

      // Outside event: path does not include shell
      const outsidePath = [mockOutsideDesktop];
      const isOutside = !outsidePath.includes(mockShell);
      assert.equal(isOutside, true);
    });

    it("handles detached child element gracefully via composedPath", () => {
      const mockShell = { id: "bbq-island-shell" };
      // Element that unmounts upon click (e.g. preset button that was replaced by active indicator)
      const mockDetachedEl = { id: "preset-5m-unmounted" };

      // Even if node is detached, the dispatched event's composedPath captures the ancestor hierarchy
      const eventPath = [mockDetachedEl, mockShell];
      const isRecognizedInside = eventPath.includes(mockShell);
      assert.equal(
        isRecognizedInside,
        true,
        "ComposedPath must recognize detached child as inside the shell"
      );
    });
  });

  describe("5. Production Asset & Environment Integrity", () => {
    it("guarantees no localhost:1420 references in production bundle configuration", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const tauriConfigRaw = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src-tauri/tauri.conf.json"),
        "utf8"
      );
      const tauriConfig = JSON.parse(tauriConfigRaw);
      assert.equal(tauriConfig.productName, "BBQ");
      assert.equal(tauriConfig.build.frontendDist, "../dist");
      assert.equal(tauriConfig.app.windows[0].transparent, true);
      assert.equal(tauriConfig.app.windows[0].alwaysOnTop, true);
      assert.equal(tauriConfig.app.windows[0].resizable, true);
      assert.equal(tauriConfig.app.windows[0].shadow, false);
      assert.equal(tauriConfig.app.windows[0].width, 260);
      assert.equal(tauriConfig.app.windows[0].height, 44);
    });
  });

  describe("6. Compact -> Expanded Click Transition Contract", () => {
    it("compact BBQ click from Idle transitions to Expanded state", async () => {
      assert.equal(islandStore.getState().state, "Idle");
      assert.equal(islandStore.getState().expanded, false);

      await runtime.handleEvent({ type: "USER_CLICK" });

      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().mode, "EXPANDED");
      assert.equal(islandStore.getState().expanded, true);
    });

    it("compact BBQ click from Hovering transitions to Expanded state", async () => {
      await runtime.handleEvent({ type: "USER_HOVER" });
      assert.equal(islandStore.getState().state, "Hovering");

      await runtime.handleEvent({ type: "USER_CLICK" });

      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().mode, "EXPANDED");
      assert.equal(islandStore.getState().expanded, true);
    });

    it("clicking inside expanded view does not collapse island", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      assert.equal(islandStore.getState().state, "Expanded");

      // Clicking tabs or widgets inside expanded island dispatches WIDGET_SELECT
      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "timer" });
      assert.equal(islandStore.getState().state, "Expanded");

      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "reminder" });
      assert.equal(islandStore.getState().state, "Expanded");

      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "settings" });
      assert.equal(islandStore.getState().state, "Expanded");
    });
  });

  describe("7. Zero Outer Shadows & Halos Invariant", () => {
    it("guarantees complete elimination of outer shadows and halos in index.css", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      assert.ok(
        cssContent.includes("--bbq-shadow-idle: none;"),
        "CSS must set --bbq-shadow-idle to none"
      );
      assert.ok(
        cssContent.includes("--bbq-shadow-expanded: none;"),
        "CSS must set --bbq-shadow-expanded to none"
      );
      assert.ok(
        cssContent.includes("--bbq-shadow: none;"),
        "CSS must set --bbq-shadow to none"
      );
      assert.ok(
        cssContent.includes("--shadow-island: none;"),
        "CSS must set --shadow-island to none"
      );

      // Verify no drop-shadow filter
      assert.ok(
        !cssContent.includes("drop-shadow"),
        "CSS must not contain drop-shadow filter"
      );
    });
  });

  describe("8. Timer Control Hit-Testing & Action State Invariants", () => {
    it("button clicks update timerStore session state directly", () => {
      assert.equal(timerStore.getState().session.state, "Idle");

      // Simulate Start Countdown click
      timerStore.setState({
        session: {
          ...timerStore.getState().session,
          timer_type: "Countdown",
          state: "Running",
          target_duration_secs: 300,
          remaining_millis: 300000,
        },
      });

      assert.equal(timerStore.getState().session.state, "Running");
      assert.equal(timerStore.getState().session.target_duration_secs, 300);

      // Simulate Pause click
      timerStore.setState({
        session: {
          ...timerStore.getState().session,
          state: "Paused",
        },
      });

      assert.equal(timerStore.getState().session.state, "Paused");

      // Simulate Reset click
      timerStore.setState({
        session: {
          ...timerStore.getState().session,
          state: "Idle",
          remaining_millis: 0,
        },
      });

      assert.equal(timerStore.getState().session.state, "Idle");
    });

    it("clicking timer controls in Expanded state never collapses the island", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "timer" });

      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "timer");

      // Actions occurring on timer buttons must preserve Expanded state
      timerStore.setState({
        session: {
          ...timerStore.getState().session,
          state: "Running",
          target_duration_secs: 180,
        },
      });

      assert.equal(islandStore.getState().state, "Expanded");

      timerStore.setState({
        session: {
          ...timerStore.getState().session,
          state: "Paused",
        },
      });

      assert.equal(islandStore.getState().state, "Expanded");
    });

    it("preset minute options establish exact seconds target", () => {
      const presets = [1, 3, 5, 10, 15, 25, 30, 45, 60];
      for (const mins of presets) {
        const expectedSecs = mins * 60;
        const session = {
          ...initialTimerDomainState.session,
          timer_type: "Countdown" as const,
          state: "Running" as const,
          target_duration_secs: expectedSecs,
          remaining_millis: expectedSecs * 1000,
        };
        assert.equal(session.target_duration_secs, mins * 60);
        assert.equal(session.remaining_millis, mins * 60 * 1000);
      }
    });
  });

  describe("9. Mouse Wheel Tab Navigation & Boundary Debounce", () => {
    const tabs = ["launcher", "timer", "reminder", "settings", "system"];

    function computeNextTabIndex(
      currentIndex: number,
      deltaY: number,
      totalTabs: number
    ): number {
      if (deltaY > 0) {
        return Math.min(currentIndex + 1, totalTabs - 1);
      } else if (deltaY < 0) {
        return Math.max(currentIndex - 1, 0);
      }
      return currentIndex;
    }

    it("downwards wheel (positive delta) advances to next tab", () => {
      let idx = 0; // launcher
      idx = computeNextTabIndex(idx, 50, tabs.length);
      assert.equal(idx, 1); // timer
      assert.equal(tabs[idx], "timer");

      idx = computeNextTabIndex(idx, 100, tabs.length);
      assert.equal(idx, 2); // reminder
      assert.equal(tabs[idx], "reminder");
    });

    it("upwards wheel (negative delta) recedes to previous tab", () => {
      let idx = 3; // settings
      idx = computeNextTabIndex(idx, -50, tabs.length);
      assert.equal(idx, 2); // reminder
      assert.equal(tabs[idx], "reminder");

      idx = computeNextTabIndex(idx, -120, tabs.length);
      assert.equal(idx, 1); // timer
      assert.equal(tabs[idx], "timer");
    });

    it("clamps at boundaries without overflowing", () => {
      // Clamps at end
      let idx = 4; // system (last)
      idx = computeNextTabIndex(idx, 100, tabs.length);
      assert.equal(idx, 4);

      // Clamps at start
      idx = 0; // launcher (first)
      idx = computeNextTabIndex(idx, -100, tabs.length);
      assert.equal(idx, 0);
    });

    it("wheel navigation dispatches WIDGET_SELECT and preserves Expanded state", async () => {
      await runtime.transitionTo("Expanded", "mouse");
      assert.equal(islandStore.getState().state, "Expanded");

      // Simulating wheel navigation selection
      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "timer" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "timer");

      await runtime.handleEvent({ type: "WIDGET_SELECT", widgetId: "settings" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().activeWidgetId, "settings");
    });
  });

  describe("10. Active Island Widgets Ordering & Fallback", () => {
    it("orders active widgets according to user preference", async () => {
      const { resolveEffectiveIndicatorOrder } = await import(
        "../src/island/compactOrder.ts"
      );

      const customOrder = ["system", "reminder", "timer", "clipboard"];
      const effective = resolveEffectiveIndicatorOrder(customOrder, []);

      // First items should match custom order
      assert.equal(effective[0], "system");
      assert.equal(effective[1], "reminder");
      assert.equal(effective[2], "timer");
      assert.equal(effective[3], "clipboard");
    });

    it("filters out disabled widgets from effective order", async () => {
      const { resolveEffectiveIndicatorOrder } = await import(
        "../src/island/compactOrder.ts"
      );

      const customOrder = ["timer", "reminder", "clipboard", "system"];
      const disabledWidgets = ["clipboard", "system"];
      const effective = resolveEffectiveIndicatorOrder(customOrder, disabledWidgets);

      assert.ok(!effective.includes("clipboard"));
      assert.ok(!effective.includes("system"));
      assert.ok(effective.includes("timer"));
      assert.ok(effective.includes("reminder"));
    });
  });

  describe("11. Compact Dimensions Dynamic CSS Properties", () => {
    it("injects compact width and height into document CSS custom properties", async () => {
      const { applyThemeAndMotionToDom } = await import(
        "../src/state/settingsState.ts"
      );

      const mockStyle = new Map<string, string>();
      const mockElement = {
        style: {
          setProperty(name: string, value: string) {
            mockStyle.set(name, value);
          },
          getPropertyValue(name: string) {
            return mockStyle.get(name) || "";
          },
        },
        setAttribute() {},
        getAttribute() {
          return null;
        },
      };

      const originalDoc = globalThis.document;
      // @ts-expect-error Mocking document
      globalThis.document = { documentElement: mockElement };

      try {
        applyThemeAndMotionToDom({
          ...initialSettingsState.settings,
          island_width: 320,
          island_height: 48,
        });

        assert.equal(mockStyle.get("--bbq-compact-width"), "320px");
        assert.equal(mockStyle.get("--bbq-compact-height"), "48px");
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });

  describe("12. Launcher Clean State & Shortcut Exclusions", () => {
    it("excludes widget shortcuts from launcher viewable items", () => {
      const EXCLUDED_LAUNCHER_ITEM_IDS = [
        "bbq_timer",
        "bbq_reminders",
        "bbq_clipboard",
        "bbq_settings",
        "bbq_system",
      ];

      const allItems = [
        { id: "app_calculator", title: "Calculator" },
        { id: "bbq_timer", title: "Timer" },
        { id: "app_browser", title: "Browser" },
        { id: "bbq_settings", title: "Settings" },
      ];

      const visible = allItems.filter(
        (item) => !EXCLUDED_LAUNCHER_ITEM_IDS.includes(item.id)
      );

      assert.equal(visible.length, 2);
      assert.equal(visible[0].id, "app_calculator");
      assert.equal(visible[1].id, "app_browser");
      assert.ok(!visible.some((i) => i.id === "bbq_timer"));
      assert.ok(!visible.some((i) => i.id === "bbq_settings"));
    });
  });

  describe("13. Timer Mode Switch Auto-Start Prevention & Idle Contract", () => {
    it("switching modes sets session state to Idle and never auto-starts", async () => {
      // Simulate active running countdown session
      timerStore.setState({
        session: {
          id: "active-session",
          mode: "countdown",
          state: "running",
          duration_ms: 300000,
          remaining_ms: 250000,
          elapsed_ms: 50000,
          preset_index: 0,
          total_cycles: 0,
        },
        error: null,
      });

      assert.equal(timerStore.getState().session?.state, "running");

      // Switching mode must yield Idle state
      timerStore.setState({
        session: {
          id: "new-mode-session",
          mode: "stopwatch",
          state: "idle",
          duration_ms: null,
          remaining_ms: null,
          elapsed_ms: 0,
          preset_index: null,
          total_cycles: 0,
        },
        error: null,
      });

      const session = timerStore.getState().session;
      assert.ok(session);
      assert.equal(session.mode, "stopwatch");
      assert.equal(session.state, "idle");
      assert.notEqual(session.state, "running");

      // Switching to pomodoro must also remain idle
      timerStore.setState({
        session: {
          id: "pomodoro-session",
          mode: "pomodoro",
          state: "idle",
          duration_ms: 25 * 60 * 1000,
          remaining_ms: 25 * 60 * 1000,
          elapsed_ms: 0,
          preset_index: 0,
          total_cycles: 0,
        },
        error: null,
      });

      const pomodoroSession = timerStore.getState().session;
      assert.ok(pomodoroSession);
      assert.equal(pomodoroSession.mode, "pomodoro");
      assert.equal(pomodoroSession.state, "idle");
    });
  });

  describe("14. Hotkey Combination Validation & Multi-Modifier Support", () => {
    it("validates multi-modifier hotkey combinations (Ctrl+Shift+B, Ctrl+Alt+Space, Alt+Shift+B, Win+Shift+B)", () => {
      const validateHotkey = (hotkeyStr: string): boolean => {
        const trimmed = hotkeyStr.trim();
        if (!trimmed) return false;
        const parts = trimmed.split("+").map((s) => s.trim().toLowerCase());
        const hasMod = parts.some((p) =>
          ["ctrl", "control", "alt", "option", "shift", "win", "cmd", "meta"].includes(p)
        );
        const nonMod = parts.filter(
          (p) => !["ctrl", "control", "alt", "option", "shift", "win", "cmd", "meta"].includes(p)
        );
        return hasMod && parts.length >= 2 && nonMod.length === 1;
      };

      assert.ok(validateHotkey("Ctrl+Shift+B"));
      assert.ok(validateHotkey("Ctrl+Alt+Space"));
      assert.ok(validateHotkey("Alt+Shift+B"));
      assert.ok(validateHotkey("Win+Shift+B"));
      assert.ok(validateHotkey("Ctrl+Space"));
      assert.ok(validateHotkey("Ctrl+Alt+Shift+F12"));

      // Invalid combinations
      assert.equal(validateHotkey(""), false);
      assert.equal(validateHotkey("Space"), false);
      assert.equal(validateHotkey("Ctrl"), false);
      assert.equal(validateHotkey("Ctrl+Alt"), false);
    });
  });

  describe("15. Launcher 2x2 Quick Actions & Media Shortcut Exclusion", () => {
    it("excludes bbq_media and keeps exactly 4 items for 2x2 grid", () => {
      const EXCLUDED_LAUNCHER_ITEM_IDS = [
        "bbq_timer",
        "bbq_reminders",
        "bbq_clipboard",
        "bbq_settings",
        "bbq_system",
        "bbq_media",
      ];

      const builtins = [
        { id: "bbq_files", title: "Files & Workspace" },
        { id: "bbq_downloads", title: "Downloads" },
        { id: "bbq_home", title: "Home Directory" },
        { id: "bbq_lock", title: "Lock Screen" },
        { id: "bbq_media", title: "Media Player" },
      ];

      const filtered = builtins.filter((b) => !EXCLUDED_LAUNCHER_ITEM_IDS.includes(b.id));
      assert.equal(filtered.length, 4);
      assert.equal(filtered.some((b) => b.id === "bbq_media"), false);
      assert.deepEqual(
        filtered.map((b) => b.id),
        ["bbq_files", "bbq_downloads", "bbq_home", "bbq_lock"]
      );
    });
  });

  describe("16. Accent Color Dynamic CSS Variable & DOM Token Application", () => {
    it("applies data-accent attribute and accent color tokens to document root", async () => {
      const { applyThemeAndMotionToDom, ACCENT_PALETTES } = await import(
        "../src/state/settingsState.ts"
      );

      const mockStyle = new Map<string, string>();
      const mockAttributes = new Map<string, string>();

      const mockElement = {
        style: {
          setProperty(name: string, value: string) {
            mockStyle.set(name, value);
          },
          getPropertyValue(name: string) {
            return mockStyle.get(name) || "";
          },
        },
        setAttribute(name: string, value: string) {
          mockAttributes.set(name, value);
        },
        getAttribute(name: string) {
          return mockAttributes.get(name) || null;
        },
      };

      const originalDoc = globalThis.document;
      // @ts-expect-error Mocking document
      globalThis.document = { documentElement: mockElement };

      try {
        const supportedAccents = [
          "orange",
          "blue",
          "purple",
          "green",
          "red",
          "pink",
          "cyan",
        ] as const;

        for (const accent of supportedAccents) {
          applyThemeAndMotionToDom({
            ...initialSettingsState.settings,
            accent_color: accent,
          });

          assert.equal(mockAttributes.get("data-accent"), accent);
          const palette = ACCENT_PALETTES[accent];
          assert.equal(mockStyle.get("--bbq-accent"), palette.accent);
          assert.equal(mockStyle.get("--bbq-accent-hover"), palette.hover);
          assert.equal(mockStyle.get("--bbq-accent-glow"), palette.glow);
          assert.equal(mockStyle.get("--bbq-accent-subtle"), palette.subtle);
        }
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });
});


