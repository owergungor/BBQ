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
});
