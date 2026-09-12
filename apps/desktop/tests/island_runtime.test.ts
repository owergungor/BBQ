import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import { islandStore, initialIslandState, setActiveWidget } from "../src/island/islandState.ts";
import {
  WidgetRegistry,
  type WidgetDefinition,
} from "../src/island/widgetRegistry.ts";
import {
  getEventPriority,
  EventPriority,
  type IslandEvent,
} from "../src/island/islandEvents.ts";
import { handleWidgetCrash } from "../src/island/widgetBoundary.ts";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";

describe("Island State Machine Transitions", () => {
  let runtime: IslandRuntime;

  beforeEach(() => {
    runtime = new IslandRuntime();
    islandStore.setState(initialIslandState);
  });

  it("transitions from Idle to Hovering on USER_HOVER", async () => {
    assert.equal(islandStore.getState().state, "Idle");
    await runtime.handleEvent({ type: "USER_HOVER" });
    assert.equal(islandStore.getState().state, "Hovering");
    assert.equal(islandStore.getState().mode, "ACTIVE");
    assert.equal(islandStore.getState().isHovered, true);
  });

  it("transitions from Hovering to Expanded on USER_CLICK", async () => {
    await runtime.transitionTo("Hovering", "mouse");
    await runtime.handleEvent({ type: "USER_CLICK" });
    assert.equal(islandStore.getState().state, "Expanded");
    assert.equal(islandStore.getState().mode, "EXPANDED");
    assert.equal(islandStore.getState().expanded, true);
  });

  it("toggles from Expanded to Hovering on subsequent USER_CLICK", async () => {
    await runtime.transitionTo("Expanded", "mouse");
    await runtime.handleEvent({ type: "USER_CLICK" });
    assert.equal(islandStore.getState().state, "Hovering");
    assert.equal(islandStore.getState().mode, "ACTIVE");
    assert.equal(islandStore.getState().expanded, false);
  });

  it("collapses from Expanded to Hovering then Idle on ESCAPE", async () => {
    await runtime.transitionTo("Expanded", "keyboard");
    assert.equal(islandStore.getState().state, "Expanded");

    // First escape collapses to Hovering / Compact
    await runtime.handleEvent({ type: "USER_ESCAPE" });
    assert.equal(islandStore.getState().state, "Hovering");

    // Second escape collapses to Idle
    await runtime.handleEvent({ type: "USER_ESCAPE" });
    assert.equal(islandStore.getState().state, "Idle");
    assert.equal(islandStore.getState().mode, "IDLE");
  });

  it("collapses from Expanded to Idle on CLICK_OUTSIDE", async () => {
    await runtime.transitionTo("Expanded", "mouse");
    await runtime.handleEvent({ type: "CLICK_OUTSIDE" });
    assert.equal(islandStore.getState().state, "Idle");
    assert.equal(islandStore.getState().mode, "IDLE");
  });

  it("handles drag-and-drop cycle: DRAG_ENTER -> DRAG_LEAVE -> Idle", async () => {
    assert.equal(islandStore.getState().state, "Idle");
    await runtime.handleEvent({ type: "DRAG_ENTER" });
    assert.equal(islandStore.getState().state, "DraggingOver");
    assert.equal(islandStore.getState().isDragOver, true);

    await runtime.handleEvent({ type: "DRAG_LEAVE" });
    assert.equal(islandStore.getState().state, "Idle");
    assert.equal(islandStore.getState().isDragOver, false);
  });

  it("handles file drop: DRAG_ENTER -> DROP -> Expanded with drop widget active", async () => {
    await runtime.handleEvent({ type: "DRAG_ENTER" });
    assert.equal(islandStore.getState().state, "DraggingOver");

    await runtime.handleEvent({ type: "DROP", paths: ["/path/to/sample.pdf"] });
    assert.equal(islandStore.getState().state, "Expanded");
    assert.equal(islandStore.getState().isDragOver, false);
    assert.equal(islandStore.getState().activeWidgetId, "drop");
  });
});

describe("Widget Registry", () => {
  let registry: WidgetRegistry;

  beforeEach(() => {
    registry = new WidgetRegistry();
  });

  it("registers active widget and looks it up", () => {
    const testWidget: WidgetDefinition = {
      id: "custom_notes",
      title: "Quick Notes",
      icon: "🗒️",
      priority: 85,
      canActivate: () => true,
      lifecycle: "ready",
    };

    registry.register(testWidget);
    const retrieved = registry.get("custom_notes");
    assert.ok(retrieved);
    assert.equal(retrieved.title, "Quick Notes");
    assert.equal(retrieved.lifecycle, "ready");
  });

  it("rejects duplicate registration with clear error", () => {
    const widgetA: WidgetDefinition = {
      id: "dup_widget",
      title: "Dup",
      icon: "⭐",
      priority: 50,
      canActivate: () => true,
      lifecycle: "ready",
    };

    registry.register(widgetA);
    assert.throws(
      () => registry.register(widgetA),
      /Duplicate widget registration attempted for id: dup_widget/
    );
  });

  it("has pre-declared future widgets marked as unavailable", () => {
    const timer = registry.get("timer");
    assert.ok(timer);
    assert.equal(timer.lifecycle, "unavailable");
    assert.equal(timer.isDeclaredOnly, true);

    const launcher = registry.get("launcher");
    assert.ok(launcher);
    assert.equal(launcher.lifecycle, "unavailable");
  });

  it("updates widget lifecycle safely", () => {
    registry.register({
      id: "test_widget",
      title: "Test",
      icon: "🧪",
      priority: 10,
      canActivate: () => true,
      lifecycle: "idle",
    });

    assert.equal(registry.get("test_widget")?.lifecycle, "idle");
    registry.setLifecycle("test_widget", "loading");
    assert.equal(registry.get("test_widget")?.lifecycle, "loading");
    registry.setLifecycle("test_widget", "ready");
    assert.equal(registry.get("test_widget")?.lifecycle, "ready");
  });
});

describe("Deterministic Priority Hierarchy", () => {
  it("enforces strict priority order", () => {
    const clickEvent: IslandEvent = { type: "USER_CLICK" };
    const dragEvent: IslandEvent = { type: "DRAG_ENTER" };
    const mediaEvent: IslandEvent = { type: "MEDIA_EVENT", isPlaying: true };
    const clipEvent: IslandEvent = { type: "CLIPBOARD_EVENT", preview: "text" };
    const fileEvent: IslandEvent = { type: "FILE_EVENT", fileCount: 3 };

    assert.ok(
      getEventPriority(clickEvent) > getEventPriority(dragEvent),
      "User interaction must exceed drag/drop"
    );
    assert.ok(
      getEventPriority(dragEvent) > getEventPriority(mediaEvent),
      "Drag/drop must exceed active media"
    );
    assert.ok(
      getEventPriority(mediaEvent) > getEventPriority(clipEvent),
      "Active media must exceed clipboard event"
    );
    assert.ok(
      getEventPriority(clipEvent) > getEventPriority(fileEvent),
      "Clipboard event must exceed file event"
    );
    assert.ok(
      getEventPriority(fileEvent) > EventPriority.Idle,
      "File event must exceed Idle"
    );
  });

  it("user locked widget is NOT overwritten by background media updates", async () => {
    const runtime = new IslandRuntime();
    islandStore.setState(initialIslandState);

    // User explicitly selects 'files' widget
    setActiveWidget("files", true);
    assert.equal(islandStore.getState().activeWidgetId, "files");
    assert.equal(islandStore.getState().userLockedWidget, true);

    // Incoming media starts playing
    await runtime.handleEvent({
      type: "MEDIA_EVENT",
      isPlaying: true,
      title: "New Song",
    });

    // Active widget MUST stay on files because user locked it
    assert.equal(
      islandStore.getState().activeWidgetId,
      "files",
      "Media must not override user locked widget"
    );
  });

  it("unlocked widget switches to media when playback starts", async () => {
    const runtime = new IslandRuntime();
    islandStore.setState({
      ...initialIslandState,
      userLockedWidget: false,
    });

    await runtime.handleEvent({
      type: "MEDIA_EVENT",
      isPlaying: true,
      title: "New Song",
    });

    assert.equal(islandStore.getState().activeWidgetId, "media");
  });
});

describe("Error Isolation (WidgetBoundary)", () => {
  it("catches unhandled widget exceptions without re-throwing", () => {
    const mockError = new Error("Mock widget rendering crash");
    const derived = handleWidgetCrash(mockError);

    assert.equal(derived.hasError, true);
    assert.equal(derived.error, mockError);
  });
});

describe("Store Isolation", () => {
  it("updating mediaStore does NOT notify clipboardStore or fileStore subscribers", () => {
    let mediaNotified = 0;
    let clipboardNotified = 0;
    let fileNotified = 0;

    const unlistenMedia = mediaStore.subscribe(() => {
      mediaNotified++;
    });
    const unlistenClip = clipboardStore.subscribe(() => {
      clipboardNotified++;
    });
    const unlistenFile = fileStore.subscribe(() => {
      fileNotified++;
    });

    mediaStore.setState({
      currentSession: {
        id: "isolated-session",
        state: "playing",
        title: "Isolated Track",
        artist: "Test Artist",
        album: null,
        albumArt: null,
        durationMs: 120000,
        positionMs: 30000,
        volume: 1.0,
        source: "Spotify",
        capabilities: {
          canPlay: true,
          canPause: true,
          canGoNext: true,
          canGoPrevious: true,
          canSeek: true,
          canChangeVolume: false,
        },
      },
    });

    assert.equal(mediaNotified, 1, "Media subscriber must be notified");
    assert.equal(clipboardNotified, 0, "Clipboard subscriber must NOT be notified");
    assert.equal(fileNotified, 0, "File subscriber must NOT be notified");

    unlistenMedia();
    unlistenClip();
    unlistenFile();
  });
});
