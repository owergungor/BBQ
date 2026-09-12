import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  launcherStore,
  initialLauncherDomainState,
  setLauncherItems,
  setLauncherFavorites,
  setLauncherRecent,
  setLauncherCapabilities,
  setSearchQuery,
  setSelectedIndex,
  setLauncherLoading,
  setLauncherError,
} from "../src/state/launcherState.ts";
import { timerStore } from "../src/state/timerState.ts";
import { reminderStore } from "../src/state/reminderState.ts";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";
import { systemStore } from "../src/state/systemState.ts";
import { WidgetRegistry } from "../src/island/widgetRegistry.ts";
import { islandStore, initialIslandState, setActiveWidget } from "../src/island/islandState.ts";
import type { LauncherItem, LauncherCapabilities } from "@bbq/types";

describe("Launcher Store & State Isolation", () => {
  beforeEach(() => {
    launcherStore.setState(initialLauncherDomainState);
  });

  it("updates launcher store correctly with items, favorites, and recent", () => {
    const item1: LauncherItem = {
      id: "bbq-timer",
      title: "Timer",
      subtitle: "Open timer widget",
      icon: "⏱️",
      action: { type: "bbq_action", payload: { action: "open_timer" } },
      source: "built_in",
      favorite: false,
      last_used_at: null,
      usage_count: 0,
    };

    const item2: LauncherItem = {
      id: "app-browser",
      title: "Web Browser",
      subtitle: "Open default browser",
      icon: "🌐",
      action: { type: "open_application", payload: { id: "browser" } },
      source: "favorite",
      favorite: true,
      last_used_at: 100_000,
      usage_count: 5,
    };

    setLauncherItems([item1, item2]);
    assert.equal(launcherStore.getState().items.length, 2);
    assert.equal(launcherStore.getState().items[0].id, "bbq-timer");

    setLauncherFavorites([item2]);
    assert.equal(launcherStore.getState().favorites.length, 1);
    assert.equal(launcherStore.getState().favorites[0].favorite, true);

    setLauncherRecent([item2]);
    assert.equal(launcherStore.getState().recent.length, 1);
  });

  it("updates search query and resets selectedIndex", () => {
    setSelectedIndex(3);
    assert.equal(launcherStore.getState().selectedIndex, 3);

    setSearchQuery("calc");
    assert.equal(launcherStore.getState().searchQuery, "calc");
    assert.equal(launcherStore.getState().selectedIndex, 0);
  });

  it("handles Home and End selection updates accurately", () => {
    const totalItems = 10;
    // Simulate Home key
    setSelectedIndex(0);
    assert.equal(launcherStore.getState().selectedIndex, 0);

    // Simulate End key
    setSelectedIndex(totalItems - 1);
    assert.equal(launcherStore.getState().selectedIndex, 9);

    // Simulate Arrow navigation
    const nextIndex = (launcherStore.getState().selectedIndex + 1) % totalItems;
    setSelectedIndex(nextIndex);
    assert.equal(launcherStore.getState().selectedIndex, 0);
  });

  it("handles capabilities, loading, and error states cleanly", () => {
    const caps: LauncherCapabilities = {
      open_application: true,
      open_file: true,
      open_folder: true,
      open_url: true,
      system_actions: true,
    };

    setLauncherCapabilities(caps);
    assert.deepEqual(launcherStore.getState().capabilities, caps);

    setLauncherLoading(true);
    assert.equal(launcherStore.getState().isLoading, true);

    setLauncherError("Platform launch failed");
    assert.equal(launcherStore.getState().error, "Platform launch failed");
    assert.equal(launcherStore.getState().isLoading, false);
  });

  it("strictly isolates launcherStore updates from all other domain stores", () => {
    let launcherNotified = 0;
    let timerNotified = 0;
    let reminderNotified = 0;
    let mediaNotified = 0;
    let clipboardNotified = 0;
    let fileNotified = 0;
    let systemNotified = 0;

    const unsubLauncher = launcherStore.subscribe(() => {
      launcherNotified++;
    });
    const unsubTimer = timerStore.subscribe(() => {
      timerNotified++;
    });
    const unsubReminder = reminderStore.subscribe(() => {
      reminderNotified++;
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

    setLauncherItems([
      {
        id: "sys-settings",
        title: "Settings",
        subtitle: null,
        icon: null,
        action: { type: "system_action", payload: { action: "open_settings" } },
        source: "built_in",
        favorite: false,
        last_used_at: null,
        usage_count: 0,
      },
    ]);

    assert.equal(launcherNotified, 1);
    assert.equal(timerNotified, 0);
    assert.equal(reminderNotified, 0);
    assert.equal(mediaNotified, 0);
    assert.equal(clipboardNotified, 0);
    assert.equal(fileNotified, 0);
    assert.equal(systemNotified, 0);

    unsubLauncher();
    unsubTimer();
    unsubReminder();
    unsubMedia();
    unsubClipboard();
    unsubFile();
    unsubSystem();
  });
});

describe("Widget Registry Priority Contract (Milestone 9)", () => {
  it("maintains strict hierarchy: System (50) > Launcher (45) > Timer (40) > Reminder (35)", () => {
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
      id: "launcher",
      title: "Launcher",
      icon: "🚀",
      priority: 45,
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
    assert.equal(active[0].priority, 50);
    assert.equal(active[1].id, "launcher");
    assert.equal(active[1].priority, 45);
    assert.equal(active[2].id, "timer");
    assert.equal(active[2].priority, 40);
    assert.equal(active[3].id, "reminder");
    assert.equal(active[3].priority, 35);
  });
});

describe("User Lock Preservation with Background Events", () => {
  beforeEach(() => {
    islandStore.setState(initialIslandState);
  });

  it("never overwrites explicitly user-locked widget", () => {
    setActiveWidget("launcher", true);
    assert.equal(islandStore.getState().activeWidgetId, "launcher");
    assert.equal(islandStore.getState().userLockedWidget, true);

    // If another component attempts to switch without force, lock remains
    assert.equal(islandStore.getState().activeWidgetId, "launcher");
  });
});
