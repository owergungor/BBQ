import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  reminderStore,
  initialReminderDomainState,
  setReminders,
  updateOrAddReminder,
  removeReminder,
  setReminderLoading,
  setReminderError,
  formatDueTime,
} from "../src/state/reminderState.ts";
import { timerStore } from "../src/state/timerState.ts";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";
import { systemStore } from "../src/state/systemState.ts";
import { WidgetRegistry } from "../src/island/widgetRegistry.ts";
import { islandStore, initialIslandState, setActiveWidget } from "../src/island/islandState.ts";
import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import type { Reminder } from "@bbq/types";

describe("Reminder Store & State Isolation", () => {
  beforeEach(() => {
    reminderStore.setState(initialReminderDomainState);
  });

  it("updates reminder store correctly on reminder additions and updates", () => {
    const mockReminder: Reminder = {
      id: "rem-101",
      title: "Review PR",
      body: "Check security and performance docs",
      due_at: 200_000,
      state: "Scheduled",
      created_at: 100_000,
    };

    updateOrAddReminder(mockReminder);
    const state = reminderStore.getState();
    assert.equal(state.reminders.length, 1);
    assert.equal(state.reminders[0].id, "rem-101");
    assert.equal(state.reminders[0].title, "Review PR");
    assert.equal(state.reminders[0].state, "Scheduled");

    // Update state to Fired
    const firedReminder: Reminder = { ...mockReminder, state: "Fired" };
    updateOrAddReminder(firedReminder);
    const updatedState = reminderStore.getState();
    assert.equal(updatedState.reminders.length, 1);
    assert.equal(updatedState.reminders[0].state, "Fired");
  });

  it("removes reminder from store", () => {
    const rem1: Reminder = {
      id: "rem-1",
      title: "T1",
      body: null,
      due_at: 150_000,
      state: "Scheduled",
      created_at: 100_000,
    };
    const rem2: Reminder = {
      id: "rem-2",
      title: "T2",
      body: null,
      due_at: 180_000,
      state: "Scheduled",
      created_at: 100_000,
    };

    setReminders([rem1, rem2]);
    assert.equal(reminderStore.getState().reminders.length, 2);

    removeReminder("rem-1");
    const after = reminderStore.getState().reminders;
    assert.equal(after.length, 1);
    assert.equal(after[0].id, "rem-2");
  });

  it("handles loading and error states cleanly", () => {
    setReminderLoading(true);
    assert.equal(reminderStore.getState().isLoading, true);

    setReminderError("Network error while syncing reminder");
    assert.equal(reminderStore.getState().error, "Network error while syncing reminder");
    assert.equal(reminderStore.getState().isLoading, false);
  });

  it("strictly isolates reminderStore notifications from timer, media, clipboard, file, and system stores", () => {
    let reminderNotified = 0;
    let timerNotified = 0;
    let mediaNotified = 0;
    let clipboardNotified = 0;
    let fileNotified = 0;
    let systemNotified = 0;

    const unsubReminder = reminderStore.subscribe(() => {
      reminderNotified++;
    });
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

    updateOrAddReminder({
      id: "rem-iso",
      title: "Isolated task",
      body: null,
      due_at: 300_000,
      state: "Scheduled",
      created_at: 100_000,
    });

    assert.equal(reminderNotified, 1);
    assert.equal(timerNotified, 0, "timerStore must NOT be notified");
    assert.equal(mediaNotified, 0, "mediaStore must NOT be notified");
    assert.equal(clipboardNotified, 0, "clipboardStore must NOT be notified");
    assert.equal(fileNotified, 0, "fileStore must NOT be notified");
    assert.equal(systemNotified, 0, "systemStore must NOT be notified");

    unsubReminder();
    unsubTimer();
    unsubMedia();
    unsubClipboard();
    unsubFile();
    unsubSystem();
  });
});

describe("Reminder Widget Registry & Priority Hierarchy", () => {
  it("registers reminder widget with priority 35 below Timer (40) and above Notes (30)", () => {
    const registry = new WidgetRegistry();

    registry.register({
      id: "reminder",
      title: "Reminders",
      icon: "🔔",
      priority: 35,
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

    registry.register({
      id: "system",
      title: "System",
      icon: "⚙️",
      priority: 50,
      canActivate: () => true,
      lifecycle: "ready",
    });

    const active = registry.getActiveWidgets();
    assert.equal(active[0].id, "system");
    assert.equal(active[1].id, "timer");
    assert.equal(active[2].id, "reminder");
    assert.equal(active[2].priority, 35);
  });
});

describe("User Lock Preservation with Background Reminder Events", () => {
  beforeEach(() => {
    islandStore.setState(initialIslandState);
  });

  it("never overwrites explicitly user locked widget with background reminder event", () => {
    const registry = new WidgetRegistry();
    registry.register({
      id: "files",
      title: "Files",
      icon: "📁",
      priority: 90,
      canActivate: () => true,
      lifecycle: "ready",
    });
    registry.register({
      id: "reminder",
      title: "Reminders",
      icon: "🔔",
      priority: 35,
      canActivate: () => true,
      lifecycle: "ready",
    });

    const runtime = new IslandRuntime(registry);

    // User explicitly selects and locks Files widget
    setActiveWidget("files", true);
    assert.equal(islandStore.getState().activeWidgetId, "files");
    assert.equal(islandStore.getState().userLockedWidget, true);

    // Background reminder arrives
    runtime.handleReminderUpdated({
      id: "rem-bg",
      title: "Background task",
      body: null,
      due_at: 100_000,
      state: "Scheduled",
      created_at: 50_000,
    });

    // Active widget must remain strictly "files"
    assert.equal(islandStore.getState().activeWidgetId, "files");
    assert.equal(islandStore.getState().userLockedWidget, true);
  });
});

describe("Reminder Time Formatting", () => {
  it("formats relative due time accurately across boundaries", () => {
    const now = 1_000_000;

    assert.equal(formatDueTime(now, now), "Due now");
    assert.equal(formatDueTime(now - 5000, now), "Due now");
    assert.equal(formatDueTime(now + 45_000, now), "in 45s");
    assert.equal(formatDueTime(now + 10 * 60 * 1000, now), "in 10m");
    assert.equal(formatDueTime(now + (2 * 3600 + 15 * 60) * 1000, now), "in 2h 15m");
    assert.equal(formatDueTime(now + (24 * 3600 + 3 * 3600) * 1000, now), "in 1d 3h");
  });
});
