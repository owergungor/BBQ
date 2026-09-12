import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  hotkeyStore,
  initialHotkeyDomainState,
  setHotkeyDefinition,
  setHotkeyCapabilities,
  setHotkeyConflict,
  recordHotkeyTrigger,
} from "../src/state/hotkeyState.ts";
import { launcherStore, initialLauncherDomainState, setLauncherItems } from "../src/state/launcherState.ts";
import { timerStore } from "../src/state/timerState.ts";
import { reminderStore } from "../src/state/reminderState.ts";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";
import { systemStore } from "../src/state/systemState.ts";
import { dropStore } from "../src/state/dropState.ts";

import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import { islandStore, initialIslandState, setActiveWidget } from "../src/island/islandState.ts";
import { getEventPriority, EventPriority } from "../src/island/islandEvents.ts";
import { searchLauncherItems } from "../src/utils/launcherSearch.ts";
import type { LauncherItem, HotkeyDefinition, HotkeyCapabilities } from "@bbq/types";

describe("Hotkey Store & Domain State Isolation", () => {
  beforeEach(() => {
    hotkeyStore.setState(initialHotkeyDomainState);
    launcherStore.setState(initialLauncherDomainState);
  });

  it("manages hotkey definition, capabilities and conflicts", () => {
    const def: HotkeyDefinition = {
      id: "global_command_surface",
      key: "Space",
      modifiers: ["Ctrl"],
      display_str: "Ctrl+Space",
    };

    const caps: HotkeyCapabilities = {
      can_register: true,
      can_unregister: true,
      can_detect_conflicts: true,
    };

    setHotkeyDefinition(def);
    assert.deepEqual(hotkeyStore.getState().definition, def);

    setHotkeyCapabilities(caps);
    assert.deepEqual(hotkeyStore.getState().capabilities, caps);

    setHotkeyConflict("Shortcut already in use by system");
    assert.equal(hotkeyStore.getState().conflictError, "Shortcut already in use by system");

    recordHotkeyTrigger();
    assert.ok(hotkeyStore.getState().lastTriggeredAt !== null);
  });

  it("strictly isolates hotkey domain store from all other stores", () => {
    const initialTimer = timerStore.getState();
    const initialMedia = mediaStore.getState();
    const initialReminder = reminderStore.getState();
    const initialClipboard = clipboardStore.getState();
    const initialFile = fileStore.getState();
    const initialSystem = systemStore.getState();
    const initialDrop = dropStore.getState();

    setHotkeyDefinition({
      id: "global_command_surface",
      key: "K",
      modifiers: ["Cmd", "Shift"],
      display_str: "Cmd+Shift+K",
    });
    setHotkeyConflict("Simulated conflict");

    assert.deepEqual(timerStore.getState(), initialTimer);
    assert.deepEqual(mediaStore.getState(), initialMedia);
    assert.deepEqual(reminderStore.getState(), initialReminder);
    assert.deepEqual(clipboardStore.getState(), initialClipboard);
    assert.deepEqual(fileStore.getState(), initialFile);
    assert.deepEqual(systemStore.getState(), initialSystem);
    assert.deepEqual(dropStore.getState(), initialDrop);
  });
});

describe("Global Hotkey Island FSM & Command Surface Lifecycle", () => {
  let runtime: IslandRuntime;

  beforeEach(() => {
    runtime = new IslandRuntime();
    islandStore.setState(initialIslandState);
    launcherStore.setState(initialLauncherDomainState);
  });

  it("expands and focuses launcher widget from Idle on hotkey trigger", async () => {
    assert.equal(islandStore.getState().state, "Idle");
    assert.equal(islandStore.getState().activeWidgetId, "files");

    await runtime.handleHotkeyTriggered();

    const current = islandStore.getState();
    assert.equal(current.state, "Expanded");
    assert.equal(current.mode, "EXPANDED");
    assert.equal(current.expanded, true);
    assert.equal(current.activeWidgetId, "launcher");
    assert.equal(current.userLockedWidget, true, "User must lock focus on command surface");
    assert.equal(current.interaction, "keyboard");
  });

  it("toggles to Idle if hotkey triggered while launcher already active and expanded", async () => {
    await runtime.handleHotkeyTriggered();
    assert.equal(islandStore.getState().state, "Expanded");
    assert.equal(islandStore.getState().activeWidgetId, "launcher");

    // Second hotkey press toggles back to Idle
    await runtime.handleHotkeyTriggered();

    const current = islandStore.getState();
    assert.equal(current.state, "Idle");
    assert.equal(current.mode, "IDLE");
    assert.equal(current.expanded, false);
  });

  it("switches to launcher and maintains Expanded if triggered from another active widget", async () => {
    // User was on timer widget
    setActiveWidget("timer", true);
    await runtime.transitionTo("Expanded", "mouse");

    assert.equal(islandStore.getState().activeWidgetId, "timer");
    assert.equal(islandStore.getState().state, "Expanded");

    // Press hotkey -> immediately switches to launcher
    await runtime.handleHotkeyTriggered();

    const current = islandStore.getState();
    assert.equal(current.state, "Expanded");
    assert.equal(current.activeWidgetId, "launcher");
    assert.equal(current.userLockedWidget, true);
  });

  it("assigns UserInteraction top priority to HOTKEY_TRIGGER events", () => {
    const priority = getEventPriority({ type: "HOTKEY_TRIGGER" });
    assert.equal(priority, EventPriority.UserInteraction);
  });
});

describe("Command Surface In-Memory Search & Keyboard Navigation", () => {
  const sampleItems: LauncherItem[] = [
    {
      id: "bbq-clipboard",
      title: "Clipboard History",
      subtitle: "View clipboard items",
      icon: "📋",
      action: { type: "bbq_action", payload: { action: "open_clipboard" } },
      source: "built_in",
      favorite: true,
      last_used_at: 50_000,
      usage_count: 10,
    },
    {
      id: "app-terminal",
      title: "Terminal",
      subtitle: "Open Command Prompt",
      icon: "💻",
      action: { type: "open_application", payload: { id: "cmd.exe" } },
      source: "application",
      favorite: false,
      last_used_at: 10_000,
      usage_count: 2,
    },
    {
      id: "docs-url",
      title: "BBQ Documentation",
      subtitle: "https://github.com/example/bbq",
      icon: "🌐",
      action: { type: "open_url", payload: { url: "https://github.com/example/bbq" } },
      source: "built_in",
      favorite: false,
      last_used_at: null,
      usage_count: 0,
    },
  ];

  it("executes purely in-memory smart search without IPC latency", () => {
    const favorites = new Set(["bbq-clipboard"]);
    const recent = new Set(["app-terminal"]);

    // Query matches terminal
    const results = searchLauncherItems("term", sampleItems, favorites, recent);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "app-terminal");

    // Empty query ranks favorites first
    const emptyResults = searchLauncherItems("", sampleItems, favorites, recent);
    assert.equal(emptyResults[0].id, "bbq-clipboard", "Favorite item must rank top");
  });

  it("safely handles escape collapse without leaking state", async () => {
    const runtime = new IslandRuntime();
    await runtime.handleHotkeyTriggered();
    assert.equal(islandStore.getState().state, "Expanded");

    await runtime.handleEvent({ type: "USER_ESCAPE" });
    assert.equal(islandStore.getState().state, "Hovering");

    await runtime.handleEvent({ type: "USER_ESCAPE" });
    assert.equal(islandStore.getState().state, "Idle");
  });
});
