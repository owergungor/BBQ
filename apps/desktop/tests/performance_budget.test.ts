import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import {
  islandStore,
  initialIslandState,
  recordIslandEvent,
  setActiveWidget,
  MAX_RECENT_WIDGETS,
  MAX_EVENT_HISTORY,
} from "../src/island/islandState.ts";
import { timerStore } from "../src/state/timerState.ts";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";
import { dropStore } from "../src/state/dropState.ts";
import { systemStore } from "../src/state/systemState.ts";
import { reminderStore } from "../src/state/reminderState.ts";
import { searchLauncherItems } from "../src/utils/launcherSearch.ts";
import type { LauncherItem } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Milestone 14: Performance & Resource Budgeting", () => {
  describe("Anti-Pattern Regression Guards", () => {
    it("guarantees zero setInterval in desktop production codebase", () => {
      const srcDir = path.resolve(__dirname, "../src");
      const findFiles = (dir: string): string[] => {
        let results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(findFiles(fullPath));
          } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
            results.push(fullPath);
          }
        }
        return results;
      };

      const files = findFiles(srcDir);
      assert(files.length > 0, "Source files must exist");

      const violations: string[] = [];
      const setIntervalRegex = /\bsetInterval\s*\(/;

      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        if (setIntervalRegex.test(content)) {
          violations.push(path.relative(srcDir, file));
        }
      }

      assert.deepEqual(violations, [], `Disallowed setInterval found in: ${violations.join(", ")}`);
    });

    it("guarantees zero continuous tokio::time::interval in Rust backend services", () => {
      const servicesDir = path.resolve(__dirname, "../../../crates/services/src");
      if (fs.existsSync(servicesDir)) {
        const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith(".rs"));
        const intervalRegex = /tokio::time::interval/;

        const violations: string[] = [];
        for (const file of files) {
          const content = fs.readFileSync(path.join(servicesDir, file), "utf-8");
          if (intervalRegex.test(content)) {
            violations.push(file);
          }
        }

        assert.deepEqual(violations, [], `Disallowed tokio interval in: ${violations.join(", ")}`);
      }
    });
  });

  describe("Long-Running / 10,000 Event Soak Test", () => {
    it("processes 10,000 synthetic events without unbounded collection growth", async () => {
      const runtime = new IslandRuntime();
      islandStore.setState(initialIslandState);

      const widgetPool = [
        "files",
        "clipboard",
        "media",
        "system",
        "launcher",
        "timer",
        "reminder",
        "drop",
        "settings",
        "notes",
        "calculator",
        "terminal",
      ];

      // 10,000 deterministic event cycles
      for (let i = 0; i < 10000; i++) {
        const eventCycle = i % 5;
        const targetWidget = widgetPool[i % widgetPool.length];

        switch (eventCycle) {
          case 0:
            await runtime.handleEvent({ type: "USER_HOVER" });
            break;
          case 1:
            await runtime.handleEvent({ type: "USER_CLICK" });
            setActiveWidget(targetWidget, true);
            break;
          case 2:
            await runtime.handleEvent({ type: "DRAG_ENTER" });
            break;
          case 3:
            await runtime.handleEvent({ type: "DRAG_LEAVE" });
            break;
          case 4:
            await runtime.handleEvent({ type: "USER_ESCAPE" });
            break;
        }

        recordIslandEvent(`Event_${i}`);

        // Periodic assertion: bounds must never be violated at any point during execution
        if (i % 1000 === 0) {
          const current = islandStore.getState();
          assert(
            current.recentWidgets.length <= MAX_RECENT_WIDGETS,
            `Recent widgets exceeded limit at step ${i}`
          );
          assert(
            current.eventHistory.length <= MAX_EVENT_HISTORY,
            `Event history exceeded limit at step ${i}`
          );
        }
      }

      // Final bound verification
      const finalState = islandStore.getState();
      assert(finalState.recentWidgets.length <= MAX_RECENT_WIDGETS);
      assert.equal(finalState.recentWidgets.length, MAX_RECENT_WIDGETS); // saturated at 10
      assert(finalState.eventHistory.length <= MAX_EVENT_HISTORY);
      assert.equal(finalState.eventHistory.length, MAX_EVENT_HISTORY); // saturated at 50
    });
  });

  describe("Event Listener Lifecycle & Churn Test", () => {
    it("subscribes and unsubscribes 1,000 times without leaking listeners", () => {
      const stores = [
        timerStore,
        mediaStore,
        clipboardStore,
        fileStore,
        dropStore,
        systemStore,
        reminderStore,
      ];

      let totalNotifications = 0;

      for (let cycle = 0; cycle < 1000; cycle++) {
        const unsubs = stores.map((store) => {
          return store.subscribe(() => {
            totalNotifications++;
          });
        });

        // Trigger one store update per cycle
        if (cycle % 10 === 0) {
          timerStore.setState((prev) => ({ ...prev }));
        }

        // Clean up all subscriptions immediately
        unsubs.forEach((unsub) => unsub());
      }

      // Reset counter and verify that after all 1,000 unsubscriptions, no listeners remain
      totalNotifications = 0;
      stores.forEach((store) => {
        store.setState((prev) => ({ ...prev }));
      });

      // Since all 1,000 unsubscribed, notifications must be strictly 0
      assert.equal(totalNotifications, 0, "No notifications should be received after unsubscribe");
    });
  });

  describe("Smart Search Bounded Output & Throughput Budget", () => {
    it("executes 1,000 searches within strict budget limits and latency", () => {
      // Build a realistic pool of 100 candidate items
      const candidateItems: LauncherItem[] = Array.from({ length: 100 }, (_, idx) => ({
        id: `item_${idx}`,
        title: `Application Tool ${idx} - Utility`,
        subtitle: `System category ${idx % 5}`,
        keywords: [`keyword_${idx % 10}`, "tool", "productivity"],
        icon: "⚡",
        action: { type: "system_action", action: "test" },
      }));

      const queries = ["tool", "app", "util", "work", "5", "system", "xyz", "prod"];
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        const q = queries[i % queries.length];
        const results = searchLauncherItems(q, candidateItems, new Set<string>(), new Set<string>());

        // Strict limit: at most 20 results per query
        assert(
          results.length <= 20,
          `Search results exceeded max budget 20, got ${results.length}`
        );
      }

      const totalTimeMs = performance.now() - startTime;
      const avgLatencyMs = totalTimeMs / 1000;

      // In-memory search must average well under 1ms per query
      assert(
        avgLatencyMs < 1.0,
        `Average search latency exceeded 1.0ms: was ${avgLatencyMs}ms`
      );
    });
  });
});
