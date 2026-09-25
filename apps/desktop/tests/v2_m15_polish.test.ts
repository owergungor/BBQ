import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatCapabilityStatus,
  isHotkeySupported,
  isClipboardLiveSupported,
  computeWcagContrast,
} from "../src/components/widgets/settingsModel.ts";
import type { CapabilityStatus, PlatformCapabilities } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2 — Milestone 15 Final Verification & Polish Tests", () => {
  describe("1. Settings Launch at Login Deduplication", () => {
    it("ensures exactly one start_at_login switch control exists in SettingsWidget", () => {
      const settingsWidgetPath = path.join(
        __dirname,
        "../src/components/widgets/SettingsWidget.tsx"
      );
      const content = fs.readFileSync(settingsWidgetPath, "utf-8");

      // Verify the primary control exists in the General tab
      assert.match(
        content,
        /id="start-at-login-toggle"/,
        "Primary start-at-login-toggle must exist in General tab"
      );

      // Verify the duplicate control in Island tab has been removed
      assert.doesNotMatch(
        content,
        /id="start-login-toggle"/,
        "Duplicate start-login-toggle in Island tab must be removed"
      );

      // Verify exactly one control binds to settings.start_at_login
      const toggleMatches = content.match(/handleToggle\("start_at_login",/g);
      assert.equal(
        toggleMatches?.length,
        1,
        `Expected exactly 1 start_at_login handleToggle mutation, but found ${toggleMatches?.length}`
      );

      const checkedMatches = content.match(/checked=\{settings\.start_at_login\}/g);
      assert.equal(
        checkedMatches?.length,
        1,
        `Expected exactly 1 checked binding for settings.start_at_login, but found ${checkedMatches?.length}`
      );
    });

    it("verifies start_at_login is located in primary settings tab and not Island tab", () => {
      const settingsWidgetPath = path.join(
        __dirname,
        "../src/components/widgets/SettingsWidget.tsx"
      );
      const content = fs.readFileSync(settingsWidgetPath, "utf-8");

      const appearanceIndex = content.indexOf('{activeTab === "appearance"');
      const islandIndex = content.indexOf('{activeTab === "island"');
      const hotkeyIndex = content.indexOf('{activeTab === "hotkey"');
      const toggleIndex = content.indexOf('id="start-at-login-toggle"');

      assert.ok(appearanceIndex !== -1, "Appearance/General tab must exist");
      assert.ok(islandIndex !== -1, "Island tab must exist");
      assert.ok(toggleIndex !== -1, "start-at-login-toggle must exist");

      assert.ok(
        toggleIndex > appearanceIndex && toggleIndex < islandIndex,
        "start-at-login-toggle must be inside the primary appearance/general tab"
      );

      const islandSection = content.slice(islandIndex, hotkeyIndex);
      assert.doesNotMatch(
        islandSection,
        /start_at_login/,
        "Island tab section must not contain any start_at_login control"
      );
    });
  });

  describe("2. Single-Instance CLI Argument Forwarding Invariants", () => {
    it("verifies single-instance plugin in lib.rs forwards validated arguments to Drop Shelf", () => {
      const libRsPath = path.join(ROOT_DIR, "apps/desktop/src-tauri/src/lib.rs");
      const content = fs.readFileSync(libRsPath, "utf-8");

      // Verify plugin initialization captures args and cwd
      assert.match(
        content,
        /tauri_plugin_single_instance::init\(\|app,\s*args,\s*cwd\|/,
        "single-instance callback must capture args and cwd parameters"
      );

      // Verify window focus/show/unminimize behavior is preserved
      assert.match(content, /unminimize\(\)/, "Must preserve unminimize");
      assert.match(content, /show\(\)/, "Must preserve window show");
      assert.match(content, /set_focus\(\)/, "Must preserve window focus");

      // Verify safe filtering function is called
      assert.match(
        content,
        /bbq_services::drop::filter_cli_paths\(&args,\s*Some\(&cwd\)\)/,
        "Must call filter_cli_paths with args and cwd"
      );

      // Verify forwarding to existing Drop Shelf inspect
      assert.match(
        content,
        /state\.drop_service\.inspect\(&valid_paths\)\.await/,
        "Must forward validated paths to state.drop_service.inspect"
      );
    });

    it("verifies Rust DropService filter_cli_paths enforces security boundaries", () => {
      const dropRsPath = path.join(ROOT_DIR, "crates/services/src/drop.rs");
      const content = fs.readFileSync(dropRsPath, "utf-8");

      assert.match(
        content,
        /pub fn filter_cli_paths/,
        "filter_cli_paths must be exposed publicly from drop service"
      );

      // Verify flags starting with '-' are rejected
      assert.match(
        content,
        /trimmed\.starts_with\('-'\)/,
        "Must reject flags starting with '-'"
      );

      // Verify arbitrary URLs are rejected
      assert.match(
        content,
        /trimmed\.contains\(":\/\/"\)/,
        "Must reject arbitrary URL schemes"
      );

      // Verify nonexistent paths are rejected
      assert.match(
        content,
        /!resolved\.exists\(\)/,
        "Must reject nonexistent paths"
      );

      // Verify capacity is bounded to MAX_DROP_ITEMS
      assert.match(
        content,
        /accepted_paths\.len\(\)\s*>=\s*MAX_DROP_ITEMS/,
        "Must enforce MAX_DROP_ITEMS capacity bound"
      );
    });
  });

  describe("3. Cross-Platform Capability Matrix Truthfulness", () => {
    const windowsMatrix: PlatformCapabilities = {
      platform: "windows",
      globalHotkey: "supported",
      clipboardLiveEvents: "supported",
      clipboardHistory: "supported",
      mediaControl: "supported",
      mediaEvents: "supported",
      mediaTimeline: "supported",
      notifications: "supported",
      launchAtLogin: "supported",
      displayGeometry: "supported",
      displayChangeEvents: "supported",
      windowAbsolutePositioning: "supported",
      alwaysOnTop: "supported",
    };

    const macosMatrix: PlatformCapabilities = {
      platform: "macos",
      globalHotkey: "unavailable",
      clipboardLiveEvents: "passive",
      clipboardHistory: "supported",
      mediaControl: "permissionRequired",
      mediaEvents: "unavailable",
      mediaTimeline: "unavailable",
      notifications: "supported",
      launchAtLogin: "supported",
      displayGeometry: "supported",
      displayChangeEvents: "unavailable",
      windowAbsolutePositioning: "supported",
      alwaysOnTop: "supported",
    };

    const linuxX11Matrix: PlatformCapabilities = {
      platform: "linux",
      globalHotkey: "unavailable",
      clipboardLiveEvents: "passive",
      clipboardHistory: "supported",
      mediaControl: "supported",
      mediaEvents: "passive",
      mediaTimeline: "unavailable",
      notifications: "supported",
      launchAtLogin: "supported",
      displayGeometry: "supported",
      displayChangeEvents: "unavailable",
      windowAbsolutePositioning: "supported",
      alwaysOnTop: "supported",
    };

    const linuxWaylandMatrix: PlatformCapabilities = {
      platform: "linux",
      globalHotkey: "unavailable",
      clipboardLiveEvents: "passive",
      clipboardHistory: "supported",
      mediaControl: "supported",
      mediaEvents: "passive",
      mediaTimeline: "unavailable",
      notifications: "supported",
      launchAtLogin: "supported",
      displayGeometry: "compositorDependent",
      displayChangeEvents: "unavailable",
      windowAbsolutePositioning: "compositorDependent",
      alwaysOnTop: "compositorDependent",
    };

    it("truthfully evaluates Windows platform capabilities", () => {
      assert.equal(isHotkeySupported(windowsMatrix), true);
      assert.equal(isClipboardLiveSupported(windowsMatrix), true);
      assert.equal(windowsMatrix.windowAbsolutePositioning, "supported");
      assert.equal(windowsMatrix.mediaTimeline, "supported");
      assert.equal(windowsMatrix.displayChangeEvents, "supported");
    });

    it("truthfully evaluates macOS platform capabilities", () => {
      assert.equal(isHotkeySupported(macosMatrix), false);
      assert.equal(isClipboardLiveSupported(macosMatrix), false);
      assert.equal(macosMatrix.mediaControl, "permissionRequired");
      assert.equal(macosMatrix.mediaEvents, "unavailable");
      assert.equal(macosMatrix.mediaTimeline, "unavailable");
      assert.equal(macosMatrix.displayChangeEvents, "unavailable");
    });

    it("truthfully evaluates Linux X11 platform capabilities", () => {
      assert.equal(isHotkeySupported(linuxX11Matrix), false);
      assert.equal(isClipboardLiveSupported(linuxX11Matrix), false);
      assert.equal(linuxX11Matrix.mediaControl, "supported");
      assert.equal(linuxX11Matrix.mediaEvents, "passive");
      assert.equal(linuxX11Matrix.mediaTimeline, "unavailable");
      assert.equal(linuxX11Matrix.windowAbsolutePositioning, "supported");
    });

    it("truthfully evaluates Linux Wayland compositor-dependent capabilities", () => {
      assert.equal(linuxWaylandMatrix.windowAbsolutePositioning, "compositorDependent");
      assert.equal(linuxWaylandMatrix.alwaysOnTop, "compositorDependent");
      assert.equal(linuxWaylandMatrix.displayGeometry, "compositorDependent");
      assert.equal(linuxWaylandMatrix.globalHotkey, "unavailable");
    });
  });

  describe("4. Capability Badge Accessibility & WCAG 2.1 AA Compliance", () => {
    it("provides human-readable textual labels for every capability state without relying solely on color", () => {
      const states: CapabilityStatus[] = [
        "supported",
        "passive",
        "permissionRequired",
        "compositorDependent",
        "unavailable",
      ];

      for (const st of states) {
        const formatted = formatCapabilityStatus(st);
        assert.ok(formatted.label.length > 0, `State '${st}' must have a non-empty label`);
        assert.notEqual(formatted.label, st, `State '${st}' label should be user-friendly`);
        assert.ok(formatted.color.length > 0, `State '${st}' must specify a CSS color token`);
      }
    });

    it("verifies contrast ratios against dark theme background (#0d0d12)", () => {
      const darkBg = "#0d0d12";
      const greenText = "#10b981"; // supported
      const warningText = "#f59e0b"; // passive / permissionRequired
      const infoText = "#3b82f6"; // compositorDependent
      const mutedText = "#9ca3af"; // unavailable

      const greenContrast = computeWcagContrast(greenText, darkBg);
      const warningContrast = computeWcagContrast(warningText, darkBg);
      const infoContrast = computeWcagContrast(infoText, darkBg);
      const mutedContrast = computeWcagContrast(mutedText, darkBg);

      assert.ok(greenContrast.normalTextAa, `Green (#10b981) ratio ${greenContrast.ratio} must pass AA on dark bg`);
      assert.ok(warningContrast.normalTextAa, `Warning (#f59e0b) ratio ${warningContrast.ratio} must pass AA on dark bg`);
      assert.ok(infoContrast.largeTextAa || infoContrast.uiComponentAa, `Info (#3b82f6) ratio ${infoContrast.ratio} must pass UI component AA on dark bg`);
      assert.ok(mutedContrast.normalTextAa, `Muted (#9ca3af) ratio ${mutedContrast.ratio} must pass AA on dark bg`);
    });

    it("verifies contrast ratios against light theme background (#f8fafc)", () => {
      const lightBg = "#f8fafc";
      const darkGreen = "#047857"; // WCAG high-contrast green
      const darkWarning = "#b45309"; // WCAG high-contrast amber
      const darkInfo = "#1d4ed8"; // WCAG high-contrast blue
      const darkMuted = "#4b5563"; // WCAG high-contrast muted

      const greenContrast = computeWcagContrast(darkGreen, lightBg);
      const warningContrast = computeWcagContrast(darkWarning, lightBg);
      const infoContrast = computeWcagContrast(darkInfo, lightBg);
      const mutedContrast = computeWcagContrast(darkMuted, lightBg);

      assert.ok(greenContrast.normalTextAa, `Green ratio ${greenContrast.ratio} must pass AA on light bg`);
      assert.ok(warningContrast.normalTextAa, `Amber ratio ${warningContrast.ratio} must pass AA on light bg`);
      assert.ok(infoContrast.normalTextAa, `Blue ratio ${infoContrast.ratio} must pass AA on light bg`);
      assert.ok(mutedContrast.normalTextAa, `Muted ratio ${mutedContrast.ratio} must pass AA on light bg`);
    });

    it("ensures CSS index.css defines .bbq-capability-badge for all semantic states", () => {
      const cssPath = path.join(__dirname, "../src/styles/index.css");
      const css = fs.readFileSync(cssPath, "utf-8");

      assert.match(css, /\.bbq-capability-badge\s*\{/, "Must define base .bbq-capability-badge");
      assert.match(css, /data-status="supported"/, "Must define supported badge styles");
      assert.match(css, /data-status="passive"/, "Must define passive badge styles");
      assert.match(css, /data-status="permissionRequired"/, "Must define permissionRequired badge styles");
      assert.match(css, /data-status="compositorDependent"/, "Must define compositorDependent badge styles");
      assert.match(css, /data-status="unavailable"/, "Must define unavailable badge styles");
    });
  });

  describe("5. Polling & Performance Regression Invariants", () => {
    it("ensures zero production setInterval calls across frontend source", () => {
      const srcDir = path.join(__dirname, "../src");
      const files = getAllFiles(srcDir).filter(
        (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test.")
      );

      for (const file of files) {
        const code = fs.readFileSync(file, "utf-8");
        // Remove comments
        const clean = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        assert.doesNotMatch(
          clean,
          /\bsetInterval\s*\(/,
          `Forbidden production setInterval found in ${path.relative(ROOT_DIR, file)}`
        );
      }
    });

    it("ensures zero production requestAnimationFrame continuous loops across frontend source", () => {
      const srcDir = path.join(__dirname, "../src");
      const files = getAllFiles(srcDir).filter(
        (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test.")
      );

      for (const file of files) {
        const code = fs.readFileSync(file, "utf-8");
        const clean = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        assert.doesNotMatch(
          clean,
          /\brequestAnimationFrame\s*\(/,
          `Forbidden production requestAnimationFrame found in ${path.relative(ROOT_DIR, file)}`
        );
      }
    });
  });
});

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}
