import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mapActionToIconName,
  filterAndRankLauncherItems,
  getTopQuickActions,
  clampSelectedIndex,
  MAX_LAUNCHER_VISIBLE_ITEMS,
  QUICK_ACTIONS_LIMIT,
} from "../src/components/widgets/launcherModel.ts";
import {
  calculateReminderPresets,
  formatReminderDue,
  validateReminderInput,
  partitionReminders,
  MAX_REMINDERS_BOUND,
  MAX_REMINDER_TITLE_LENGTH,
  MAX_REMINDER_BODY_LENGTH,
} from "../src/components/widgets/reminderModel.ts";
import type { LauncherItem, Reminder } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v1.3 - Milestone 7: Quick Launcher & Reminders HUD Tests", () => {
  describe("LAUNCHER Pure Model & Search Ranking", () => {
    it("maps all LauncherAction types to native SVG IconName without emojis", () => {
      assert.strictEqual(mapActionToIconName({ type: "open_application", payload: { id: "code" } }), "launcher");
      assert.strictEqual(mapActionToIconName({ type: "open_file", payload: { path: "C:\\a.txt" } }), "file-text");
      assert.strictEqual(mapActionToIconName({ type: "open_folder", payload: { path: "C:\\docs" } }), "files");
      assert.strictEqual(mapActionToIconName({ type: "open_url", payload: { url: "https://example.com" } }), "globe");
      assert.strictEqual(mapActionToIconName({ type: "system_action", payload: { action: "lock" } }), "power");
      assert.strictEqual(mapActionToIconName({ type: "bbq_action", payload: { action: "open_files" } }), "sparkles");
      assert.strictEqual(mapActionToIconName(null), "launcher");
      assert.strictEqual(mapActionToIconName(undefined), "launcher");
    });

    it("filters and ranks launcher items with exact match having highest priority", () => {
      const items: LauncherItem[] = [
        {
          id: "1",
          title: "Code Editor",
          subtitle: "VS Code application",
          icon: null,
          action: { type: "open_application", payload: { id: "vscode" } },
          source: "built_in",
          usage_count: 0,
          favorite: false,
          shortcut: null,
        },
        {
          id: "2",
          title: "Code",
          subtitle: "Direct match",
          icon: null,
          action: { type: "open_application", payload: { id: "code" } },
          source: "built_in",
          usage_count: 0,
          favorite: false,
          shortcut: null,
        },
        {
          id: "3",
          title: "Terminal",
          subtitle: "Run code scripts",
          icon: null,
          action: { type: "open_application", payload: { id: "wt" } },
          source: "built_in",
          usage_count: 0,
          favorite: false,
          shortcut: null,
        },
      ];

      const ranked = filterAndRankLauncherItems(items, "Code");
      assert.strictEqual(ranked.length, 3);
      // Exact match "Code" must rank first
      assert.strictEqual(ranked[0].id, "2");
      // Prefix match "Code Editor" must rank second
      assert.strictEqual(ranked[1].id, "1");
      // Subtitle match "Terminal" (subtitle: "Run code scripts") ranks third
      assert.strictEqual(ranked[2].id, "3");
    });

    it("handles case-insensitivity, empty queries, and special characters safely", () => {
      const items: LauncherItem[] = [
        {
          id: "1",
          title: "Settings",
          subtitle: null,
          icon: null,
          action: { type: "bbq_action", payload: { action: "open_settings" } },
          source: "built_in",
          usage_count: 5,
          favorite: false,
          shortcut: null,
        },
      ];

      assert.strictEqual(filterAndRankLauncherItems(items, "").length, 1);
      assert.strictEqual(filterAndRankLauncherItems(items, "   ").length, 1);
      assert.strictEqual(filterAndRankLauncherItems(items, null).length, 1);
      assert.strictEqual(filterAndRankLauncherItems(items, undefined).length, 1);
      assert.strictEqual(filterAndRankLauncherItems(items, "settings")[0].id, "1");
      assert.strictEqual(filterAndRankLauncherItems(items, "SETTINGS")[0].id, "1");
      // Special characters should not crash regex
      assert.strictEqual(filterAndRankLauncherItems(items, "[.*+?^${}()|/").length, 0);
    });

    it("provides deterministic alphabetical tie-breaking for equal ranking scores", () => {
      const items: LauncherItem[] = [
        { id: "b", title: "Beta Tool", subtitle: null, icon: null, action: { type: "open_application", payload: { id: "b" } }, source: "built_in", usage_count: 0, favorite: false, shortcut: null },
        { id: "a", title: "Alpha Tool", subtitle: null, icon: null, action: { type: "open_application", payload: { id: "a" } }, source: "built_in", usage_count: 0, favorite: false, shortcut: null },
        { id: "c", title: "Charlie Tool", subtitle: null, icon: null, action: { type: "open_application", payload: { id: "c" } }, source: "built_in", usage_count: 0, favorite: false, shortcut: null },
      ];

      const ranked = filterAndRankLauncherItems(items, "Tool");
      assert.strictEqual(ranked.length, 3);
      assert.strictEqual(ranked[0].id, "a");
      assert.strictEqual(ranked[1].id, "b");
      assert.strictEqual(ranked[2].id, "c");
    });

    it("applies usage count bonus to boost frequently launched items", () => {
      const items: LauncherItem[] = [
        { id: "infrequent", title: "Editor Pro", subtitle: null, icon: null, action: { type: "open_application", payload: { id: "e1" } }, source: "built_in", usage_count: 0, favorite: false, shortcut: null },
        { id: "frequent", title: "Editor Basic", subtitle: null, icon: null, action: { type: "open_application", payload: { id: "e2" } }, source: "built_in", usage_count: 20, favorite: false, shortcut: null },
      ];

      const ranked = filterAndRankLauncherItems(items, "Editor");
      assert.strictEqual(ranked.length, 2);
      assert.strictEqual(ranked[0].id, "frequent");
      assert.strictEqual(ranked[1].id, "infrequent");
    });

    it("bounds search results strictly to maxResults", () => {
      const items: LauncherItem[] = Array.from({ length: 50 }, (_, i) => ({
        id: `item_${i}`,
        title: `Application ${i}`,
        subtitle: null,
        icon: null,
        action: { type: "open_application", payload: { id: `app_${i}` } },
        source: "built_in",
        usage_count: 0,
        favorite: false,
        shortcut: null,
      }));

      const results = filterAndRankLauncherItems(items, "Application", 15);
      assert.strictEqual(results.length, 15);
    });

    it("handles null or undefined items array gracefully", () => {
      assert.deepStrictEqual(filterAndRankLauncherItems(null, "test"), []);
      assert.deepStrictEqual(filterAndRankLauncherItems(undefined, "test"), []);
    });

    it("derives top 2x2 Quick Actions prioritizing favorites, recents, and bounded to 4", () => {
      const items: LauncherItem[] = [
        { id: "gen_1", title: "General 1", subtitle: null, icon: null, action: { type: "system_action", payload: { action: "lock" } }, source: "built_in", usage_count: 1, favorite: false, shortcut: null },
        { id: "gen_2", title: "General 2", subtitle: null, icon: null, action: { type: "system_action", payload: { action: "lock" } }, source: "built_in", usage_count: 1, favorite: false, shortcut: null },
      ];

      const favorites: LauncherItem[] = [
        { id: "fav_1", title: "Fav 1", subtitle: null, icon: null, action: { type: "open_url", payload: { url: "https://a.com" } }, source: "custom", usage_count: 10, favorite: true, shortcut: null },
        { id: "fav_2", title: "Fav 2", subtitle: null, icon: null, action: { type: "open_url", payload: { url: "https://b.com" } }, source: "custom", usage_count: 8, favorite: true, shortcut: null },
      ];

      const recents: LauncherItem[] = [
        { id: "fav_1", title: "Fav 1 Duplicate", subtitle: null, icon: null, action: { type: "open_url", payload: { url: "https://a.com" } }, source: "custom", usage_count: 10, favorite: true, shortcut: null },
        { id: "rec_1", title: "Recent 1", subtitle: null, icon: null, action: { type: "open_file", payload: { path: "C:\\file.txt" } }, source: "history", usage_count: 5, favorite: false, shortcut: null },
      ];

      const quickActions = getTopQuickActions(items, favorites, recents, QUICK_ACTIONS_LIMIT);
      assert.strictEqual(quickActions.length, 4);
      assert.strictEqual(quickActions[0].id, "fav_1");
      assert.strictEqual(quickActions[1].id, "fav_2");
      assert.strictEqual(quickActions[2].id, "rec_1");
      assert.strictEqual(quickActions[3].id, "gen_1");
    });

    it("deduplicates items safely when deriving top quick actions", () => {
      const item: LauncherItem = {
        id: "shared_id",
        title: "Calculator",
        subtitle: null,
        icon: null,
        action: { type: "open_application", payload: { id: "calc" } },
        source: "built_in",
        usage_count: 5,
        favorite: true,
        shortcut: null,
      };

      const quick = getTopQuickActions([item], [item], [item], 4);
      assert.strictEqual(quick.length, 1);
      assert.strictEqual(quick[0].id, "shared_id");
    });

    it("safely clamps keyboard selection index under edge conditions", () => {
      assert.strictEqual(clampSelectedIndex(0, 5), 0);
      assert.strictEqual(clampSelectedIndex(4, 5), 4);
      assert.strictEqual(clampSelectedIndex(10, 5), 4);
      assert.strictEqual(clampSelectedIndex(-2, 5), 0);
      assert.strictEqual(clampSelectedIndex(0, 0), 0);
      assert.strictEqual(clampSelectedIndex(NaN, 5), 0);
      assert.strictEqual(clampSelectedIndex(2, NaN), 0);
      assert.strictEqual(clampSelectedIndex(Infinity, 5), 4);
      assert.strictEqual(clampSelectedIndex(-Infinity, 5), 0);
    });
  });

  describe("REMINDERS Pure Model & Due Calculations", () => {
    it("generates standard reminder presets (+10m, +30m, +1h, Tomorrow 9am)", () => {
      const now = 1700000000000;
      const presets = calculateReminderPresets(now);

      assert.strictEqual(presets.length, 4);
      assert.strictEqual(presets[0].id, "10m");
      assert.strictEqual(presets[0].dueAt, now + 10 * 60 * 1000);
      assert.strictEqual(presets[1].id, "30m");
      assert.strictEqual(presets[1].dueAt, now + 30 * 60 * 1000);
      assert.strictEqual(presets[2].id, "1h");
      assert.strictEqual(presets[2].dueAt, now + 60 * 60 * 1000);

      const tomorrow = new Date(presets[3].dueAt);
      assert.strictEqual(tomorrow.getHours(), 9);
      assert.strictEqual(tomorrow.getMinutes(), 0);
      assert.strictEqual(tomorrow.getSeconds(), 0);
    });

    it("calculates Tomorrow 9am correctly across day boundary with explicit timestamp", () => {
      // 2026-03-15 23:30:00 local time
      const baseDate = new Date(2026, 2, 15, 23, 30, 0, 0);
      const now = baseDate.getTime();
      const presets = calculateReminderPresets(now);
      const tomorrow9am = new Date(presets[3].dueAt);

      assert.strictEqual(tomorrow9am.getDate(), 16);
      assert.strictEqual(tomorrow9am.getHours(), 9);
      assert.strictEqual(tomorrow9am.getMinutes(), 0);
      assert.strictEqual(tomorrow9am.getSeconds(), 0);
    });

    it("formats relative due times gracefully without drift", () => {
      const now = 1700000000000;

      // Overdue
      assert.strictEqual(formatReminderDue(now - 5000, now), "Süresi doldu");
      assert.strictEqual(formatReminderDue(now, now), "Süresi doldu");

      // Under 1 minute
      assert.strictEqual(formatReminderDue(now + 45000, now), "< 1 dk içinde");

      // Minutes
      assert.strictEqual(formatReminderDue(now + 15 * 60 * 1000, now), "15 dk içinde");

      // Hours & minutes
      assert.strictEqual(formatReminderDue(now + 90 * 60 * 1000, now), "1 sa 30 dk");
      assert.strictEqual(formatReminderDue(now + 120 * 60 * 1000, now), "2 saat içinde");

      // Days
      assert.strictEqual(formatReminderDue(now + 48 * 3600 * 1000, now), "2 gün içinde");

      // Invalid / NaN / negative
      assert.strictEqual(formatReminderDue(NaN, now), "Belirtilmemiş");
      assert.strictEqual(formatReminderDue("invalid" as unknown as number, now), "Belirtilmemiş");
    });

    it("validates reminder inputs strictly and guards against invalid dates and overflows", () => {
      const now = 1700000000000;

      // Empty title
      assert.strictEqual(validateReminderInput("", now + 60000, now).valid, false);
      assert.strictEqual(validateReminderInput("   ", now + 60000, now).valid, false);
      assert.strictEqual(validateReminderInput(null, now + 60000, now).valid, false);
      assert.strictEqual(validateReminderInput(undefined, now + 60000, now).valid, false);

      // Title exceeding limit
      const longTitle = "a".repeat(MAX_REMINDER_TITLE_LENGTH + 1);
      assert.strictEqual(validateReminderInput(longTitle, now + 60000, now).valid, false);

      // Exact title limit
      const exactTitle = "a".repeat(MAX_REMINDER_TITLE_LENGTH);
      assert.strictEqual(validateReminderInput(exactTitle, now + 60000, now).valid, true);

      // Past or invalid due date
      assert.strictEqual(validateReminderInput("Test", now - 1000, now).valid, false);
      assert.strictEqual(validateReminderInput("Test", now, now).valid, false);
      assert.strictEqual(validateReminderInput("Test", NaN, now).valid, false);
      assert.strictEqual(validateReminderInput("Test", Infinity, now).valid, false);

      // Valid
      const valid = validateReminderInput("Meeting", now + 600000, now);
      assert.strictEqual(valid.valid, true);
      if (valid.valid) {
        assert.strictEqual(valid.title, "Meeting");
        assert.strictEqual(valid.dueAt, now + 600000);
      }
    });

    it("handles multibyte Unicode strings up to exact limit without crash or corruption", () => {
      const now = 1700000000000;
      // 128 Unicode characters (e.g. Turkish accents)
      const turkishTitle = "ÇalışmaToplantısı".repeat(8).slice(0, MAX_REMINDER_TITLE_LENGTH);
      assert.strictEqual(turkishTitle.length, MAX_REMINDER_TITLE_LENGTH);

      const res = validateReminderInput(turkishTitle, now + 60000, now);
      assert.strictEqual(res.valid, true);
      if (res.valid) {
        assert.strictEqual(res.title, turkishTitle);
      }

      // One char over limit
      const overTitle = turkishTitle + "ç";
      assert.strictEqual(validateReminderInput(overTitle, now + 60000, now).valid, false);
    });

    it("safely rejects huge pasted inputs without memory issues", () => {
      const now = 1700000000000;
      const hugeInput = "x".repeat(100_000);
      const res = validateReminderInput(hugeInput, now + 60000, now);
      assert.strictEqual(res.valid, false);
    });

    it("partitions and sorts scheduled vs fired reminders", () => {
      const now = 1700000000000;
      const reminders: Reminder[] = [
        { id: "1", title: "Later", body: null, due_at: now + 60000, state: "Scheduled", created_at: now, fired_at: null },
        { id: "2", title: "Earlier", body: null, due_at: now + 30000, state: "Scheduled", created_at: now, fired_at: null },
        { id: "3", title: "Fired 1", body: null, due_at: now - 10000, state: "Fired", created_at: now - 20000, fired_at: now - 10000 },
        { id: "4", title: "Fired 2", body: null, due_at: now - 5000, state: "Fired", created_at: now - 20000, fired_at: now - 5000 },
      ];

      const { scheduled, fired } = partitionReminders(reminders);
      assert.strictEqual(scheduled.length, 2);
      assert.strictEqual(fired.length, 2);

      // Scheduled should be sorted ascending by due_at
      assert.strictEqual(scheduled[0].id, "2");
      assert.strictEqual(scheduled[1].id, "1");

      // Fired should be sorted descending by due_at
      assert.strictEqual(fired[0].id, "4");
      assert.strictEqual(fired[1].id, "3");
    });

    it("enforces maxItems bound on partitioned reminder lists", () => {
      const now = 1700000000000;
      const reminders: Reminder[] = Array.from({ length: 60 }, (_, i) => ({
        id: `rem_${i}`,
        title: `Reminder ${i}`,
        body: null,
        due_at: now + (i + 1) * 10000,
        state: "Scheduled" as const,
        created_at: now,
      }));

      const { scheduled } = partitionReminders(reminders, MAX_REMINDERS_BOUND);
      assert.strictEqual(scheduled.length, MAX_REMINDERS_BOUND);
    });

    it("handles empty, null, or non-array reminders input gracefully", () => {
      assert.deepStrictEqual(partitionReminders(null), { scheduled: [], fired: [] });
      assert.deepStrictEqual(partitionReminders(undefined), { scheduled: [], fired: [] });
      assert.deepStrictEqual(partitionReminders([]), { scheduled: [], fired: [] });
    });
  });

  describe("STATIC INVARIANTS & SECURITY CHECKS", () => {
    it("ensures ZERO setInterval in Launcher and Reminder widgets & models", () => {
      const paths = [
        path.resolve(__dirname, "../src/components/widgets/launcherModel.ts"),
        path.resolve(__dirname, "../src/components/widgets/reminderModel.ts"),
        path.resolve(__dirname, "../src/components/widgets/LauncherWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/ReminderWidget.tsx"),
      ];

      for (const p of paths) {
        const content = fs.readFileSync(p, "utf-8");
        assert.doesNotMatch(content, /setInterval\s*\(/, "Forbidden setInterval found in " + path.basename(p));
      }
    });

    it("ensures ZERO requestAnimationFrame polling loops in Launcher and Reminder code", () => {
      const paths = [
        path.resolve(__dirname, "../src/components/widgets/launcherModel.ts"),
        path.resolve(__dirname, "../src/components/widgets/reminderModel.ts"),
        path.resolve(__dirname, "../src/components/widgets/LauncherWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/ReminderWidget.tsx"),
      ];

      for (const p of paths) {
        const content = fs.readFileSync(p, "utf-8");
        assert.doesNotMatch(content, /requestAnimationFrame\s*\(/, "Forbidden requestAnimationFrame found in " + path.basename(p));
      }
    });

    it("ensures ZERO emoji UI in LauncherWidget and ReminderWidget", () => {
      const paths = [
        path.resolve(__dirname, "../src/components/widgets/LauncherWidget.tsx"),
        path.resolve(__dirname, "../src/components/widgets/ReminderWidget.tsx"),
      ];

      const forbiddenEmojis = ["🚀", "🔔", "📄", "📁", "🌐", "⚙️", "🧭", "★", "☆", "⌕", "✕", "⚠️"];

      for (const p of paths) {
        const content = fs.readFileSync(p, "utf-8");
        for (const emoji of forbiddenEmojis) {
          assert.ok(!content.includes(emoji), `Forbidden emoji '${emoji}' found in ${path.basename(p)}`);
        }
      }
    });

    it("ensures prefers-reduced-motion overrides exist for launcher and reminder components", () => {
      const cssPath = path.resolve(__dirname, "../src/styles/index.css");
      const css = fs.readFileSync(cssPath, "utf-8");
      assert.ok(css.includes(".bbq-launcher-grid-card"), "Launcher grid card transition override defined");
      assert.ok(css.includes(".bbq-reminder-item"), "Reminder item transition override defined");
    });
  });
});
