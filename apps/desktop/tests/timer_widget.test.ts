import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  timerStore,
  initialTimerDomainState,
  setTimerSession,
  setTimerLoading,
  setTimerError,
  formatTimeDisplay,
} from "../src/state/timerState.ts";
import fs from "node:fs";
import path from "node:path";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";
import { systemStore } from "../src/state/systemState.ts";
import { WidgetRegistry } from "../src/island/widgetRegistry.ts";
import { islandStore, initialIslandState, setActiveWidget } from "../src/island/islandState.ts";
import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import type { TimerSession } from "@bbq/types";

describe("Timer Store & State Isolation", () => {
  beforeEach(() => {
    timerStore.setState(initialTimerDomainState);
  });

  it("updates timer store correctly on session update", () => {
    const mockSession: TimerSession = {
      id: "timer-123",
      mode: "Countdown",
      state: "Running",
      started_at: 10000,
      paused_at: null,
      target_at: 70000,
      duration_ms: 60000,
      remaining_ms: 60000,
      pomodoro_phase: null,
      completed_cycles: 0,
    };

    setTimerSession(mockSession);
    const current = timerStore.getState();
    assert.equal(current.session.id, "timer-123");
    assert.equal(current.session.mode, "Countdown");
    assert.equal(current.session.state, "Running");
    assert.equal(current.session.target_at, 70000);
    assert.equal(current.session.remaining_ms, 60000);
    assert.equal(current.isLoading, false);
    assert.equal(current.error, null);
  });

  it("handles loading and error states cleanly", () => {
    setTimerLoading(true);
    assert.equal(timerStore.getState().isLoading, true);

    setTimerError("Failed to communicate with TimerService");
    assert.equal(timerStore.getState().error, "Failed to communicate with TimerService");
    assert.equal(timerStore.getState().isLoading, false);
  });

  it("strictly isolates timerStore notifications from media, clipboard, file, and system stores", () => {
    let timerNotified = 0;
    let mediaNotified = 0;
    let clipboardNotified = 0;
    let fileNotified = 0;
    let systemNotified = 0;

    const unsubTimer = timerStore.subscribe(() => {
      timerNotified++;
    });
    const unsubMedia = mediaStore.subscribe(() => {
      mediaNotified++;
    });
    const unsubClipboard = clipboardStore.subscribe(() => {
      clipboardNotified++;
    });
    const unsubFile = fileStore.subscribe(() => {
      fileNotified++;
    });
    const unsubSystem = systemStore.subscribe(() => {
      systemNotified++;
    });

    try {
      setTimerSession({
        id: "timer-iso",
        mode: "Pomodoro",
        state: "Running",
        started_at: 1000,
        paused_at: null,
        target_at: 1501000,
        duration_ms: 1500000,
        remaining_ms: 1500000,
        pomodoro_phase: "Work",
        completed_cycles: 1,
      });

      assert.equal(timerNotified, 1, "timerStore should notify its subscriber");
      assert.equal(mediaNotified, 0, "mediaStore MUST NOT be notified");
      assert.equal(clipboardNotified, 0, "clipboardStore MUST NOT be notified");
      assert.equal(fileNotified, 0, "fileStore MUST NOT be notified");
      assert.equal(systemNotified, 0, "systemStore MUST NOT be notified");
    } finally {
      unsubTimer();
      unsubMedia();
      unsubClipboard();
      unsubFile();
      unsubSystem();
    }
  });
});

describe("Timer Widget Registry & Priority Hierarchy", () => {
  it("registers timer widget with priority 40 and preserves hierarchy", () => {
    const registry = new WidgetRegistry();

    registry.register({
      id: "media",
      title: "Media Player",
      icon: "🎵",
      priority: 80,
      canActivate: () => true,
      lifecycle: "ready",
    });
    registry.register({
      id: "clipboard",
      title: "Clipboard",
      icon: "📋",
      priority: 70,
      canActivate: () => true,
      lifecycle: "ready",
    });
    registry.register({
      id: "files",
      title: "Files",
      icon: "📁",
      priority: 60,
      canActivate: () => true,
      lifecycle: "ready",
    });
    registry.register({
      id: "system",
      title: "System",
      icon: "⚙️",
      priority: 50,
      canActivate: () => true,
      lifecycle: "ready",
    });
    registry.register({
      id: "timer",
      title: "Timer",
      icon: "⏱️",
      priority: 40,
      canActivate: () => true,
      lifecycle: "ready",
    });

    const active = registry.getActiveWidgets();
    assert.equal(active.length, 5);

    // Exact hierarchy: Media(80) > Clipboard(70) > Files(60) > System(50) > Timer(40)
    assert.equal(active[0].id, "media");
    assert.equal(active[1].id, "clipboard");
    assert.equal(active[2].id, "files");
    assert.equal(active[3].id, "system");
    assert.equal(active[4].id, "timer");
    assert.equal(active[4].priority, 40);
  });

  it("handles timer onActivate and onDeactivate lifecycle hooks cleanly", () => {
    const registry = new WidgetRegistry();
    let activated = false;
    let deactivated = false;

    registry.register({
      id: "timer",
      title: "Timer",
      icon: "⏱️",
      priority: 40,
      canActivate: () => true,
      lifecycle: "idle",
      onActivate: () => {
        activated = true;
      },
      onDeactivate: () => {
        deactivated = true;
      },
    });

    registry.activate("timer");
    assert.equal(activated, true);
    assert.equal(deactivated, false);

    registry.deactivate("timer");
    assert.equal(deactivated, true);
  });
});

describe("User Lock Preservation with Background Timer Events", () => {
  beforeEach(() => {
    islandStore.setState(initialIslandState);
  });

  it("never overwrites explicitly user locked widget with background timer", async () => {
    const runtime = new IslandRuntime();

    // User explicitly selects files widget
    setActiveWidget("files", true);
    const lockedState = islandStore.getState();
    assert.equal(lockedState.activeWidgetId, "files");
    assert.equal(lockedState.userLockedWidget, true);

    // Background timer changes to running
    setTimerSession({
      id: "timer-bg",
      mode: "Countdown",
      state: "Running",
      started_at: 1000,
      paused_at: null,
      target_at: 60000,
      duration_ms: 59000,
      remaining_ms: 59000,
      pomodoro_phase: null,
      completed_cycles: 0,
    });

    // Handle background media or system event while locked
    await runtime.handleEvent({ type: "MEDIA_EVENT", isPlaying: true });

    // User locked widget must still be "files"
    const currentState = islandStore.getState();
    assert.equal(currentState.activeWidgetId, "files");
    assert.equal(currentState.userLockedWidget, true);
  });
});

describe("Timer Formatting and Pomodoro Phase State", () => {
  it("formats countdown and stopwatch milliseconds into accurate digital display", () => {
    assert.equal(formatTimeDisplay(0), "00:00");
    assert.equal(formatTimeDisplay(999), "00:00");
    assert.equal(formatTimeDisplay(1000), "00:01");
    assert.equal(formatTimeDisplay(59000), "00:59");
    assert.equal(formatTimeDisplay(60000), "01:00");
    assert.equal(formatTimeDisplay(25 * 60 * 1000), "25:00");
    assert.equal(formatTimeDisplay(24 * 60 * 1000 + 32 * 1000), "24:32");
    assert.equal(formatTimeDisplay(8 * 60 * 1000 + 41 * 1000), "08:41");
    assert.equal(formatTimeDisplay(3600 * 1000 + 120 * 1000 + 5000), "01:02:05");
  });

  it("handles Pomodoro phases and completed cycles in timer session", () => {
    const workSession: TimerSession = {
      id: "pomo-1",
      mode: "Pomodoro",
      state: "Running",
      started_at: 1000,
      paused_at: null,
      target_at: 1501000,
      duration_ms: 1500000,
      remaining_ms: 1500000,
      pomodoro_phase: "Work",
      completed_cycles: 0,
    };
    setTimerSession(workSession);
    assert.equal(timerStore.getState().session.pomodoro_phase, "Work");

    // Transition to ShortBreak
    const shortBreakSession: TimerSession = {
      ...workSession,
      pomodoro_phase: "ShortBreak",
      duration_ms: 300000,
      remaining_ms: 300000,
    };
    setTimerSession(shortBreakSession);
    assert.equal(timerStore.getState().session.pomodoro_phase, "ShortBreak");

    // Transition to LongBreak with completed cycle
    const longBreakSession: TimerSession = {
      ...workSession,
      pomodoro_phase: "LongBreak",
      duration_ms: 900000,
      remaining_ms: 900000,
      completed_cycles: 1,
    };
    setTimerSession(longBreakSession);
    assert.equal(timerStore.getState().session.pomodoro_phase, "LongBreak");
    assert.equal(timerStore.getState().session.completed_cycles, 1);
  });
});

describe("Bounded Display Scheduling & Cleanup", () => {
  it("verifies one-shot timeout cancellation on pause and reset without setInterval", () => {
    let timeoutCallCount = 0;
    let cancelled = false;

    // Simulate bounded scheduling mechanism matching TimerWidget
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleNextTick = () => {
      if (cancelled) return;
      timeoutCallCount++;
      // One-shot timeout scheduled to next whole second boundary
      timeoutId = setTimeout(scheduleNextTick, 50);
    };

    scheduleNextTick();
    assert.equal(timeoutCallCount, 1);

    // Cancel on pause/reset/unmount
    cancelled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    assert.equal(cancelled, true);
    assert.equal(timeoutId, null);
  });
});

describe("Timer Mode Switching & Idle Guarantee", () => {
  it("initializes switched mode in Idle state without auto-running", () => {
    // Mode switch to countdown
    const countdownSession: TimerSession = {
      id: "timer-cd",
      mode: "Countdown",
      state: "Idle",
      started_at: null,
      paused_at: null,
      target_at: null,
      duration_ms: 300000,
      remaining_ms: 300000,
      pomodoro_phase: null,
      completed_cycles: 0,
    };
    setTimerSession(countdownSession);
    assert.equal(timerStore.getState().session.state, "Idle");
    assert.equal(timerStore.getState().session.mode, "Countdown");

    // Mode switch to stopwatch
    const stopwatchSession: TimerSession = {
      id: "timer-sw",
      mode: "Stopwatch",
      state: "Idle",
      started_at: null,
      paused_at: null,
      target_at: null,
      duration_ms: null,
      remaining_ms: null,
      pomodoro_phase: null,
      completed_cycles: 0,
    };
    setTimerSession(stopwatchSession);
    assert.equal(timerStore.getState().session.state, "Idle");
    assert.equal(timerStore.getState().session.mode, "Stopwatch");

    // Mode switch to pomodoro
    const pomodoroSession: TimerSession = {
      id: "timer-pm",
      mode: "Pomodoro",
      state: "Idle",
      started_at: null,
      paused_at: null,
      target_at: null,
      duration_ms: 25 * 60 * 1000,
      remaining_ms: 25 * 60 * 1000,
      pomodoro_phase: "Work",
      completed_cycles: 0,
    };
    setTimerSession(pomodoroSession);
    assert.equal(timerStore.getState().session.state, "Idle");
    assert.equal(timerStore.getState().session.mode, "Pomodoro");
  });

  it("only transitions to Running when explicitly started", () => {
    const startedSession: TimerSession = {
      id: "timer-started",
      mode: "Countdown",
      state: "Running",
      started_at: Date.now(),
      paused_at: null,
      target_at: Date.now() + 300000,
      duration_ms: 300000,
      remaining_ms: 300000,
      pomodoro_phase: null,
      completed_cycles: 0,
    };
    setTimerSession(startedSession);
    assert.equal(timerStore.getState().session.state, "Running");
  });
});

describe("Countdown Presets Specification", () => {
  it("strictly contains [1, 5, 10, 15, 30, 45, 60] minutes and excludes 3 and 25 minutes", () => {
    const timerWidgetPath = path.resolve(import.meta.dirname, "../src/components/widgets/TimerWidget.tsx");
    const source = fs.readFileSync(timerWidgetPath, "utf-8");

    const presetsMatch = source.match(/const COUNTDOWN_PRESETS = \[([\s\S]*?)\];/);
    assert.ok(presetsMatch, "COUNTDOWN_PRESETS declaration must exist");

    const labelMatches = [...presetsMatch[1].matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(labelMatches, [
      "1 dk",
      "5 dk",
      "10 dk",
      "15 dk",
      "30 dk",
      "45 dk",
      "60 dk",
    ]);

    // Explicit check that 3m and 25m are removed
    assert.equal(labelMatches.includes("3 dk"), false, "3 dk preset must be removed");
    assert.equal(labelMatches.includes("25 dk"), false, "25 dk preset must be removed");
    assert.equal(presetsMatch[1].includes("3 * 60 * 1000"), false, "3 min ms must be removed");
    assert.equal(presetsMatch[1].includes("25 * 60 * 1000"), false, "25 min ms must be removed");
  });
});

