import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  timerStore,
  initializeTimerStore,
  isTimerStoreInitialized,
  setTimerSession,
  defaultTimerSession,
} from "../src/state/timerState.ts";
import {
  launcherStore,
  initializeLauncherStore,
  isLauncherStoreInitialized,
  setSearchQuery,
  setSelectedIndex,
} from "../src/state/launcherState.ts";
import {
  dropStore,
  initializeDropStore,
  isDropStoreInitialized,
  clearDrop,
  setSelectedActionIndex,
} from "../src/state/dropState.ts";
import {
  reminderStore,
  initializeReminderStore,
  isReminderStoreInitialized,
  setReminders,
} from "../src/state/reminderState.ts";
import {
  escapeManager,
  EscapePriority,
  EscapeManager,
} from "../src/island/escapeManager.ts";
import {
  systemStore,
  refreshSystemState,
  setSystemState,
  defaultSystemState,
} from "../src/state/systemState.ts";
import {
  normalizeStats,
  calculateGaugeDash,
} from "../src/components/widgets/statsModel.ts";
import type { SystemState, SystemCapabilities, TimerSession, DropBatch } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.7 — Phase 1: Event Lifecycle & Runtime Polling Hardening", () => {
  // =========================================================================
  // PHASE 1A: Event Subscription Lifecycle Regression Tests
  // =========================================================================
  describe("Phase 1A: Event Subscription Lifecycle", () => {
    describe("1. Static Inspection: No Unconditional Module-Level Event Subscriptions", () => {
      it("proves timerState.ts does not unconditionally subscribe at module import time", () => {
        const src = fs.readFileSync(
          path.join(ROOT_DIR, "apps/desktop/src/state/timerState.ts"),
          "utf8"
        );
        // Must export initializeTimerStore and not call subscribeToTimerChanged at top level
        assert.ok(src.includes("export async function initializeTimerStore"));
        assert.ok(!src.match(/^[ \t]*subscribeToTimerChanged\(/m), "Must not call subscribeToTimerChanged at root module scope");
      });

      it("proves launcherState.ts does not unconditionally subscribe at module import time", () => {
        const src = fs.readFileSync(
          path.join(ROOT_DIR, "apps/desktop/src/state/launcherState.ts"),
          "utf8"
        );
        assert.ok(src.includes("export async function initializeLauncherStore"));
        assert.ok(!src.match(/^[ \t]*subscribeToLauncherChanged\(/m), "Must not call subscribeToLauncherChanged at root module scope");
      });

      it("proves dropState.ts does not unconditionally subscribe at module import time", () => {
        const src = fs.readFileSync(
          path.join(ROOT_DIR, "apps/desktop/src/state/dropState.ts"),
          "utf8"
        );
        assert.ok(src.includes("export async function initializeDropStore"));
        assert.ok(!src.match(/^[ \t]*subscribeToDropChanged\(/m), "Must not call subscribeToDropChanged at root module scope");
      });

      it("proves reminderState.ts does not unconditionally subscribe at module import time", () => {
        const src = fs.readFileSync(
          path.join(ROOT_DIR, "apps/desktop/src/state/reminderState.ts"),
          "utf8"
        );
        assert.ok(src.includes("export async function initializeReminderStore"));
        assert.ok(!src.match(/^[ \t]*subscribeToReminderChanged\(/m), "Must not call subscribeToReminderChanged at root module scope");
      });

      it("proves Island.tsx explicitly initializes and manages cleanups for all audited stores", () => {
        const islandSrc = fs.readFileSync(
          path.join(ROOT_DIR, "apps/desktop/src/components/island/Island.tsx"),
          "utf8"
        );
        assert.ok(islandSrc.includes("initializeTimerStore()"));
        assert.ok(islandSrc.includes("initializeLauncherStore()"));
        assert.ok(islandSrc.includes("initializeDropStore()"));
        assert.ok(islandSrc.includes("initializeReminderStore()"));
      });
    });

    describe("2. Timer Store Lifecycle & Idempotency", () => {
      it("registers listeners and initializes store idempotently", async () => {
        const cleanup1 = await initializeTimerStore();
        assert.strictEqual(typeof cleanup1, "function");
        assert.strictEqual(isTimerStoreInitialized(), true);

        // Repeated initialization does not duplicate subscriptions
        const cleanup2 = await initializeTimerStore();
        assert.strictEqual(typeof cleanup2, "function");
        assert.strictEqual(isTimerStoreInitialized(), true);

        // Cleanup one subscriber; store remains active for remaining subscriber
        cleanup1();
        assert.strictEqual(isTimerStoreInitialized(), true);

        // Calling cleanup1 again is idempotent and harmless
        cleanup1();
        assert.strictEqual(isTimerStoreInitialized(), true);

        // Final cleanup tears down listener
        cleanup2();
        assert.strictEqual(isTimerStoreInitialized(), false);

        // Re-initialization after cleanup works cleanly
        const cleanup3 = await initializeTimerStore();
        assert.strictEqual(isTimerStoreInitialized(), true);
        cleanup3();
        assert.strictEqual(isTimerStoreInitialized(), false);
      });

      it("preserves existing timer store operations", () => {
        const mockSession: TimerSession = {
          id: "timer-1",
          mode: "Countdown",
          state: "Running",
          started_at: 1000,
          paused_at: null,
          target_at: 60000,
          duration_ms: 60000,
          remaining_ms: 30000,
          pomodoro_phase: null,
          completed_cycles: 0,
        };

        setTimerSession(mockSession);
        assert.strictEqual(timerStore.getState().session.id, "timer-1");

        setTimerSession(defaultTimerSession);
        assert.strictEqual(timerStore.getState().session.id, "timer_session_default");
      });
    });

    describe("3. Launcher Store Lifecycle & Idempotency", () => {
      it("registers listeners and initializes store idempotently", async () => {
        const cleanup1 = await initializeLauncherStore();
        assert.strictEqual(typeof cleanup1, "function");
        assert.strictEqual(isLauncherStoreInitialized(), true);

        const cleanup2 = await initializeLauncherStore();
        assert.strictEqual(isLauncherStoreInitialized(), true);

        cleanup1();
        assert.strictEqual(isLauncherStoreInitialized(), true);

        cleanup2();
        assert.strictEqual(isLauncherStoreInitialized(), false);

        // Re-initialize
        const cleanup3 = await initializeLauncherStore();
        assert.strictEqual(isLauncherStoreInitialized(), true);
        cleanup3();
        assert.strictEqual(isLauncherStoreInitialized(), false);
      });

      it("preserves existing launcher store operations", () => {
        setSearchQuery("terminal");
        assert.strictEqual(launcherStore.getState().searchQuery, "terminal");

        setSelectedIndex(3);
        assert.strictEqual(launcherStore.getState().selectedIndex, 3);

        setSearchQuery("");
        assert.strictEqual(launcherStore.getState().searchQuery, "");
        assert.strictEqual(launcherStore.getState().selectedIndex, 0);
      });
    });

    describe("4. Drop Store Lifecycle & Idempotency", () => {
      it("registers listeners and initializes store idempotently", async () => {
        const cleanup1 = await initializeDropStore();
        assert.strictEqual(typeof cleanup1, "function");
        assert.strictEqual(isDropStoreInitialized(), true);

        const cleanup2 = await initializeDropStore();
        assert.strictEqual(isDropStoreInitialized(), true);

        cleanup1();
        assert.strictEqual(isDropStoreInitialized(), true);

        cleanup2();
        assert.strictEqual(isDropStoreInitialized(), false);

        const cleanup3 = await initializeDropStore();
        assert.strictEqual(isDropStoreInitialized(), true);
        cleanup3();
        assert.strictEqual(isDropStoreInitialized(), false);
      });

      it("preserves existing drop store operations", () => {
        setSelectedActionIndex(2);
        assert.strictEqual(dropStore.getState().selectedActionIndex, 2);

        clearDrop();
        assert.strictEqual(dropStore.getState().currentBatch, null);
        assert.strictEqual(dropStore.getState().actions.length, 0);
      });
    });

    describe("5. Reminder Store Lifecycle & Idempotency", () => {
      it("registers listeners and initializes store idempotently", async () => {
        const cleanup1 = await initializeReminderStore();
        assert.strictEqual(typeof cleanup1, "function");
        assert.strictEqual(isReminderStoreInitialized(), true);

        const cleanup2 = await initializeReminderStore();
        assert.strictEqual(isReminderStoreInitialized(), true);

        cleanup1();
        assert.strictEqual(isReminderStoreInitialized(), true);

        cleanup2();
        assert.strictEqual(isReminderStoreInitialized(), false);

        const cleanup3 = await initializeReminderStore();
        assert.strictEqual(isReminderStoreInitialized(), true);
        cleanup3();
        assert.strictEqual(isReminderStoreInitialized(), false);
      });

      it("preserves existing reminder store operations", () => {
        setReminders([
          {
            id: "rem-1",
            title: "Standup",
            notes: null,
            target_epoch: Date.now() + 60000,
            repeat_rule: null,
            status: "active",
            created_at: Date.now(),
          },
        ]);
        assert.strictEqual(reminderStore.getState().reminders.length, 1);
        assert.strictEqual(reminderStore.getState().reminders[0].title, "Standup");
      });
    });
  });

  // =========================================================================
  // PHASE 1B: Centralized Escape Key Precedence Tests
  // =========================================================================
  describe("Phase 1B: Centralized Escape Key Precedence", () => {
    let localManager: EscapeManager;

    beforeEach(() => {
      localManager = new EscapeManager();
    });

    afterEach(() => {
      localManager.reset();
    });

    it("verifies EscapePriority constant levels", () => {
      assert.ok(EscapePriority.MODAL > EscapePriority.CONTEXT_MENU);
      assert.ok(EscapePriority.CONTEXT_MENU > EscapePriority.DROPDOWN);
      assert.ok(EscapePriority.DROPDOWN > EscapePriority.CHILD_INTERACTION);
      assert.ok(EscapePriority.CHILD_INTERACTION > EscapePriority.INPUT);
      assert.ok(EscapePriority.INPUT > EscapePriority.ISLAND_FALLBACK);
    });

    it("A. Escape with active Drop Shelf: clears drop shelf and prevents parent Island collapse", () => {
      let islandCollapsed = false;
      let dropShelfCleared = false;

      // Register parent Island fallback handler
      localManager.register(() => {
        islandCollapsed = true;
        return true;
      }, EscapePriority.ISLAND_FALLBACK);

      // Register active Drop Shelf child handler
      localManager.register(() => {
        dropShelfCleared = true;
        return true; // Consumed
      }, EscapePriority.CHILD_INTERACTION);

      const consumed = localManager.dispatchEscape();

      assert.strictEqual(consumed, true, "Event must be consumed");
      assert.strictEqual(dropShelfCleared, true, "Drop shelf must be cleared");
      assert.strictEqual(islandCollapsed, false, "Island must NOT collapse when child consumes Escape");
    });

    it("B. Escape with no active Drop Shelf: collapses Island normally", () => {
      let islandCollapsed = false;

      // Only parent Island fallback is registered
      localManager.register(() => {
        islandCollapsed = true;
        return true;
      }, EscapePriority.ISLAND_FALLBACK);

      const consumed = localManager.dispatchEscape();

      assert.strictEqual(consumed, true, "Event must be consumed by Island fallback");
      assert.strictEqual(islandCollapsed, true, "Island must collapse when no child interaction consumes");
    });

    it("C. Escape from a text input: consumes if non-empty, bubbles to collapse if empty", () => {
      let islandCollapsed = false;
      let query = "my-search";

      localManager.register(() => {
        islandCollapsed = true;
        return true;
      }, EscapePriority.ISLAND_FALLBACK);

      // Simulates active input handler registered or checked
      const unregisterInput = localManager.register(() => {
        if (query.length > 0) {
          query = "";
          return true; // Consumed: cleared input text
        }
        return false; // Did not consume: allow fallback to collapse
      }, EscapePriority.INPUT);

      // First Escape: input has text
      let consumed = localManager.dispatchEscape();
      assert.strictEqual(consumed, true);
      assert.strictEqual(query, "");
      assert.strictEqual(islandCollapsed, false, "Island must NOT collapse on first Escape when input had text");

      // Second Escape: input is now empty
      consumed = localManager.dispatchEscape();
      assert.strictEqual(consumed, true);
      assert.strictEqual(islandCollapsed, true, "Island must collapse on second Escape when input is empty");

      unregisterInput();
    });

    it("D. repeated Escape behavior: first clears active interaction, second collapses Island", () => {
      let islandCollapsed = false;
      let activeBatch: DropBatch | null = {
        batch_id: "batch-1",
        files: [],
        timestamp: 1000,
        count: 2,
        total_size_bytes: 4096,
        is_directory: false,
        detected_types: [],
      };

      // Island fallback
      localManager.register(() => {
        islandCollapsed = true;
        return true;
      }, EscapePriority.ISLAND_FALLBACK);

      // Drop shelf handler
      let unregisterDrop: (() => void) | null = null;
      const registerDropIfNeeded = () => {
        if (activeBatch && !unregisterDrop) {
          unregisterDrop = localManager.register(() => {
            activeBatch = null;
            if (unregisterDrop) {
              unregisterDrop();
              unregisterDrop = null;
            }
            return true; // Consumed
          }, EscapePriority.CHILD_INTERACTION);
        }
      };

      registerDropIfNeeded();

      // First Escape: Drop Shelf active
      let consumed = localManager.dispatchEscape();
      assert.strictEqual(consumed, true);
      assert.strictEqual(activeBatch, null, "First Escape must clear the active batch");
      assert.strictEqual(islandCollapsed, false, "First Escape must NOT collapse the island");

      // Second Escape: Drop Shelf empty
      consumed = localManager.dispatchEscape();
      assert.strictEqual(consumed, true);
      assert.strictEqual(islandCollapsed, true, "Second Escape must collapse the island");
    });

    it("E. child Escape consumption prevents parent collapse regardless of registration order", () => {
      // Order 1: Register child BEFORE island fallback
      const mgr1 = new EscapeManager();
      let parent1Collapsed = false;
      let child1Handled = false;

      mgr1.register(() => {
        child1Handled = true;
        return true;
      }, EscapePriority.CHILD_INTERACTION);

      mgr1.register(() => {
        parent1Collapsed = true;
        return true;
      }, EscapePriority.ISLAND_FALLBACK);

      mgr1.dispatchEscape();
      assert.strictEqual(child1Handled, true);
      assert.strictEqual(parent1Collapsed, false);

      // Order 2: Register island fallback BEFORE child
      const mgr2 = new EscapeManager();
      let parent2Collapsed = false;
      let child2Handled = false;

      mgr2.register(() => {
        parent2Collapsed = true;
        return true;
      }, EscapePriority.ISLAND_FALLBACK);

      mgr2.register(() => {
        child2Handled = true;
        return true;
      }, EscapePriority.CHILD_INTERACTION);

      mgr2.dispatchEscape();
      assert.strictEqual(child2Handled, true);
      assert.strictEqual(parent2Collapsed, false);
    });

    it("unregisters handlers cleanly and idempotently", () => {
      let callCount = 0;
      const unregister = localManager.register(() => {
        callCount++;
        return true;
      }, EscapePriority.MODAL);

      assert.strictEqual(localManager.getCount(), 1);

      localManager.dispatchEscape();
      assert.strictEqual(callCount, 1);

      // Unregister
      unregister();
      assert.strictEqual(localManager.getCount(), 0);

      // Double unregister is safe
      unregister();
      assert.strictEqual(localManager.getCount(), 0);

      // Dispatch after unregister does not invoke handler
      const consumed = localManager.dispatchEscape();
      assert.strictEqual(consumed, false);
      assert.strictEqual(callCount, 1);
    });
  });

  // =========================================================================
  // PHASE 1C: Remove System Widget Polling & Zero-Polling Hardening Tests
  // =========================================================================
  describe("Phase 1C: Remove System Widget Polling", () => {
    const systemWidgetPath = path.join(
      ROOT_DIR,
      "apps/desktop/src/components/widgets/SystemWidget.tsx"
    );
    const systemWidgetSrc = fs.readFileSync(systemWidgetPath, "utf8");

    it("proves SystemWidget does not contain setInterval", () => {
      assert.ok(
        !systemWidgetSrc.includes("setInterval"),
        "SystemWidget.tsx must not contain any setInterval calls"
      );
    });

    it("proves SystemWidget does not contain requestAnimationFrame", () => {
      assert.ok(
        !systemWidgetSrc.includes("requestAnimationFrame"),
        "SystemWidget.tsx must not contain any requestAnimationFrame calls"
      );
    });

    it("proves SystemWidget does not contain a recursive setTimeout polling loop", () => {
      // Must not contain scheduleNextSample or recursive timeout schedule
      assert.ok(
        !systemWidgetSrc.includes("scheduleNextSample"),
        "SystemWidget.tsx must not contain recursive scheduleNextSample"
      );
      assert.ok(
        !systemWidgetSrc.includes("setTimeout(async () =>"),
        "SystemWidget.tsx must not contain periodic setTimeout polling loop"
      );
      assert.ok(
        !systemWidgetSrc.includes("3000"),
        "SystemWidget.tsx must not contain the ~3000ms polling interval"
      );
    });

    it("verifies any remaining setTimeout in SystemWidget is exclusively for manual button cooldown UX", () => {
      const timeoutMatches = systemWidgetSrc.match(/setTimeout\(/g) || [];
      // Only 1 one-shot setTimeout allowed: manual button cooldown (cooldownTimerRef)
      assert.strictEqual(
        timeoutMatches.length,
        1,
        "SystemWidget must only contain 1 setTimeout, strictly for manual snapshot cooldown"
      );
      assert.ok(
        systemWidgetSrc.includes("cooldownTimerRef"),
        "The single allowed setTimeout must be for cooldownTimerRef"
      );
      assert.ok(
        systemWidgetSrc.includes("remainingCooldown"),
        "The single allowed setTimeout must be calculated from remainingCooldown"
      );
    });

    it("verifies SystemWidget subscribes to backend system change events with clean unlisten", () => {
      assert.ok(
        systemWidgetSrc.includes("subscribeToSystemChanged("),
        "SystemWidget must subscribe to backend system change events"
      );
      assert.ok(
        systemWidgetSrc.includes("unlisten()"),
        "SystemWidget must clean up subscription upon unmount"
      );
    });

    it("verifies metrics normalize and update correctly when event-driven telemetry arrives", () => {
      const mockState: SystemState = {
        ...defaultSystemState,
        cpu: {
          usage_percent: 24.5,
          frequency_mhz: 3200,
          core_count: 8,
          brand: "Intel Core i7",
        },
        memory: {
          used_bytes: 8 * 1024 * 1024 * 1024,
          total_bytes: 16 * 1024 * 1024 * 1024,
          usage_percent: 50.0,
        },
        battery: {
          available: true,
          percentage: 85,
          charging: false,
          plugged_in: true,
          power_source: "AC",
        },
        network: {
          connected: true,
          interface_name: "Wi-Fi",
          connection_type: "wifi",
          signal_strength: 90,
        },
      };

      const mockCapabilities: SystemCapabilities = {
        battery_supported: true,
        network_supported: true,
        cpu_supported: true,
        memory_supported: true,
        volume_supported: true,
      };

      // Push telemetry into system store
      setSystemState(mockState);
      assert.strictEqual(systemStore.getState().system.cpu?.usage_percent, 24.5);

      const stats = normalizeStats(systemStore.getState().system, mockCapabilities);
      assert.strictEqual(stats.cpu.usagePercent, 25);
      assert.strictEqual(stats.cpu.available, true);
      assert.strictEqual(stats.memory.usagePercent, 50.0);
      assert.strictEqual(stats.memory.available, true);
      assert.strictEqual(stats.battery.percentage, 85);
      assert.strictEqual(stats.battery.available, true);
      assert.strictEqual(stats.network.connected, true);
      assert.strictEqual(stats.network.connectionType, "wifi");

      const cpuDash = calculateGaugeDash(36, stats.cpu.usagePercent);
      assert.ok(cpuDash.circumference > 0);
      assert.ok(typeof cpuDash.dashOffset === "number");
    });
  });
});
