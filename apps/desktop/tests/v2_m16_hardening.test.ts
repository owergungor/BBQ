import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { widgetRegistry } from "../src/island/widgetRegistry.ts";
import {
  sanitizeIndicatorOrder,
  generateSanitizedDiagnostics,
} from "../src/components/widgets/settingsModel.ts";
import type { PlatformCapabilities } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2 — Milestone 16 Production Hardening & GA Polish Tests", () => {
  describe("1. Strict Production Content Security Policy (CSP)", () => {
    it("ensures CSP in tauri.conf.json is non-null and meets strict security standards", () => {
      const confPath = path.join(
        __dirname,
        "../src-tauri/tauri.conf.json"
      );
      const confJson = JSON.parse(fs.readFileSync(confPath, "utf-8"));
      const csp = confJson?.app?.security?.csp;

      assert.ok(csp, "tauri.conf.json app.security.csp must not be null or undefined");
      assert.equal(typeof csp, "string", "CSP must be a configured string");

      // Verify default-src 'self'
      assert.ok(
        csp.includes("default-src 'self'"),
        "CSP must define default-src 'self'"
      );

      // Verify script-src 'self' and no arbitrary remote scripts
      assert.ok(
        csp.includes("script-src 'self'"),
        "CSP must define script-src 'self'"
      );
      assert.ok(
        !csp.includes("http://*") && !csp.includes("https://*") && !csp.includes("script-src *"),
        "CSP must not allow wildcard remote scripts"
      );
      assert.ok(
        !csp.includes("unsafe-eval"),
        "CSP must not allow unsafe-eval"
      );

      // Verify style-src
      assert.ok(
        csp.includes("style-src 'self' 'unsafe-inline'"),
        "CSP must allow 'self' and 'unsafe-inline' styles for dynamic React DOM properties"
      );

      // Verify img-src
      assert.ok(
        csp.includes("img-src 'self' data: asset:"),
        "CSP must allow self, data:, and local asset: protocols for icons and assets"
      );

      // Verify connect-src for Tauri IPC
      assert.ok(
        csp.includes("connect-src 'self' ipc: http://ipc.localhost"),
        "CSP connect-src must allow self and Tauri IPC endpoints"
      );
    });
  });

  describe("2. IPC Modularization & Command Registration Parity", () => {
    it("proves apps/desktop/src-tauri/src/commands modules exist and cover all 69 commands", () => {
      const commandsDir = path.join(__dirname, "../src-tauri/src/commands");
      assert.ok(fs.existsSync(commandsDir), "commands directory must exist");

      const expectedModules = [
        "mod.rs",
        "island.rs",
        "display.rs",
        "settings.rs",
        "media.rs",
        "clipboard.rs",
        "files.rs",
        "drop.rs",
        "system.rs",
        "timer.rs",
        "reminders.rs",
        "launcher.rs",
        "hotkey.rs",
      ];

      for (const modFile of expectedModules) {
        const modPath = path.join(commandsDir, modFile);
        assert.ok(fs.existsSync(modPath), `Module commands/${modFile} must exist`);
      }

      // Check lib.rs handler registrations
      const libRsPath = path.join(__dirname, "../src-tauri/src/lib.rs");
      const libRs = fs.readFileSync(libRsPath, "utf-8");

      assert.ok(libRs.includes("pub mod commands;"), "lib.rs must declare pub mod commands;");
      assert.ok(libRs.includes("use commands::*;"), "lib.rs must import commands::*;");

      const handlerMatch = libRs.match(/tauri::generate_handler!\[([\s\S]*?)\]/);
      assert.ok(handlerMatch, "lib.rs must contain tauri::generate_handler!");

      const commandList = handlerMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("//"));

      assert.equal(
        commandList.length,
        69,
        `Expected exactly 69 commands in generate_handler!, found ${commandList.length}`
      );

      // Sample key commands across domains
      const sampleCommands = [
        "get_island_state",
        "calculate_island_geometry",
        "apply_island_geometry",
        "get_settings",
        "update_setting",
        "media_get_current_session",
        "clipboard_get_history",
        "file_get_workspace",
        "drop_inspect",
        "drop_execute",
        "system_get_state",
        "timer_start_pomodoro",
        "reminder_create",
        "launcher_search",
        "hotkey_get_definition",
        "get_platform_capabilities",
      ];

      for (const cmd of sampleCommands) {
        assert.ok(commandList.includes(cmd), `Command ${cmd} must be in generate_handler!`);
      }
    });
  });

  describe("3. Product Surface Hygiene (Removal of Dead Widgets)", () => {
    it("ensures notes and bookmarks are completely removed from widget registry", () => {
      assert.equal(widgetRegistry.get("notes"), undefined, "notes widget must not be registered");
      assert.equal(widgetRegistry.get("bookmarks"), undefined, "bookmarks widget must not be registered");

      const allWidgetIds = widgetRegistry.getAll().map((w) => w.id);
      assert.ok(!allWidgetIds.includes("notes"), "widgetRegistry.getAll() must not contain notes");
      assert.ok(!allWidgetIds.includes("bookmarks"), "widgetRegistry.getAll() must not contain bookmarks");
    });

    it("ensures sanitizeIndicatorOrder safely migrates legacy order containing notes/bookmarks without crashing", () => {
      const legacyOrder = ["notes", "timer", "bookmarks", "clipboard", "media", "corrupted_id"];
      const availableIds = ["timer", "clipboard", "media", "system", "files"];

      const sanitized = sanitizeIndicatorOrder(legacyOrder, availableIds);

      // 'notes', 'bookmarks', 'corrupted_id' must be dropped
      assert.ok(!sanitized.includes("notes"), "Sanitized order must drop 'notes'");
      assert.ok(!sanitized.includes("bookmarks"), "Sanitized order must drop 'bookmarks'");
      assert.ok(!sanitized.includes("corrupted_id"), "Sanitized order must drop unknown IDs");

      // Valid IDs must retain relative order, and remaining available IDs appended
      assert.deepEqual(sanitized, ["timer", "clipboard", "media", "system", "files"]);
    });
  });

  describe("4. Privacy-Guaranteed Sanitized Diagnostics", () => {
    it("ensures generateSanitizedDiagnostics excludes all sensitive fields, secrets, paths, and usernames", () => {
      const mockSettings = {
        theme: "dark",
        accent_color: "#3b82f6",
        island_width: 320,
        island_height: 44,
        clipboard_enabled: true,
        clipboard_max_entries: 50,
        clipboard_retention_days: 14,
        compact_mode_auto: true,
        always_on_top: true,
        pinned: false,
        onboarding_completed: true,
        disabled_widget_ids: ["network"],
        scale_factor: 1.25,
        // Hypothetical dirty/malicious fields that must NEVER appear in output
        username: "victim_user",
        home_directory: "/home/victim_user",
        secret_token: "ghp_super_secret_token_123456789",
        clipboard_text: "my private password string",
        file_path: "/home/victim_user/Documents/secret_plan.pdf",
        url: "https://intranet.private.company.internal/secret",
      };

      const mockCaps: PlatformCapabilities = {
        platform: "linux",
        globalHotkey: "supported",
        clipboardLiveEvents: "supported",
        clipboardHistory: "supported",
        mediaControl: "supported",
        mediaEvents: "supported",
        notifications: "supported",
        displayChangeEvents: "supported",
        windowAbsolutePositioning: "compositorDependent",
      };

      const diagnostics = generateSanitizedDiagnostics(
        mockSettings as unknown as Parameters<typeof generateSanitizedDiagnostics>[0],
        mockCaps,
        {
          appVersion: "1.2.0",
          displayCount: 2,
          buildMode: "production",
          timestamp: "2026-09-25T12:00:00.000Z",
        }
      );

      const jsonStr = JSON.stringify(diagnostics);

      // Verify strict privacy guarantees
      assert.ok(!jsonStr.includes("victim_user"), "Must NOT contain username");
      assert.ok(!jsonStr.includes("/home/victim_user"), "Must NOT contain home directory");
      assert.ok(!jsonStr.includes("ghp_super_secret_token"), "Must NOT contain secrets or tokens");
      assert.ok(!jsonStr.includes("my private password string"), "Must NOT contain clipboard contents");
      assert.ok(!jsonStr.includes("secret_plan.pdf"), "Must NOT contain document or file paths");
      assert.ok(!jsonStr.includes("https://intranet.private"), "Must NOT contain URLs");

      // Verify allowed safe fields are present
      assert.equal(diagnostics.app.name, "BBQ Desktop");
      assert.equal(diagnostics.app.version, "1.2.0");
      assert.equal(diagnostics.platform.os, "linux");
      assert.equal(diagnostics.platform.displayCount, 2);
      assert.equal(diagnostics.platform.scaleFactor, 1.25);
      assert.equal(diagnostics.storage.schemaVersion, 1);
      assert.equal(diagnostics.storage.type, "SQLite 3");
      assert.equal(diagnostics.storage.mode, "WAL");
      assert.equal(diagnostics.settingsSummary.islandDimensions, "320x44");
      assert.equal(diagnostics.settingsSummary.clipboardMaxEntries, 50);
      assert.equal(diagnostics.capabilities.windowAbsolutePositioning, "compositorDependent");
    });
  });

  describe("5. Accessibility Live Regions", () => {
    it("ensures SettingsWidget contains polite live region for status feedback", () => {
      const widgetPath = path.join(__dirname, "../src/components/widgets/SettingsWidget.tsx");
      const content = fs.readFileSync(widgetPath, "utf-8");

      assert.match(
        content,
        /role="status"[\s\S]*?aria-live="polite"/,
        "SettingsWidget must have role=status and aria-live=polite on status message"
      );
      assert.match(
        content,
        /id="bbq-copy-diagnostics-btn"/,
        "SettingsWidget must have copy diagnostics button"
      );
    });

    it("ensures FileWorkspaceWidget contains polite live region for status feedback", () => {
      const widgetPath = path.join(__dirname, "../src/components/widgets/FileWorkspaceWidget.tsx");
      const content = fs.readFileSync(widgetPath, "utf-8");

      assert.match(
        content,
        /role="status"[\s\S]*?aria-live="polite"/,
        "FileWorkspaceWidget must have role=status and aria-live=polite on status message"
      );
    });

    it("ensures ClipboardWidget contains polite live region for copy confirmation", () => {
      const widgetPath = path.join(__dirname, "../src/components/widgets/ClipboardWidget.tsx");
      const content = fs.readFileSync(widgetPath, "utf-8");

      assert.match(
        content,
        /role="status"[\s\S]*?aria-live="polite"/,
        "ClipboardWidget must have role=status and aria-live=polite for copy confirmation"
      );
    });

    it("ensures TimerWidget contains polite live region for timer completion", () => {
      const widgetPath = path.join(__dirname, "../src/components/widgets/TimerWidget.tsx");
      const content = fs.readFileSync(widgetPath, "utf-8");

      assert.match(
        content,
        /aria-live="polite"/,
        "TimerWidget centerpiece must have aria-live=polite"
      );
      assert.match(
        content,
        /Timer completed/,
        "TimerWidget must have polite announcement for completed timer"
      );
    });
  });

  describe("6. Baseline Audit Fixes Verification", () => {
    it("F-01: Island.tsx handles async unmount race safely", () => {
      const islandPath = path.join(__dirname, "../src/components/island/Island.tsx");
      const content = fs.readFileSync(islandPath, "utf-8");

      assert.match(
        content,
        /let isMounted = true;/,
        "Island.tsx must track isMounted flag"
      );
      assert.match(
        content,
        /if \(!isMounted\) return;/,
        "Island.tsx must guard after async islandRuntime.init()"
      );
      assert.match(
        content,
        /registerCleanup\s*=\s*\(fn:\s*\(\)\s*=>\s*void\)\s*=>\s*\{[\s\S]*?if \(!isMounted\)\s*\{\s*fn\(\);/,
        "Island.tsx must immediately call cleanup fn if already unmounted"
      );
    });

    it("F-02: windows.rs removes unsafe expect from clipboard thread spawn", () => {
      const winPath = path.join(ROOT_DIR, "crates/platform/src/windows.rs");
      const content = fs.readFileSync(winPath, "utf-8");

      assert.doesNotMatch(
        content,
        /\.expect\("Failed to spawn clipboard listener thread"\)/,
        "windows.rs must not contain .expect() for clipboard listener spawn"
      );
      assert.match(
        content,
        /Failed to spawn Windows clipboard listener thread/,
        "windows.rs must map thread spawn error into BbqError::Platform"
      );
    });

    it("F-05 & F-06: statusTimerRef cleans up timeout on unmount", () => {
      const fileWidgetPath = path.join(__dirname, "../src/components/widgets/FileWorkspaceWidget.tsx");
      const settingsWidgetPath = path.join(__dirname, "../src/components/widgets/SettingsWidget.tsx");

      const fileContent = fs.readFileSync(fileWidgetPath, "utf-8");
      const settingsContent = fs.readFileSync(settingsWidgetPath, "utf-8");

      assert.match(
        fileContent,
        /const statusTimerRef = useRef<ReturnType<typeof setTimeout> \| null>\(null\);/,
        "FileWorkspaceWidget must store statusTimerRef"
      );
      assert.match(
        fileContent,
        /clearTimeout\(statusTimerRef\.current\);/,
        "FileWorkspaceWidget must clearTimeout on unmount"
      );

      assert.match(
        settingsContent,
        /const statusTimerRef = useRef<ReturnType<typeof setTimeout> \| null>\(null\);/,
        "SettingsWidget must store statusTimerRef"
      );
      assert.match(
        settingsContent,
        /clearTimeout\(statusTimerRef\.current\);/,
        "SettingsWidget must clearTimeout on unmount"
      );
    });
  });
});
