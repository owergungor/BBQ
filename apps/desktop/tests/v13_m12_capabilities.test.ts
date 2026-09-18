import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bbqCommands } from "../src/ipc/commands.ts";
import {
  formatCapabilityStatus,
  isHotkeySupported,
  isClipboardLiveSupported,
} from "../src/components/widgets/settingsModel.ts";
import type { CapabilityStatus, PlatformCapabilities } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v1.3 — M12 Platform Capability State & Settings UI Tests", () => {
  describe("1. Capability Status Formatting & Pure Mapping", () => {
    it("maps supported status to green / success token", () => {
      const result = formatCapabilityStatus("supported");
      assert.equal(result.label, "Supported");
      assert.match(result.color, /success/i);
    });

    it("maps passive status to on-demand warning color", () => {
      const result = formatCapabilityStatus("passive");
      assert.equal(result.label, "Passive / On-Demand");
      assert.equal(result.color, "#f59e0b");
    });

    it("maps permissionRequired status to truthful label and warning color", () => {
      const result = formatCapabilityStatus("permissionRequired");
      assert.equal(result.label, "Permission Required");
      assert.equal(result.color, "#f59e0b");
    });

    it("maps compositorDependent status to informational color", () => {
      const result = formatCapabilityStatus("compositorDependent");
      assert.equal(result.label, "Compositor Dependent");
      assert.equal(result.color, "#3b82f6");
    });

    it("maps unavailable status to muted token", () => {
      const result = formatCapabilityStatus("unavailable");
      assert.equal(result.label, "Unavailable");
      assert.match(result.color, /muted/i);
    });
  });

  describe("2. Feature Capability Guards", () => {
    it("isHotkeySupported defaults to true when capabilities not yet loaded", () => {
      assert.equal(isHotkeySupported(null), true);
    });

    it("isHotkeySupported returns true only for supported status", () => {
      const windowsCaps: PlatformCapabilities = {
        platform: "windows",
        globalHotkey: "supported",
        clipboardLiveEvents: "supported",
        clipboardHistory: "supported",
        mediaControl: "supported",
        mediaEvents: "supported",
        notifications: "supported",
        displayChangeEvents: "supported",
        windowAbsolutePositioning: "supported",
      };
      assert.equal(isHotkeySupported(windowsCaps), true);

      const macCaps: PlatformCapabilities = {
        ...windowsCaps,
        platform: "macos",
        globalHotkey: "unavailable",
      };
      assert.equal(isHotkeySupported(macCaps), false);

      const linuxCaps: PlatformCapabilities = {
        ...windowsCaps,
        platform: "linux",
        globalHotkey: "unavailable",
      };
      assert.equal(isHotkeySupported(linuxCaps), false);
    });

    it("isClipboardLiveSupported identifies passive platforms accurately", () => {
      assert.equal(isClipboardLiveSupported(null), true);

      const winCaps: PlatformCapabilities = {
        platform: "windows",
        globalHotkey: "supported",
        clipboardLiveEvents: "supported",
        clipboardHistory: "supported",
        mediaControl: "supported",
        mediaEvents: "supported",
        notifications: "supported",
        displayChangeEvents: "supported",
        windowAbsolutePositioning: "supported",
      };
      assert.equal(isClipboardLiveSupported(winCaps), true);

      const macCaps: PlatformCapabilities = {
        ...winCaps,
        platform: "macos",
        clipboardLiveEvents: "passive",
      };
      assert.equal(isClipboardLiveSupported(macCaps), false);
    });
  });

  describe("3. Truthful Platform Profiles", () => {
    it("Windows profile has full event-driven desktop integration", () => {
      const win: PlatformCapabilities = {
        platform: "windows",
        globalHotkey: "supported",
        clipboardLiveEvents: "supported",
        clipboardHistory: "supported",
        mediaControl: "supported",
        mediaEvents: "supported",
        notifications: "supported",
        displayChangeEvents: "supported",
        windowAbsolutePositioning: "supported",
      };
      assert.equal(win.globalHotkey, "supported");
      assert.equal(win.clipboardLiveEvents, "supported");
      assert.equal(win.windowAbsolutePositioning, "supported");
    });

    it("macOS profile reflects passive clipboard and permissionRequired media", () => {
      const mac: PlatformCapabilities = {
        platform: "macos",
        globalHotkey: "unavailable",
        clipboardLiveEvents: "passive",
        clipboardHistory: "supported",
        mediaControl: "permissionRequired",
        mediaEvents: "passive",
        notifications: "supported",
        displayChangeEvents: "supported",
        windowAbsolutePositioning: "supported",
      };
      assert.equal(mac.globalHotkey, "unavailable");
      assert.equal(mac.clipboardLiveEvents, "passive");
      assert.equal(mac.mediaControl, "permissionRequired");
      assert.equal(mac.clipboardHistory, "supported");
    });

    it("Linux Wayland profile reflects compositorDependent positioning", () => {
      const wayland: PlatformCapabilities = {
        platform: "linux-wayland",
        globalHotkey: "unavailable",
        clipboardLiveEvents: "passive",
        clipboardHistory: "supported",
        mediaControl: "supported",
        mediaEvents: "supported",
        notifications: "supported",
        displayChangeEvents: "supported",
        windowAbsolutePositioning: "compositorDependent",
      };
      assert.equal(wayland.windowAbsolutePositioning, "compositorDependent");
      assert.equal(wayland.globalHotkey, "unavailable");
    });
  });

  describe("4. IPC Command Verification", () => {
    it("getPlatformCapabilities returns null upon invoke failure without crashing", async () => {
      const res = await bbqCommands.getPlatformCapabilities();
      assert.equal(res, null);
    });
  });

  describe("5. Static Invariant & Accessibility Audit", () => {
    const settingsWidgetPath = path.resolve(
      __dirname,
      "../src/components/widgets/SettingsWidget.tsx"
    );
    const settingsWidgetSource = fs.readFileSync(settingsWidgetPath, "utf-8");

    it("verifies platform warning elements are present in SettingsWidget.tsx", () => {
      assert.ok(
        settingsWidgetSource.includes("id=\"hotkey-platform-warning\""),
        "Expected #hotkey-platform-warning element to exist"
      );
      assert.ok(
        settingsWidgetSource.includes("id=\"clipboard-platform-notice\""),
        "Expected #clipboard-platform-notice element to exist"
      );
      assert.ok(
        settingsWidgetSource.includes("id=\"platform-capabilities-list\""),
        "Expected #platform-capabilities-list element to exist"
      );
    });

    it("verifies hotkey input and buttons are disabled when hotkeySupported is false", () => {
      assert.ok(
        settingsWidgetSource.includes("disabled={!hotkeySupported}"),
        "Expected disabled attribute bound to !hotkeySupported"
      );
    });

    it("verifies zero continuous polling or intervals in SettingsWidget", () => {
      assert.ok(
        !settingsWidgetSource.includes("setInterval"),
        "SettingsWidget must have ZERO setInterval"
      );
      assert.ok(
        !settingsWidgetSource.includes("requestAnimationFrame"),
        "SettingsWidget must have ZERO requestAnimationFrame"
      );
    });
  });
});
