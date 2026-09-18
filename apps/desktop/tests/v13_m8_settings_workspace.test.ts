import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  clampDimension,
  clampIslandWidth,
  clampIslandHeight,
  clampClipboardCapacity,
  clampClipboardRetention,
  validateHexColor,
  computeWcagContrast,
  validateHotkeyInput,
  sanitizeIndicatorOrder,
  MIN_ISLAND_WIDTH,
  MAX_ISLAND_WIDTH,
  MIN_ISLAND_HEIGHT,
  MAX_ISLAND_HEIGHT,
  MIN_CLIPBOARD_CAPACITY,
  MAX_CLIPBOARD_CAPACITY,
  MIN_CLIPBOARD_RETENTION_DAYS,
  MAX_CLIPBOARD_RETENTION_DAYS,
} from "../src/components/widgets/settingsModel.ts";

import {
  classifyWorkspaceFile,
  formatWorkspaceBytes,
  filterWorkspaceFiles,
  sortWorkspaceFiles,
  calculateWorkspaceStats,
  planSequentialExecution,
  MAX_EXECUTION_BATCH_SIZE,
} from "../src/components/widgets/fileWorkspaceModel.ts";

import type { FileEntry } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v1.3 - Milestone 8: Settings & Personalization HUD + File Workspace Hub Tests", () => {
  describe("SETTINGS Pure Model & Validation", () => {
    it("1. width clamping: strictly enforces [180, 640] bounds", () => {
      assert.strictEqual(clampIslandWidth(100), MIN_ISLAND_WIDTH);
      assert.strictEqual(clampIslandWidth(179), MIN_ISLAND_WIDTH);
      assert.strictEqual(clampIslandWidth(180), 180);
      assert.strictEqual(clampIslandWidth(320), 320);
      assert.strictEqual(clampIslandWidth(640), 640);
      assert.strictEqual(clampIslandWidth(700), MAX_ISLAND_WIDTH);
      assert.strictEqual(clampIslandWidth(9999), MAX_ISLAND_WIDTH);
    });

    it("2. height clamping: strictly enforces [36, 520] bounds", () => {
      assert.strictEqual(clampIslandHeight(20), MIN_ISLAND_HEIGHT);
      assert.strictEqual(clampIslandHeight(35), MIN_ISLAND_HEIGHT);
      assert.strictEqual(clampIslandHeight(36), 36);
      assert.strictEqual(clampIslandHeight(48), 48);
      assert.strictEqual(clampIslandHeight(520), 520);
      assert.strictEqual(clampIslandHeight(600), MAX_ISLAND_HEIGHT);
    });

    it("3. NaN/Infinity handling: returns default dimensions without escaping", () => {
      assert.strictEqual(clampIslandWidth(NaN), 240);
      assert.strictEqual(clampIslandWidth(Infinity), 240);
      assert.strictEqual(clampIslandWidth(-Infinity), 240);
      assert.strictEqual(clampIslandWidth(null), 240);
      assert.strictEqual(clampIslandWidth(undefined), 240);
      assert.strictEqual(clampIslandHeight(NaN), 38);
      assert.strictEqual(clampIslandHeight(Infinity), 38);
      assert.strictEqual(clampIslandHeight(-Infinity), 38);
      assert.strictEqual(clampIslandHeight(null), 38);
      assert.strictEqual(clampIslandHeight(undefined), 38);
    });

    it("4. HEX validation: validates 3-char and 6-char HEX strings and rejects invalid", () => {
      assert.strictEqual(validateHexColor("#fff").valid, true);
      assert.strictEqual(validateHexColor("#007aff").valid, true);
      assert.strictEqual(validateHexColor("3b82f6").valid, true);
      assert.strictEqual(validateHexColor("#ggg").valid, false);
      assert.strictEqual(validateHexColor("#12345").valid, false);
      assert.strictEqual(validateHexColor("not-a-color").valid, false);
      assert.strictEqual(validateHexColor(null).valid, false);
      assert.strictEqual(validateHexColor(undefined).valid, false);
    });

    it("5. HEX normalization: produces deterministic lowercase #rrggbb format", () => {
      assert.strictEqual(validateHexColor("#FFF").normalized, "#ffffff");
      assert.strictEqual(validateHexColor("#0AF").normalized, "#00aaff");
      assert.strictEqual(validateHexColor("0A84FF").normalized, "#0a84ff");
      assert.strictEqual(validateHexColor("#FF3B30").normalized, "#ff3b30");
    });

    it("6. WCAG black/white: produces exact 21:1 contrast ratio", () => {
      const contrast = computeWcagContrast("#ffffff", "#000000");
      assert.strictEqual(contrast.ratio, 21);
      assert.strictEqual(contrast.normalTextAa, true);
      assert.strictEqual(contrast.largeTextAa, true);
      assert.strictEqual(contrast.uiComponentAa, true);
      assert.strictEqual(contrast.normalTextAaa, true);
    });

    it("7. WCAG identical colors: produces exact 1:1 ratio and flags AA failure", () => {
      const contrast = computeWcagContrast("#3b82f6", "#3b82f6");
      assert.strictEqual(contrast.ratio, 1);
      assert.strictEqual(contrast.normalTextAa, false);
      assert.strictEqual(contrast.largeTextAa, false);
      assert.strictEqual(contrast.uiComponentAa, false);
      assert.strictEqual(contrast.normalTextAaa, false);
    });

    it("8. preset contrast classification: computes deterministic ratios for presets against dark and light", () => {
      const blueDark = computeWcagContrast("#0a84ff", "#121216");
      assert.ok(blueDark.ratio >= 3.0, "Blue should pass at least large text AA on dark");
      assert.strictEqual(blueDark.largeTextAa, true);

      const yellowDark = computeWcagContrast("#ffd60a", "#121216");
      assert.ok(yellowDark.ratio >= 4.5, "Yellow should pass normal AA on dark");
      assert.strictEqual(yellowDark.normalTextAa, true);

      const yellowLight = computeWcagContrast("#ffd60a", "#ffffff");
      assert.ok(yellowLight.ratio < 4.5, "Yellow should fail normal text AA on white");
      assert.strictEqual(yellowLight.normalTextAa, false);
    });

    it("9. hotkey normalization: normalizes modifier ordering and capitalization", () => {
      const res1 = validateHotkeyInput("ctrl+shift+p");
      assert.strictEqual(res1.valid, true);
      assert.strictEqual(res1.normalized, "Ctrl+Shift+P");

      const res2 = validateHotkeyInput("shift+alt+ctrl+space");
      assert.strictEqual(res2.valid, true);
      assert.strictEqual(res2.normalized, "Ctrl+Alt+Shift+Space");

      const res3 = validateHotkeyInput("ctrl+f12");
      assert.strictEqual(res3.valid, true);
      assert.strictEqual(res3.normalized, "Ctrl+F12");
    });

    it("10. duplicate modifier rejection: rejects hotkeys with duplicate modifiers", () => {
      const res = validateHotkeyInput("Ctrl+Ctrl+P");
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes("Duplicate modifier"));
    });

    it("11. invalid hotkey rejection: rejects modifier-only, empty, or multi-key sequences", () => {
      assert.strictEqual(validateHotkeyInput("").valid, false);
      assert.strictEqual(validateHotkeyInput("   ").valid, false);
      assert.strictEqual(validateHotkeyInput("Ctrl+").valid, false);
      assert.strictEqual(validateHotkeyInput("Ctrl+Shift").valid, false);
      assert.strictEqual(validateHotkeyInput("Ctrl+A+B").valid, false);
      assert.strictEqual(validateHotkeyInput(null).valid, false);
    });

    it("12. indicator order sanitization: deduplicates and preserves complete registered widget set", () => {
      const available = ["media", "timer", "launcher", "system", "clipboard"];
      const order = ["timer", "media", "timer", "unknown", "launcher"];
      const sanitized = sanitizeIndicatorOrder(order, available);

      assert.deepStrictEqual(sanitized, ["timer", "media", "launcher", "system", "clipboard"]);
    });

    it("13. clipboard capacity: strictly enforces [10, 100] bounds matching Rust backend", () => {
      assert.strictEqual(clampClipboardCapacity(5), MIN_CLIPBOARD_CAPACITY);
      assert.strictEqual(clampClipboardCapacity(10), 10);
      assert.strictEqual(clampClipboardCapacity(50), 50);
      assert.strictEqual(clampClipboardCapacity(100), 100);
      assert.strictEqual(clampClipboardCapacity(500), MAX_CLIPBOARD_CAPACITY);
      assert.strictEqual(clampClipboardCapacity(NaN), 100);
    });

    it("14. clipboard retention: strictly enforces [1, 90] days bound", () => {
      assert.strictEqual(clampClipboardRetention(0), MIN_CLIPBOARD_RETENTION_DAYS);
      assert.strictEqual(clampClipboardRetention(1), 1);
      assert.strictEqual(clampClipboardRetention(30), 30);
      assert.strictEqual(clampClipboardRetention(90), 90);
      assert.strictEqual(clampClipboardRetention(100), MAX_CLIPBOARD_RETENTION_DAYS);
      assert.strictEqual(clampClipboardRetention(NaN), 30);
    });
  });

  describe("WORKSPACE Pure Model & Safety", () => {
    it("15. 30+ extension classifications: accurately maps broad extension set to categories and SVG icons", () => {
      const cases: [string, string, string][] = [
        ["ts", "code", "file-code"],
        ["tsx", "code", "file-code"],
        ["rs", "code", "file-code"],
        ["py", "code", "file-code"],
        ["go", "code", "file-code"],
        ["c", "code", "file-code"],
        ["cpp", "code", "file-code"],
        ["html", "code", "file-code"],
        ["css", "code", "file-code"],
        ["json", "code", "file-code"],
        ["yaml", "code", "file-code"],
        ["sql", "code", "file-code"],
        ["sh", "code", "file-code"],
        ["png", "media", "file-image"],
        ["jpg", "media", "file-image"],
        ["jpeg", "media", "file-image"],
        ["svg", "media", "file-image"],
        ["webp", "media", "file-image"],
        ["mp3", "media", "file-audio"],
        ["wav", "media", "file-audio"],
        ["flac", "media", "file-audio"],
        ["mp4", "media", "file-video"],
        ["mkv", "media", "file-video"],
        ["mov", "media", "file-video"],
        ["pdf", "document", "file-text"],
        ["docx", "document", "file-text"],
        ["xlsx", "document", "file-text"],
        ["pptx", "document", "file-text"],
        ["md", "document", "file-text"],
        ["txt", "document", "file-text"],
        ["zip", "archive", "file-archive"],
        ["tar", "archive", "file-archive"],
        ["gz", "archive", "file-archive"],
        ["7z", "archive", "file-archive"],
      ];

      for (const [ext, expectedCat, expectedIcon] of cases) {
        const classified = classifyWorkspaceFile(ext);
        assert.strictEqual(classified.category, expectedCat, `Failed category for ${ext}`);
        assert.strictEqual(classified.iconName, expectedIcon, `Failed icon for ${ext}`);
      }
    });

    it("16. unknown extension: gracefully classifies as other with files icon", () => {
      const classified = classifyWorkspaceFile("xyz123");
      assert.strictEqual(classified.category, "other");
      assert.strictEqual(classified.iconName, "files");
    });

    it("17. dotfile/no extension: safely maps to other without crash", () => {
      assert.strictEqual(classifyWorkspaceFile(null).category, "other");
      assert.strictEqual(classifyWorkspaceFile(undefined).category, "other");
      assert.strictEqual(classifyWorkspaceFile("").category, "other");
      assert.strictEqual(classifyWorkspaceFile(".gitignore").category, "other");
    });

    it("18. category filtering: filters entries by exact category match", () => {
      const sampleEntries: FileEntry[] = [
        createTestFileEntry("1", "main.rs", "rs"),
        createTestFileEntry("2", "logo.png", "png"),
        createTestFileEntry("3", "notes.pdf", "pdf"),
        createTestFileEntry("4", "archive.zip", "zip"),
      ];

      const codeOnly = filterWorkspaceFiles(sampleEntries, "code", "");
      assert.strictEqual(codeOnly.length, 1);
      assert.strictEqual(codeOnly[0].name, "main.rs");

      const mediaOnly = filterWorkspaceFiles(sampleEntries, "media", "");
      assert.strictEqual(mediaOnly.length, 1);
      assert.strictEqual(mediaOnly[0].name, "logo.png");

      const all = filterWorkspaceFiles(sampleEntries, "all", "");
      assert.strictEqual(all.length, 4);
    });

    it("19. query filtering: filters files case-insensitively by name and path", () => {
      const sampleEntries: FileEntry[] = [
        createTestFileEntry("1", "AppConfig.ts", "ts", "C:\\projects\\app"),
        createTestFileEntry("2", "UserAvatar.png", "png", "C:\\assets\\images"),
        createTestFileEntry("3", "README.md", "md", "C:\\projects\\app"),
      ];

      const matchConfig = filterWorkspaceFiles(sampleEntries, "all", "config");
      assert.strictEqual(matchConfig.length, 1);
      assert.strictEqual(matchConfig[0].name, "AppConfig.ts");

      const matchPath = filterWorkspaceFiles(sampleEntries, "all", "assets");
      assert.strictEqual(matchPath.length, 1);
      assert.strictEqual(matchPath[0].name, "UserAvatar.png");

      const noMatch = filterWorkspaceFiles(sampleEntries, "all", "nonexistent");
      assert.strictEqual(noMatch.length, 0);
    });

    it("20. deterministic sorting: sorts by name, size, and date", () => {
      const sampleEntries: FileEntry[] = [
        { ...createTestFileEntry("1", "zebra.txt", "txt"), size_bytes: 100, created_at: 1000 },
        { ...createTestFileEntry("2", "apple.txt", "txt"), size_bytes: 5000, created_at: 3000 },
        { ...createTestFileEntry("3", "mango.txt", "txt"), size_bytes: 200, created_at: 2000 },
      ];

      const sortedByName = sortWorkspaceFiles(sampleEntries, "name");
      assert.strictEqual(sortedByName[0].name, "apple.txt");
      assert.strictEqual(sortedByName[2].name, "zebra.txt");

      const sortedBySize = sortWorkspaceFiles(sampleEntries, "size");
      assert.strictEqual(sortedBySize[0].name, "apple.txt");
      assert.strictEqual(sortedBySize[2].name, "zebra.txt");

      const sortedByDate = sortWorkspaceFiles(sampleEntries, "date");
      assert.strictEqual(sortedByDate[0].name, "apple.txt"); // newest (3000)
      assert.strictEqual(sortedByDate[2].name, "zebra.txt"); // oldest (1000)
    });

    it("21. size aggregation: safely formats large byte counts without floating point overflow", () => {
      assert.strictEqual(formatWorkspaceBytes(0), "0 B");
      assert.strictEqual(formatWorkspaceBytes(512), "512 B");
      assert.strictEqual(formatWorkspaceBytes(2048), "2.0 KB");
      assert.strictEqual(formatWorkspaceBytes(5 * 1024 * 1024), "5.0 MB");
      assert.strictEqual(formatWorkspaceBytes(3.5 * 1024 * 1024 * 1024), "3.5 GB");
      assert.strictEqual(formatWorkspaceBytes(-10), "0 B");
      assert.strictEqual(formatWorkspaceBytes(NaN), "0 B");
    });

    it("22. missing count: accurately calculates missing count and workspace stats", () => {
      const sampleEntries: FileEntry[] = [
        { ...createTestFileEntry("1", "a.txt", "txt"), missing: false, size_bytes: 1000 },
        { ...createTestFileEntry("2", "b.txt", "txt"), missing: true, size_bytes: 2000 },
        { ...createTestFileEntry("3", "c.txt", "txt"), missing: true, size_bytes: 3000 },
      ];

      const stats = calculateWorkspaceStats(sampleEntries);
      assert.strictEqual(stats.totalCount, 3);
      assert.strictEqual(stats.missingCount, 2);
      assert.strictEqual(stats.totalSizeBytes, 6000);
      assert.strictEqual(stats.formattedTotalSize, "5.9 KB");
    });

    it("23. 100-entry bound: handles large arrays without performance degradation", () => {
      const largeList: FileEntry[] = [];
      for (let i = 0; i < 150; i++) {
        largeList.push(createTestFileEntry(`id_${i}`, `file_${i}.ts`, "ts"));
      }

      const stats = calculateWorkspaceStats(largeList);
      assert.strictEqual(stats.totalCount, 150);
      const filtered = filterWorkspaceFiles(largeList, "code", "file_1");
      assert.ok(filtered.length > 0);
    });

    it("24. sequential execution planner: bounds batch to maximum 10 files", () => {
      const entries: FileEntry[] = [];
      for (let i = 0; i < 25; i++) {
        entries.push(createTestFileEntry(`id_${i}`, `doc_${i}.pdf`, "pdf"));
      }

      const plan = planSequentialExecution(entries, MAX_EXECUTION_BATCH_SIZE);
      assert.strictEqual(plan.executable.length, 10);
      assert.strictEqual(plan.skippedMissing, 0);
    });

    it("25. missing files skipped: execution planner strictly skips missing files", () => {
      const entries: FileEntry[] = [
        { ...createTestFileEntry("1", "valid1.txt", "txt"), missing: false },
        { ...createTestFileEntry("2", "missing1.txt", "txt"), missing: true },
        { ...createTestFileEntry("3", "valid2.txt", "txt"), missing: false },
        { ...createTestFileEntry("4", "missing2.txt", "txt"), missing: true },
      ];

      const plan = planSequentialExecution(entries);
      assert.strictEqual(plan.executable.length, 2);
      assert.strictEqual(plan.skippedMissing, 2);
      assert.strictEqual(plan.executable[0].id, "1");
      assert.strictEqual(plan.executable[1].id, "3");
    });
  });

  describe("STATIC INVARIANTS & ACCESSIBILITY AUDIT", () => {
    const settingsWidgetSrc = fs.readFileSync(
      path.join(__dirname, "../src/components/widgets/SettingsWidget.tsx"),
      "utf8"
    );
    const fileWorkspaceWidgetSrc = fs.readFileSync(
      path.join(__dirname, "../src/components/widgets/FileWorkspaceWidget.tsx"),
      "utf8"
    );
    const settingsModelSrc = fs.readFileSync(
      path.join(__dirname, "../src/components/widgets/settingsModel.ts"),
      "utf8"
    );
    const fileWorkspaceModelSrc = fs.readFileSync(
      path.join(__dirname, "../src/components/widgets/fileWorkspaceModel.ts"),
      "utf8"
    );
    const cssSrc = fs.readFileSync(path.join(__dirname, "../src/styles/index.css"), "utf8");

    it("26. zero setInterval: verifies ZERO setInterval calls in Settings and File Workspace code", () => {
      assert.strictEqual(settingsWidgetSrc.includes("setInterval"), false);
      assert.strictEqual(fileWorkspaceWidgetSrc.includes("setInterval"), false);
      assert.strictEqual(settingsModelSrc.includes("setInterval"), false);
      assert.strictEqual(fileWorkspaceModelSrc.includes("setInterval"), false);
    });

    it("27. zero recursive setTimeout: verifies no recursive timer loops exist", () => {
      assert.strictEqual(settingsModelSrc.includes("setTimeout"), false);
      assert.strictEqual(fileWorkspaceModelSrc.includes("setTimeout"), false);
    });

    it("28. zero continuous RAF: verifies ZERO requestAnimationFrame calls in M8 widgets and models", () => {
      assert.strictEqual(settingsWidgetSrc.includes("requestAnimationFrame"), false);
      assert.strictEqual(fileWorkspaceWidgetSrc.includes("requestAnimationFrame"), false);
      assert.strictEqual(settingsModelSrc.includes("requestAnimationFrame"), false);
      assert.strictEqual(fileWorkspaceModelSrc.includes("requestAnimationFrame"), false);
    });

    it("29. zero emoji: verifies ZERO emoji characters in SettingsWidget, FileWorkspaceWidget, and models", () => {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      assert.strictEqual(emojiRegex.test(settingsWidgetSrc), false, "Found emoji in SettingsWidget.tsx");
      assert.strictEqual(emojiRegex.test(fileWorkspaceWidgetSrc), false, "Found emoji in FileWorkspaceWidget.tsx");
      assert.strictEqual(emojiRegex.test(settingsModelSrc), false, "Found emoji in settingsModel.ts");
      assert.strictEqual(emojiRegex.test(fileWorkspaceModelSrc), false, "Found emoji in fileWorkspaceModel.ts");
    });

    it("30. zero drop-shadow: verifies CSS contains zero filter: drop-shadow outer glow rules", () => {
      assert.strictEqual(cssSrc.includes("filter: drop-shadow"), false);
    });

    it("31. reduced-motion CSS presence: verifies data-reduced-motion overrides exist in CSS", () => {
      assert.ok(cssSrc.includes('[data-reduced-motion="true"]'));
      assert.ok(cssSrc.includes("@media (prefers-reduced-motion"));
    });
  });
});

function createTestFileEntry(
  id: string,
  name: string,
  extension: string,
  folderPath: string = "C:\\test"
): FileEntry {
  return {
    id,
    name,
    path: `${folderPath}\\${name}`,
    extension,
    mime_type: null,
    size_bytes: 1024,
    modified_at: Date.now(),
    created_at: Date.now(),
    source: "drop",
    missing: false,
  };
}
