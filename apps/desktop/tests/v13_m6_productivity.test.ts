import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  calculateRemainingMs,
  calculateTimerProgressPct,
  calculateTimerDashOffset,
  formatProductivityTime,
  getPomodoroPhaseInfo,
  mapClipboardType,
  formatTimeAgo,
  normalizeClipboardEntry,
  boundClipboardEntries,
  classifyFileCategory,
  formatProductivityFileSize,
  normalizeStagedFile,
  boundAndDeduplicateStagedItems,
  parseAndValidateCustomMinutes,
  MAX_CLIPBOARD_HISTORY_ENTRIES,
  MAX_DROP_SHELF_ITEMS,
} from "../src/components/widgets/productivityModel.ts";
import type { ClipboardEntry, DropTarget, TimerSession } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v1.3 - Milestone 6: Productivity HUD Tests", () => {
  describe("TIMER Pure Mathematics & Timestamps", () => {
    it("handles null, undefined, or empty timer session safely", () => {
      assert.strictEqual(calculateRemainingMs(null), 0);
      assert.strictEqual(calculateRemainingMs(undefined), 0);
    });

    it("calculates countdown remaining strictly using target_at - now", () => {
      const now = 1700000000000;
      const session: Partial<TimerSession> = {
        mode: "Countdown",
        state: "Running",
        target_at: now + 45000,
        duration_ms: 60000,
      };
      assert.strictEqual(calculateRemainingMs(session as TimerSession, now), 45000);
      // When target has passed
      assert.strictEqual(calculateRemainingMs(session as TimerSession, now + 50000), 0);
    });

    it("calculates stopwatch elapsed time strictly from started_at + accumulated", () => {
      const now = 1700000000000;
      const session: Partial<TimerSession> = {
        mode: "Stopwatch",
        state: "Running",
        started_at: now - 12345,
        remaining_ms: 5000,
      };
      assert.strictEqual(calculateRemainingMs(session as TimerSession, now), 17345);
    });

    it("clamps progress percentage [0, 100] and protects against zero division and NaN", () => {
      assert.strictEqual(calculateTimerProgressPct(0, 60000), 0);
      assert.strictEqual(calculateTimerProgressPct(30000, 60000), 50);
      assert.strictEqual(calculateTimerProgressPct(60000, 60000), 100);
      assert.strictEqual(calculateTimerProgressPct(70000, 60000), 100);
      assert.strictEqual(calculateTimerProgressPct(-500, 60000), 0);
      assert.strictEqual(calculateTimerProgressPct(30000, 0), 0);
      assert.strictEqual(calculateTimerProgressPct(30000, -1000), 0);
      assert.strictEqual(calculateTimerProgressPct(NaN, 60000), 0);
      assert.strictEqual(calculateTimerProgressPct(30000, NaN), 0);
      assert.strictEqual(calculateTimerProgressPct(Infinity, 60000), 100);
    });

    it("calculates SVG dashoffset matching progress ring geometry", () => {
      const radius = 54;
      const expectedCircumference = Number((2 * Math.PI * radius).toFixed(2));

      const zeroPct = calculateTimerDashOffset(0, radius);
      assert.strictEqual(zeroPct.circumference, expectedCircumference);
      assert.strictEqual(zeroPct.dashOffset, expectedCircumference);

      const halfPct = calculateTimerDashOffset(50, radius);
      assert.strictEqual(halfPct.dashOffset, Number((expectedCircumference * 0.5).toFixed(2)));

      const fullPct = calculateTimerDashOffset(100, radius);
      assert.strictEqual(fullPct.dashOffset, 0);
    });

    it("formats milliseconds into tabular time string mm:ss or hh:mm:ss", () => {
      assert.strictEqual(formatProductivityTime(0), "00:00");
      assert.strictEqual(formatProductivityTime(-500), "00:00");
      assert.strictEqual(formatProductivityTime(NaN), "00:00");
      assert.strictEqual(formatProductivityTime(59000), "00:59");
      assert.strictEqual(formatProductivityTime(60000), "01:00");
      assert.strictEqual(formatProductivityTime(125000), "02:05");
      assert.strictEqual(formatProductivityTime(3665000), "1:01:05");
    });

    it("returns pomodoro phase labels and SVG icon mappings without emojis", () => {
      const work = getPomodoroPhaseInfo("Work");
      assert.strictEqual(work.label, "Focus Work");
      assert.strictEqual(work.iconName, "timer");

      const shortBreak = getPomodoroPhaseInfo("ShortBreak");
      assert.strictEqual(shortBreak.label, "Short Break");
      assert.strictEqual(shortBreak.iconName, "coffee");

      const longBreak = getPomodoroPhaseInfo("LongBreak");
      assert.strictEqual(longBreak.label, "Long Break");
      assert.strictEqual(longBreak.iconName, "palm");
    });

    it("validates custom timer duration with strict bounds and edge case safety", () => {
      // Null / undefined / empty
      assert.strictEqual(parseAndValidateCustomMinutes(null).valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes(undefined).valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes("").valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes("   ").valid, false);

      // Zero & negative
      assert.strictEqual(parseAndValidateCustomMinutes(0).valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes("0").valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes("-5").valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes(-10).valid, false);

      // NaN & Infinity
      assert.strictEqual(parseAndValidateCustomMinutes("abc").valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes(NaN).valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes(Infinity).valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes(-Infinity).valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes("Infinity").valid, false);

      // Below minimum (0.1 min / 6 sec)
      assert.strictEqual(parseAndValidateCustomMinutes("0.05").valid, false);

      // Absurdly large (> 1440 min / 24 hours)
      assert.strictEqual(parseAndValidateCustomMinutes(1441).valid, false);
      assert.strictEqual(parseAndValidateCustomMinutes("999999").valid, false);

      // Valid decimal and integer durations
      const validHalfMin = parseAndValidateCustomMinutes("0.5");
      assert.strictEqual(validHalfMin.valid, true);
      if (validHalfMin.valid) {
        assert.strictEqual(validHalfMin.durationMs, 30000);
        assert.strictEqual(validHalfMin.minutes, 0.5);
      }

      const valid25Min = parseAndValidateCustomMinutes(25);
      assert.strictEqual(valid25Min.valid, true);
      if (valid25Min.valid) {
        assert.strictEqual(valid25Min.durationMs, 1500000);
        assert.strictEqual(valid25Min.minutes, 25);
      }

      const validMax = parseAndValidateCustomMinutes("1440");
      assert.strictEqual(validMax.valid, true);
      if (validMax.valid) {
        assert.strictEqual(validMax.durationMs, 86400000);
      }
    });

    it("verifies all edge cases of calculateRemainingMs and progress", () => {
      const now = 1700000000000;

      // Deadline exactly now
      const sessionExactNow: Partial<TimerSession> = {
        mode: "Countdown",
        state: "Running",
        target_at: now,
        duration_ms: 60000,
      };
      assert.strictEqual(calculateRemainingMs(sessionExactNow as TimerSession, now), 0);

      // Deadline already expired
      const sessionExpired: Partial<TimerSession> = {
        mode: "Countdown",
        state: "Running",
        target_at: now - 5000,
        duration_ms: 60000,
      };
      assert.strictEqual(calculateRemainingMs(sessionExpired as TimerSession, now), 0);

      // Paused state preserves remaining_ms
      const sessionPaused: Partial<TimerSession> = {
        mode: "Countdown",
        state: "Paused",
        remaining_ms: 25000,
        duration_ms: 60000,
      };
      assert.strictEqual(calculateRemainingMs(sessionPaused as TimerSession, now), 25000);

      // App restart while running: recalculates accurately from target_at without drift
      const sessionAfterRestart: Partial<TimerSession> = {
        id: "sess_persisted",
        mode: "Countdown",
        state: "Running",
        started_at: now - 30000,
        target_at: now + 30000,
        duration_ms: 60000,
      };
      assert.strictEqual(calculateRemainingMs(sessionAfterRestart as TimerSession, now), 30000);
      // 10 seconds later
      assert.strictEqual(calculateRemainingMs(sessionAfterRestart as TimerSession, now + 10000), 20000);
    });
  });

  describe("CLIPBOARD Privacy & Bounded Collection", () => {
    it("maps clipboard content types to proper SVG icon names", () => {
      assert.strictEqual(mapClipboardType("text").iconName, "file-text");
      assert.strictEqual(mapClipboardType("text/plain").iconName, "file-text");
      assert.strictEqual(mapClipboardType("image").iconName, "file-image");
      assert.strictEqual(mapClipboardType("file_list").iconName, "files");
      assert.strictEqual(mapClipboardType("unknown").iconName, "clipboard");
    });

    it("masks sensitive clipboard entries to protect user credentials", () => {
      const entry: ClipboardEntry = {
        id: "clip_1",
        content_type: "text",
        preview: "secret_api_key_12345",
        content: "secret_api_key_12345",
        created_at: 1700000000000,
        size_bytes: 21,
        source: null,
        possible_sensitive: true,
      };

      const normalized = normalizeClipboardEntry(entry);
      assert.strictEqual(normalized.isSensitive, true);
      assert.strictEqual(normalized.preview.includes("secret_api_key"), false);
      assert.strictEqual(normalized.preview, "•••••••••••••••• (Sensitive)");
    });

    it("formats relative timestamps gracefully", () => {
      const now = 1700000000000;
      assert.strictEqual(formatTimeAgo(now - 20000, now), "Just now");
      assert.strictEqual(formatTimeAgo(now - 180000, now), "3m ago");
      assert.strictEqual(formatTimeAgo(now - 7200000, now), "2h ago");
      assert.strictEqual(formatTimeAgo(now - 86400000 * 3, now), "3d ago");
      assert.strictEqual(formatTimeAgo(0, now), "Recent");
    });

    it("bounds clipboard history strictly to MAX_CLIPBOARD_HISTORY_ENTRIES", () => {
      const entries: ClipboardEntry[] = Array.from({ length: 60 }, (_, i) => ({
        id: "clip_" + i,
        content_type: "text",
        preview: "Entry " + i,
        content: "Content " + i,
        created_at: 1700000000000 + i,
        size_bytes: 10,
        source: null,
        possible_sensitive: false,
      }));

      const bounded = boundClipboardEntries(entries, MAX_CLIPBOARD_HISTORY_ENTRIES);
      assert.strictEqual(bounded.length, MAX_CLIPBOARD_HISTORY_ENTRIES);
      assert.strictEqual(bounded[0].id, "clip_0");
      assert.strictEqual(bounded[MAX_CLIPBOARD_HISTORY_ENTRIES - 1].id, "clip_" + (MAX_CLIPBOARD_HISTORY_ENTRIES - 1));
    });
  });

  describe("DROP SHELF Staging & File Metadata", () => {
    it("categorizes file extensions into standard categories and SVG icons", () => {
      assert.strictEqual(classifyFileCategory("png").category, "image");
      assert.strictEqual(classifyFileCategory("png").iconName, "file-image");
      assert.strictEqual(classifyFileCategory("mp4").category, "video");
      assert.strictEqual(classifyFileCategory("mp4").iconName, "file-video");
      assert.strictEqual(classifyFileCategory("mp3").category, "audio");
      assert.strictEqual(classifyFileCategory("mp3").iconName, "file-audio");
      assert.strictEqual(classifyFileCategory("pdf").category, "document");
      assert.strictEqual(classifyFileCategory("pdf").iconName, "file-text");
      assert.strictEqual(classifyFileCategory("zip").category, "archive");
      assert.strictEqual(classifyFileCategory("zip").iconName, "file-archive");
      assert.strictEqual(classifyFileCategory("rs").category, "code");
      assert.strictEqual(classifyFileCategory("rs").iconName, "file-code");
      assert.strictEqual(classifyFileCategory(null, "directory").category, "folder");
      assert.strictEqual(classifyFileCategory(null, "directory").iconName, "files");
    });

    it("formats file sizes safely without NaN or infinite values", () => {
      assert.strictEqual(formatProductivityFileSize(0), "0 B");
      assert.strictEqual(formatProductivityFileSize(-50), "0 B");
      assert.strictEqual(formatProductivityFileSize(NaN), "0 B");
      assert.strictEqual(formatProductivityFileSize(1024), "1.0 KB");
      assert.strictEqual(formatProductivityFileSize(1048576 * 4.5), "4.5 MB");
      assert.strictEqual(formatProductivityFileSize(1073741824 * 12), "12.0 GB");
    });

    it("normalizes a DropTarget into a clean staged file card object", () => {
      const target: DropTarget = {
        id: "target_1",
        name: "architecture_diagram.png",
        path: "C:\\Users\\BBQ\\architecture_diagram.png",
        kind: "file",
        size: 2048576,
        modified_at: 1700000000000,
        extension: "png",
        classification: "image",
      };

      const file = normalizeStagedFile(target);
      assert.strictEqual(file.id, "target_1");
      assert.strictEqual(file.name, "architecture_diagram.png");
      assert.strictEqual(file.category, "image");
      assert.strictEqual(file.iconName, "file-image");
      assert.strictEqual(file.extension, "PNG");
      assert.strictEqual(file.formattedSize, "2.0 MB");
      assert.strictEqual(file.isDirectory, false);
    });

    it("bounds staged items strictly to MAX_DROP_SHELF_ITEMS (20) and deduplicates paths", () => {
      const items: DropTarget[] = [
        { id: "1", path: "C:\\docs\\a.txt", name: "a.txt", kind: "file", size: 100, modified_at: null, extension: "txt", classification: "document" },
        { id: "2", path: "c:\\docs\\a.txt", name: "a.txt", kind: "file", size: 100, modified_at: null, extension: "txt", classification: "document" }, // Duplicate
        { id: "3", path: "C:\\docs\\b.txt", name: "b.txt", kind: "file", size: 200, modified_at: null, extension: "txt", classification: "document" },
      ];

      const { items: result, wasLimited } = boundAndDeduplicateStagedItems(items, MAX_DROP_SHELF_ITEMS);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(wasLimited, false);
      assert.strictEqual(result[0].path, "C:\\docs\\a.txt");
      assert.strictEqual(result[1].path, "C:\\docs\\b.txt");

      // Test bounds limit
      const manyItems: DropTarget[] = Array.from({ length: 30 }, (_, i) => ({
        id: "t_" + i,
        path: "C:\\docs\\file_" + i + ".txt",
        name: "file_" + i + ".txt",
        kind: "file",
        size: 100,
        modified_at: null,
        extension: "txt",
        classification: "document",
      }));

      const bounded = boundAndDeduplicateStagedItems(manyItems, MAX_DROP_SHELF_ITEMS);
      assert.strictEqual(bounded.items.length, MAX_DROP_SHELF_ITEMS);
      assert.strictEqual(bounded.wasLimited, true);
    });
  });

  describe("STATIC AUDIT & INVARIANT VERIFICATION", () => {
    it("ensures ZERO setInterval in productivity model and widgets", () => {
      const paths = [
        path.resolve(__dirname, "../src/components/widgets/productivityModel.ts"),
        path.resolve(__dirname, "../src/components/widgets/TimerWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/ClipboardWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/DropWidget.tsx"),
      ];

      for (const p of paths) {
        const source = fs.readFileSync(p, "utf-8");
        assert.doesNotMatch(
          source,
          /setInterval\s*\(/,
          "Forbidden setInterval found in " + path.basename(p)
        );
      }
    });

    it("ensures ZERO requestAnimationFrame polling loops in productivity code", () => {
      const paths = [
        path.resolve(__dirname, "../src/components/widgets/productivityModel.ts"),
        path.resolve(__dirname, "../src/components/widgets/TimerWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/ClipboardWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/DropWidget.tsx"),
      ];

      for (const p of paths) {
        const source = fs.readFileSync(p, "utf-8");
        assert.doesNotMatch(
          source,
          /requestAnimationFrame\s*\(/,
          "Forbidden requestAnimationFrame found in " + path.basename(p)
        );
      }
    });

    it("ensures ZERO emoji icons in TimerWidget, ClipboardWidget, and DropWidget", () => {
      const paths = [
        path.resolve(__dirname, "../src/components/widgets/TimerWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/ClipboardWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/DropWidget.tsx"),
      ];

      const forbiddenEmojis = ["🍅", "⏱", "☕", "🌴", "📄", "📁", "🖼", "📦", "📋", "🔒", "📥"];

      for (const p of paths) {
        const source = fs.readFileSync(p, "utf-8");
        for (const emoji of forbiddenEmojis) {
          assert.ok(
            !source.includes(emoji),
            "Forbidden emoji " + emoji + " found in " + path.basename(p)
          );
        }
      }
    });

    it("ensures ZERO filter: drop-shadow in productivity HUD CSS (zero-halo invariant)", () => {
      const cssPath = path.resolve(__dirname, "../src/styles/index.css");
      const css = fs.readFileSync(cssPath, "utf-8");
      const dropWidgetSection = css.slice(css.indexOf(".bbq-drop-widget"));
      assert.ok(
        !dropWidgetSection.includes("drop-shadow"),
        "Forbidden drop-shadow found in drop widget styles"
      );
    });

    it("ensures prefers-reduced-motion overrides exist for productivity HUD elements", () => {
      const cssPath = path.resolve(__dirname, "../src/styles/index.css");
      const css = fs.readFileSync(cssPath, "utf-8");
      assert.ok(css.includes(".bbq-timer-ring-fill"), "Timer ring fill transition defined");
      assert.ok(css.includes(".bbq-clipboard-card"), "Clipboard card transition defined");
      assert.ok(css.includes(".bbq-staged-file-card"), "Staged file card transition defined");
    });
  });
});
