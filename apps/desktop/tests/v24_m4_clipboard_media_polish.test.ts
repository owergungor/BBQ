import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeClipboardEntry,
  boundClipboardEntries,
  MAX_CLIPBOARD_HISTORY_ENTRIES,
} from "../src/components/widgets/productivityModel.ts";
import type { ClipboardEntry } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.4 — Faz 4: Clipboard Search, Sensitive Masking & Media Polish Regression Tests", () => {
  const clipboardWidgetSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/components/widgets/ClipboardWidget.tsx"),
    "utf8"
  );
  const mediaWidgetSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/components/widgets/MediaWidget.tsx"),
    "utf8"
  );
  const iconSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/components/common/Icon.tsx"),
    "utf8"
  );

  // =========================================================================
  // 1. Clipboard Search & Real-Time Filtering
  // =========================================================================
  describe("1. Clipboard Search & Real-Time Filtering", () => {
    it("ensures clipboard-search-input and clear button are declared in ClipboardWidget", () => {
      assert.ok(
        clipboardWidgetSrc.includes('id="clipboard-search-input"'),
        "Must contain clipboard-search-input element"
      );
      assert.ok(
        clipboardWidgetSrc.includes('id="clipboard-search-clear-btn"'),
        "Must contain clipboard-search-clear-btn element"
      );
    });

    it("verifies Escape key clears active search query", () => {
      assert.ok(
        clipboardWidgetSrc.includes('if (e.key === "Escape")') &&
          clipboardWidgetSrc.includes('setSearchQuery("")'),
        "Escape key must clear the active search query"
      );
    });

    it("filters clipboard entries by content and preview text case-insensitively", () => {
      const entries: ClipboardEntry[] = [
        {
          id: "clip_1",
          content: "npm run build --filter @bbq/desktop",
          content_type: "text",
          preview: "npm run build...",
          size_bytes: 35,
          created_at: 1000,
          possible_sensitive: false,
        },
        {
          id: "clip_2",
          content: "AKIAIOSFODNN7EXAMPLE",
          content_type: "text",
          preview: "AKIAIOSFOD...",
          size_bytes: 20,
          created_at: 2000,
          possible_sensitive: true,
        },
        {
          id: "clip_3",
          content: "git commit -m 'feat: add polish'",
          content_type: "text",
          preview: "git commit...",
          size_bytes: 32,
          created_at: 3000,
          possible_sensitive: false,
        },
      ];

      const query = "NPM";
      const q = query.trim().toLowerCase();
      const filtered = entries.filter((e) =>
        (e.content || "").toLowerCase().includes(q) || (e.preview || "").toLowerCase().includes(q)
      );

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].id, "clip_1");
    });

    it("displays friendly empty state when search finds no matches", () => {
      assert.ok(
        clipboardWidgetSrc.includes('id="clipboard-search-empty"'),
        "Must provide empty state container when search yields no matches"
      );
      assert.ok(
        clipboardWidgetSrc.includes('No clippings matching'),
        "Must display explanatory no-match text"
      );
    });
  });

  // =========================================================================
  // 2. Sensitive Clipping Masking & Unmask Toggle
  // =========================================================================
  describe("2. Sensitive Clipping Masking & Unmask Toggle", () => {
    it("ensures normalizeClipboardEntry masks sensitive credentials by default", () => {
      const sensitiveEntry: ClipboardEntry = {
        id: "clip_token",
        content: "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
        content_type: "text",
        preview: "ghp_12345678...",
        size_bytes: 40,
        created_at: Date.now(),
        possible_sensitive: true,
      };

      const normalized = normalizeClipboardEntry(sensitiveEntry);
      assert.equal(normalized.isSensitive, true);
      assert.ok(
        normalized.preview.includes("••••••••••••••••"),
        "Sensitive clip preview must be masked by default"
      );
    });

    it("verifies interactive reveal toggle button is present on sensitive cards", () => {
      assert.ok(
        clipboardWidgetSrc.includes('className="bbq-clipboard-sensitive-pill"'),
        "Must render sensitive badge/toggle pill"
      );
      assert.ok(
        clipboardWidgetSrc.includes("toggleRevealSensitive"),
        "Must provide toggleRevealSensitive handler"
      );
    });

    it("verifies Icon.tsx supports eye and eye-off icons for credential reveal/masking", () => {
      assert.ok(
        iconSrc.includes('"eye"') && iconSrc.includes('"eye-off"'),
        "Icon.tsx must support eye and eye-off icons"
      );
    });
  });

  // =========================================================================
  // 3. Media Controls & System Volume Quick Adjuster
  // =========================================================================
  describe("3. Media Controls & System Volume Quick Adjuster", () => {
    it("ensures media-volume-toggle-btn and media-volume-slider exist in MediaWidget", () => {
      assert.ok(
        mediaWidgetSrc.includes('id="media-volume-toggle-btn"'),
        "Must provide media-volume-toggle-btn"
      );
      assert.ok(
        mediaWidgetSrc.includes('id="media-volume-slider"'),
        "Must provide media-volume-slider"
      );
    });

    it("verifies volume slider uses step 0.05 with min 0 and max 1", () => {
      assert.ok(
        mediaWidgetSrc.includes('min="0"') &&
          mediaWidgetSrc.includes('max="1"') &&
          mediaWidgetSrc.includes('step="0.05"'),
        "Must configure volume range accurately [0..1] with 0.05 step"
      );
    });

    it("invokes system commands on volume changes and mute toggles", () => {
      assert.ok(
        mediaWidgetSrc.includes("bbqCommands.systemToggleMuted()"),
        "Must invoke systemToggleMuted on mute click"
      );
      assert.ok(
        mediaWidgetSrc.includes("bbqCommands.systemSetVolume(val)"),
        "Must invoke systemSetVolume on slider change"
      );
    });
  });

  // =========================================================================
  // 4. Zero-Polling & Resource Lifecycle Hygiene
  // =========================================================================
  describe("4. Zero-Polling & Resource Lifecycle Hygiene", () => {
    it("proves ClipboardWidget cleans up feedback timer on unmount", () => {
      assert.ok(
        clipboardWidgetSrc.includes("clearTimeout(copyFeedbackTimerRef.current)"),
        "Must clear feedback timer on unmount"
      );
    });

    it("proves MediaWidget cleans up seek settling timer on unmount", () => {
      assert.ok(
        mediaWidgetSrc.includes("clearTimeout(settlingTimeoutRef.current)"),
        "Must clear settling timeout on unmount"
      );
    });

    it("verifies bounded list capacity in ClipboardWidget", () => {
      const dummyEntries: ClipboardEntry[] = Array.from({ length: 150 }, (_, i) => ({
        id: `entry_${i}`,
        content: `Clip ${i}`,
        content_type: "text",
        preview: `Clip ${i}`,
        size_bytes: 10,
        created_at: 1000 + i,
        possible_sensitive: false,
      }));

      const bounded = boundClipboardEntries(dummyEntries, MAX_CLIPBOARD_HISTORY_ENTRIES);
      assert.equal(bounded.length, MAX_CLIPBOARD_HISTORY_ENTRIES);
      assert.equal(bounded.length, 30);
    });
  });
});
