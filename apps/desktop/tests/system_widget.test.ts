import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  systemStore,
  initialSystemDomainState,
  setSystemState,
  setSystemCapabilities,
  setSystemLoading,
  setSystemError,
} from "../src/state/systemState.ts";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";
import { WidgetRegistry } from "../src/island/widgetRegistry.ts";
import type { SystemState, SystemCapabilities } from "@bbq/types";

describe("System Store & State Isolation", () => {
  beforeEach(() => {
    systemStore.setState(initialSystemDomainState);
  });

  it("updates system store correctly on state change", () => {
    const mockState: SystemState = {
      battery: {
        available: true,
        percentage: 85,
        charging: true,
        plugged_in: true,
        power_source: "AC",
      },
      network: {
        connected: true,
        interface_name: "Wi-Fi",
        connection_type: "wifi",
        signal_strength: 80,
      },
      volume: 65,
      muted: false,
      uptime_seconds: 3600,
      hostname: "bbq-pc",
      operating_system: "windows",
      platform: "windows",
    };

    setSystemState(mockState);
    const current = systemStore.getState();
    assert.equal(current.system.battery.percentage, 85);
    assert.equal(current.system.battery.charging, true);
    assert.equal(current.system.network.connected, true);
    assert.equal(current.system.volume, 65);
    assert.equal(current.system.muted, false);
    assert.equal(current.isLoading, false);
    assert.equal(current.error, null);
  });

  it("updates capabilities and handles loading/error states", () => {
    const caps: SystemCapabilities = {
      battery_status: true,
      network_status: true,
      volume_status: true,
      volume_control: true,
      mute_control: true,
    };

    setSystemCapabilities(caps);
    assert.deepEqual(systemStore.getState().capabilities, caps);

    setSystemLoading(true);
    assert.equal(systemStore.getState().isLoading, true);

    setSystemError("Device unavailable");
    assert.equal(systemStore.getState().error, "Device unavailable");
    assert.equal(systemStore.getState().isLoading, false);
  });

  it("strictly isolates systemStore notifications from media, clipboard, and file stores", () => {
    let systemNotified = 0;
    let mediaNotified = 0;
    let clipboardNotified = 0;
    let fileNotified = 0;

    const unsubSystem = systemStore.subscribe(() => {
      systemNotified++;
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

    try {
      setSystemState({
        battery: {
          available: false,
          percentage: null,
          charging: null,
          plugged_in: null,
          power_source: null,
        },
        network: {
          connected: false,
          interface_name: null,
          connection_type: null,
          signal_strength: null,
        },
        volume: null,
        muted: null,
        uptime_seconds: null,
        hostname: null,
        operating_system: "windows",
        platform: "windows",
      });

      assert.equal(systemNotified, 1, "systemStore should notify its subscriber");
      assert.equal(mediaNotified, 0, "mediaStore MUST NOT be notified");
      assert.equal(clipboardNotified, 0, "clipboardStore MUST NOT be notified");
      assert.equal(fileNotified, 0, "fileStore MUST NOT be notified");
    } finally {
      unsubSystem();
      unsubMedia();
      unsubClipboard();
      unsubFile();
    }
  });
});

describe("Widget Registry - Quick Tools & System Foundation", () => {
  it("registers system widget with priority 50 below files and above background", () => {
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
      title: "Clipboard Manager",
      icon: "📋",
      priority: 70,
      canActivate: () => true,
      lifecycle: "ready",
    });
    registry.register({
      id: "files",
      title: "File Stash",
      icon: "📁",
      priority: 60,
      canActivate: () => true,
      lifecycle: "ready",
    });
    registry.register({
      id: "system",
      title: "System Status",
      icon: "⚡",
      priority: 50,
      canActivate: () => true,
      lifecycle: "ready",
    });

    const active = registry.getActiveWidgets();
    assert.equal(active.length, 4);

    // Highest priority comes first
    assert.equal(active[0].id, "media");
    assert.equal(active[1].id, "clipboard");
    assert.equal(active[2].id, "files");
    assert.equal(active[3].id, "system");
    assert.equal(active[3].priority, 50);
  });

  it("executes onActivate and onDeactivate lifecycle hooks deterministically", () => {
    const registry = new WidgetRegistry();

    let activateCount = 0;
    let deactivateCount = 0;

    registry.register({
      id: "system",
      title: "System Status",
      icon: "⚡",
      priority: 50,
      canActivate: () => true,
      lifecycle: "idle",
      onActivate: () => {
        activateCount++;
      },
      onDeactivate: () => {
        deactivateCount++;
      },
    });

    assert.equal(activateCount, 0);
    assert.equal(deactivateCount, 0);

    registry.activate("system");
    assert.equal(activateCount, 1);
    assert.equal(deactivateCount, 0);

    // Activating again does not double-trigger
    registry.activate("system");
    assert.equal(activateCount, 1);

    registry.deactivate("system");
    assert.equal(activateCount, 1);
    assert.equal(deactivateCount, 1);

    // Deactivating again does not double-trigger
    registry.deactivate("system");
    assert.equal(activateCount, 1);
    assert.equal(deactivateCount, 1);
  });

  it("handles onActivate / onDeactivate when switching active widgets", () => {
    const registry = new WidgetRegistry();
    const order: string[] = [];

    registry.register({
      id: "files",
      title: "Files",
      icon: "📁",
      priority: 60,
      canActivate: () => true,
      lifecycle: "idle",
      onActivate: () => order.push("files:activated"),
      onDeactivate: () => order.push("files:deactivated"),
    });

    registry.register({
      id: "system",
      title: "System",
      icon: "⚡",
      priority: 50,
      canActivate: () => true,
      lifecycle: "idle",
      onActivate: () => order.push("system:activated"),
      onDeactivate: () => order.push("system:deactivated"),
    });

    registry.activate("files");
    assert.deepEqual(order, ["files:activated"]);

    registry.deactivate("files");
    registry.activate("system");
    assert.deepEqual(order, ["files:activated", "files:deactivated", "system:activated"]);
  });
});
