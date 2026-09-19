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
  computeWcagContrast,
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

    it("maps passive status to on-demand warning color token", () => {
      const result = formatCapabilityStatus("passive");
      assert.equal(result.label, "Passive / On-Demand");
      assert.match(result.color, /warning/i);
    });

    it("maps permissionRequired status to truthful label and warning color token", () => {
      const result = formatCapabilityStatus("permissionRequired");
      assert.equal(result.label, "Permission Required");
      assert.match(result.color, /warning/i);
    });

    it("maps compositorDependent status to informational color token", () => {
      const result = formatCapabilityStatus("compositorDependent");
      assert.equal(result.label, "Compositor Dependent");
      assert.match(result.color, /info/i);
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

  describe("6. Light-Theme Capability Badge Contrast & WCAG 2.1 AA Compliance", () => {
    const indexCssPath = path.resolve(__dirname, "../src/styles/index.css");
    const indexCss = fs.readFileSync(indexCssPath, "utf-8");
    const settingsWidgetPath = path.resolve(
      __dirname,
      "../src/components/widgets/SettingsWidget.tsx"
    );
    const settingsWidgetSource = fs.readFileSync(settingsWidgetPath, "utf-8");

    it("ensures Light Theme status tokens meet WCAG 2.1 AA >= 4.5:1 against #ffffff", () => {
      // Tokens defined for light theme:
      // --bbq-success: #047857
      // --bbq-warning: #92400e
      // --bbq-info: #1d4ed8
      // --bbq-danger: #b91c1c
      // --bbq-text-muted: #64748b
      const successContrast = computeWcagContrast("#047857", "#ffffff");
      assert.ok(
        successContrast.normalTextAa,
        `Success token #047857 must satisfy WCAG AA (got ${successContrast.ratio}:1)`
      );
      assert.ok(successContrast.ratio >= 4.5);

      const warningContrast = computeWcagContrast("#92400e", "#ffffff");
      assert.ok(
        warningContrast.normalTextAa,
        `Warning token #92400e must satisfy WCAG AA (got ${warningContrast.ratio}:1)`
      );
      assert.ok(warningContrast.ratio >= 4.5);

      const infoContrast = computeWcagContrast("#1d4ed8", "#ffffff");
      assert.ok(
        infoContrast.normalTextAa,
        `Info token #1d4ed8 must satisfy WCAG AA (got ${infoContrast.ratio}:1)`
      );
      assert.ok(infoContrast.ratio >= 4.5);

      const dangerContrast = computeWcagContrast("#b91c1c", "#ffffff");
      assert.ok(
        dangerContrast.normalTextAa,
        `Danger token #b91c1c must satisfy WCAG AA (got ${dangerContrast.ratio}:1)`
      );
      assert.ok(dangerContrast.ratio >= 4.5);

      const mutedContrast = computeWcagContrast("#64748b", "#ffffff");
      assert.ok(
        mutedContrast.normalTextAa,
        `Muted token #64748b must satisfy WCAG AA (got ${mutedContrast.ratio}:1)`
      );
      assert.ok(mutedContrast.ratio >= 4.5);
    });

    it("ensures index.css defines high-contrast tokens in light theme selectors", () => {
      assert.match(
        indexCss,
        /\[data-theme="light"\][\s\S]*?--bbq-success:\s*#047857/,
        "Light theme must define high-contrast --bbq-success"
      );
      assert.match(
        indexCss,
        /\[data-theme="light"\][\s\S]*?--bbq-warning:\s*#92400e/,
        "Light theme must define high-contrast --bbq-warning"
      );
      assert.match(
        indexCss,
        /\[data-theme="light"\][\s\S]*?--bbq-info:\s*#1d4ed8/,
        "Light theme must define high-contrast --bbq-info"
      );
    });

    it("ensures .bbq-capability-badge is styled cleanly without drop-shadow/glow", () => {
      assert.ok(
        indexCss.includes(".bbq-capability-badge"),
        "Expected .bbq-capability-badge CSS rule in index.css"
      );
      const badgeCssMatch = indexCss.match(/\.bbq-capability-badge[\s\S]*?\.bbq-capability-badge\[data-status="unavailable"\][\s\S]*?\}/);
      assert.ok(badgeCssMatch, "Expected complete capability badge CSS definitions");
      assert.doesNotMatch(
        badgeCssMatch[0],
        /drop-shadow/,
        "Capability badge CSS must not contain drop-shadow"
      );
    });

    it("verifies SettingsWidget renders capability status using .bbq-capability-badge and data-status", () => {
      assert.ok(
        settingsWidgetSource.includes("className=\"bbq-capability-badge\""),
        "SettingsWidget must use .bbq-capability-badge class"
      );
      assert.ok(
        settingsWidgetSource.includes("data-status={status}"),
        "SettingsWidget must bind data-status attribute for CSS theme selectors"
      );
    });
  });
});

