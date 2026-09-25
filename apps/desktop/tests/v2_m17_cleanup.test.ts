import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { widgetRegistry } from "../src/island/widgetRegistry.ts";
import {
  ACTIVE_HUD_WIDGET_IDS,
  sanitizeIndicatorOrder,
  generateSanitizedDiagnostics,
} from "../src/components/widgets/settingsModel.ts";
import type { PlatformCapabilities } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2 — Milestone 17 GA Polish & Dead Surface Cleanup Tests", () => {
  describe("1. ARC-01: Widget Registry & Network Cleanup", () => {
    it("ensures 'network' is not registered as an active or declared-only widget", () => {
      assert.equal(
        widgetRegistry.get("network"),
        undefined,
        "'network' widget must not be retrievable from widgetRegistry"
      );

      const allWidgets = widgetRegistry.getAll();
      const allIds = allWidgets.map((w) => w.id);
      assert.ok(
        !allIds.includes("network"),
        `widgetRegistry.getAll() must not contain 'network' (found: ${allIds.join(", ")})`
      );
    });

    it("verifies canonical ACTIVE_HUD_WIDGET_IDS contains exactly the 9 expected active widgets", () => {
      const expected = [
        "drop",
        "files",
        "clipboard",
        "media",
        "system",
        "launcher",
        "timer",
        "reminder",
        "settings",
      ];

      assert.equal(ACTIVE_HUD_WIDGET_IDS.length, 9, "Active HUD widgets count must be exactly 9");
      assert.deepEqual(
        [...ACTIVE_HUD_WIDGET_IDS],
        expected,
        "ACTIVE_HUD_WIDGET_IDS must match expected HUD widget order and IDs"
      );
    });

    it("ensures sanitizeIndicatorOrder safely strips stale persisted 'network' ID without breaking active widgets", () => {
      const stalePersistedOrder = [
        "network",
        "settings",
        "media",
        "network",
        "clipboard",
        "system",
      ];
      const available = [...ACTIVE_HUD_WIDGET_IDS];

      const cleaned = sanitizeIndicatorOrder(stalePersistedOrder, available);

      assert.ok(!cleaned.includes("network"), "Cleaned order must never contain 'network'");
      assert.equal(cleaned.length, 9, "Cleaned order must contain all 9 active HUD widgets");
      assert.equal(cleaned[0], "settings", "First retained widget must be 'settings'");
      assert.equal(cleaned[1], "media", "Second retained widget must be 'media'");
      assert.equal(cleaned[2], "clipboard", "Third retained widget must be 'clipboard'");
      assert.equal(cleaned[3], "system", "Fourth retained widget must be 'system'");
    });
  });

  describe("2. ARC-01: Truthful Diagnostics Active Widget Count & Privacy", () => {
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

    it("truthfully reports activeWidgetsCount === 9 when no widgets are disabled", () => {
      const settings = {
        theme: "dark",
        disabled_widgets: [],
        disabled_widget_ids: [],
      };

      const diagnostics = generateSanitizedDiagnostics(settings, mockCaps);
      assert.equal(
        diagnostics.settingsSummary.activeWidgetsCount,
        9,
        "activeWidgetsCount must be 9 when no widgets are disabled"
      );
    });

    it("truthfully reduces activeWidgetsCount when active widgets are disabled", () => {
      const settingsOneDisabled = {
        theme: "dark",
        disabled_widget_ids: ["timer"],
      };

      const diag1 = generateSanitizedDiagnostics(settingsOneDisabled, mockCaps);
      assert.equal(
        diag1.settingsSummary.activeWidgetsCount,
        8,
        "activeWidgetsCount must be 8 when one widget is disabled"
      );

      const settingsTwoDisabled = {
        theme: "dark",
        disabled_widgets: ["timer", "reminder"],
      };

      const diag2 = generateSanitizedDiagnostics(settingsTwoDisabled, mockCaps);
      assert.equal(
        diag2.settingsSummary.activeWidgetsCount,
        7,
        "activeWidgetsCount must be 7 when two widgets are disabled"
      );
    });

    it("safely ignores stale 'network' ID in disabled_widgets without inflating or reducing activeWidgetsCount", () => {
      const settingsWithStaleNetwork = {
        theme: "dark",
        disabled_widget_ids: ["network"],
      };

      const diagnostics = generateSanitizedDiagnostics(settingsWithStaleNetwork, mockCaps);
      assert.equal(
        diagnostics.settingsSummary.activeWidgetsCount,
        9,
        "activeWidgetsCount must remain 9 because 'network' is not an active HUD widget"
      );
    });

    it("strictly preserves M16 privacy guarantees in diagnostic output", () => {
      const dirtySettings = {
        theme: "dark",
        username: "victim_alice",
        home_directory: "/Users/victim_alice",
        secret_token: "sk-proj-supersecret1234567890",
        clipboard_payload: "Confidential credentials",
        file_path: "/home/victim_alice/private_keys/id_rsa",
        url: "https://intranet.secure.company.internal",
      };

      const diagnostics = generateSanitizedDiagnostics(
        dirtySettings as unknown as Parameters<typeof generateSanitizedDiagnostics>[0],
        mockCaps
      );
      const jsonStr = JSON.stringify(diagnostics);

      assert.ok(!jsonStr.includes("victim_alice"), "Diagnostics must not expose username");
      assert.ok(!jsonStr.includes("sk-proj-supersecret"), "Diagnostics must not expose secrets");
      assert.ok(!jsonStr.includes("Confidential credentials"), "Diagnostics must not expose clipboard payload");
      assert.ok(!jsonStr.includes("private_keys"), "Diagnostics must not expose file paths");
      assert.ok(!jsonStr.includes("https://intranet"), "Diagnostics must not expose URLs");
    });
  });

  describe("3. ARC-02: Rust NotesService & BookmarkService Dead Surface Deletion", () => {
    it("ensures NotesService and BookmarkService are completely absent from crates/services/src/lib.rs", () => {
      const libRsPath = path.join(ROOT_DIR, "crates/services/src/lib.rs");
      const content = fs.readFileSync(libRsPath, "utf-8");

      assert.doesNotMatch(content, /NotesService/, "crates/services/src/lib.rs must not contain NotesService");
      assert.doesNotMatch(content, /BookmarkService/, "crates/services/src/lib.rs must not contain BookmarkService");
      assert.doesNotMatch(content, /pub mod notes;/, "crates/services/src/lib.rs must not declare pub mod notes");
      assert.doesNotMatch(content, /pub mod bookmark;/, "crates/services/src/lib.rs must not declare pub mod bookmark");
    });

    it("ensures NotesService and BookmarkService are absent from apps/desktop/src-tauri/src/lib.rs", () => {
      const tauriLibPath = path.join(ROOT_DIR, "apps/desktop/src-tauri/src/lib.rs");
      const content = fs.readFileSync(tauriLibPath, "utf-8");

      assert.doesNotMatch(content, /notes_service/, "src-tauri/src/lib.rs must not contain notes_service");
      assert.doesNotMatch(content, /bookmark_service/, "src-tauri/src/lib.rs must not contain bookmark_service");
      assert.doesNotMatch(content, /NotesService/, "src-tauri/src/lib.rs must not contain NotesService");
      assert.doesNotMatch(content, /BookmarkService/, "src-tauri/src/lib.rs must not contain BookmarkService");
    });

    it("ensures crates/services/src/notes.rs and crates/services/src/bookmark.rs files do not exist", () => {
      const notesPath = path.join(ROOT_DIR, "crates/services/src/notes.rs");
      const bookmarkPath = path.join(ROOT_DIR, "crates/services/src/bookmark.rs");

      assert.ok(!fs.existsSync(notesPath), "crates/services/src/notes.rs must be deleted");
      assert.ok(!fs.existsSync(bookmarkPath), "crates/services/src/bookmark.rs must be deleted");
    });
  });
});
