import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatStopwatchDisplay,
  parseAndValidateCountdown,
  parseAndValidatePomodoro,
} from "../src/components/widgets/productivityModel.ts";
import {
  TimerNotificationCoordinator,
} from "../src/state/timerNotification.ts";
import type { TimerSession } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.2 — FAZ 3: Timer / Stopwatch / Pomodoro UX, Layout and Notification Hardening", () => {
  let coordinator: TimerNotificationCoordinator;

  beforeEach(() => {
    coordinator = new TimerNotificationCoordinator();
  });

  describe("1. Countdown — Separate Minutes & Seconds Controls", () => {
    it("allows independent minute and second configuration", () => {
      const parsed = parseAndValidateCountdown("5", "30");
      assert.strictEqual(parsed.valid, true);
      assert.strictEqual(parsed.minutes, 5);
      assert.strictEqual(parsed.seconds, 30);
      assert.strictEqual(parsed.durationMs, (5 * 60 + 30) * 1000);
    });

    it("enforces second bounds 0 to 59", () => {
      const validZero = parseAndValidateCountdown(10, 0);
      assert.strictEqual(validZero.valid, true);
      assert.strictEqual(validZero.seconds, 0);

      const validMax = parseAndValidateCountdown(10, 59);
      assert.strictEqual(validMax.valid, true);
      assert.strictEqual(validMax.seconds, 59);

      const invalidOver = parseAndValidateCountdown(10, 60);
      assert.strictEqual(invalidOver.valid, false);
      assert.match(invalidOver.reason ?? "", /between 0 and 59/i);

      const invalidNeg = parseAndValidateCountdown(10, -1);
      assert.strictEqual(invalidNeg.valid, false);
      assert.match(invalidNeg.reason ?? "", /between 0 and 59/i);
    });

    it("enforces safe safe upper bound for minutes and rejects negative values", () => {
      const validSafeMax = parseAndValidateCountdown(1440, 0);
      assert.strictEqual(validSafeMax.valid, true);

      const overMax = parseAndValidateCountdown(1441, 0);
      assert.strictEqual(overMax.valid, false);
      assert.match(overMax.reason ?? "", /between 0 and 1440/i);

      const negativeMin = parseAndValidateCountdown(-5, 30);
      assert.strictEqual(negativeMin.valid, false);
      assert.match(negativeMin.reason ?? "", /between 0 and 1440/i);
    });

    it("calculates accurate total duration in milliseconds", () => {
      const res = parseAndValidateCountdown("12", "45");
      assert.strictEqual(res.durationMs, (12 * 60 + 45) * 1000);
    });
  });

  describe("2. Countdown — Desktop Notification Invariants", () => {
    const baseCountdownSession: TimerSession = {
      id: "countdown-test-1",
      mode: "Countdown",
      state: "Completed",
      started_at: 1000,
      paused_at: null,
      target_at: 61000,
      duration_ms: 60000,
      remaining_ms: 0,
      pomodoro_phase: null,
      completed_cycles: 0,
    };

    it("triggers exactly one notification on countdown completion", () => {
      const notif1 = coordinator.evaluate(baseCountdownSession);
      assert.ok(notif1, "First completion must generate notification");
      assert.strictEqual(notif1.title, "Countdown");
      assert.strictEqual(notif1.body, "Countdown completed.");

      // Duplicate evaluation of the same session must return null
      const notif2 = coordinator.evaluate(baseCountdownSession);
      assert.strictEqual(notif2, null, "Second completion evaluation must be suppressed");
    });

    it("does not generate notification when session is paused", () => {
      const pausedSession: TimerSession = {
        ...baseCountdownSession,
        state: "Paused",
        remaining_ms: 30000,
      };
      const notif = coordinator.evaluate(pausedSession);
      assert.strictEqual(notif, null, "Paused session must never produce a notification");
    });

    it("does not generate notification when session is running or idle", () => {
      const runningSession: TimerSession = {
        ...baseCountdownSession,
        state: "Running",
        remaining_ms: 45000,
      };
      assert.strictEqual(coordinator.evaluate(runningSession), null);

      const idleSession: TimerSession = {
        ...baseCountdownSession,
        state: "Idle",
      };
      assert.strictEqual(coordinator.evaluate(idleSession), null);
    });

    it("resets suppression set cleanly when coordinator is reset", () => {
      coordinator.evaluate(baseCountdownSession);
      coordinator.reset();
      const notifAfterReset = coordinator.evaluate(baseCountdownSession);
      assert.ok(notifAfterReset, "After reset, completion can notify again");
    });
  });

  describe("3. Stopwatch — Removal of Circular Container & Centisecond Accuracy", () => {
    it("formats centisecond accuracy as HH:MM:SS.cs", () => {
      // 00:03:27.42 = (3 * 60 + 27) * 1000 + 420 ms
      const testMs = (3 * 60 + 27) * 1000 + 420;
      assert.strictEqual(formatStopwatchDisplay(testMs), "00:03:27.42");

      // 0 ms
      assert.strictEqual(formatStopwatchDisplay(0), "00:00:00.00");

      // Long duration (e.g. 15 hours 42 minutes 19 seconds and 80 centiseconds)
      const longMs = (15 * 3600 + 42 * 60 + 19) * 1000 + 800;
      assert.strictEqual(formatStopwatchDisplay(longMs), "15:42:19.80");
    });

    it("verifies CSS and component architecture removes circular container for stopwatch", () => {
      const cssPath = path.resolve(ROOT_DIR, "apps/desktop/src/styles/index.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      // Verify no circular border or width constraint on stopwatch display
      assert.match(
        cssContent,
        /\.bbq-stopwatch-display-container\s*\{[^}]*border:\s*none/s,
        "Stopwatch container must have border: none"
      );
      assert.match(
        cssContent,
        /\.bbq-stopwatch-display-container\s*\{[^}]*border-radius:\s*0/s,
        "Stopwatch container must not have circular border-radius"
      );

      // Verify TimerWidget.tsx mounts StopwatchReadout for stopwatch mode
      const widgetPath = path.resolve(ROOT_DIR, "apps/desktop/src/components/widgets/TimerWidget.tsx");
      const widgetContent = fs.readFileSync(widgetPath, "utf-8");
      assert.match(
        widgetContent,
        /<StopwatchReadout\s+session=\{session\}\s*\/>/,
        "TimerWidget must use dedicated StopwatchReadout leaf component"
      );
    });
  });

  describe("4. Pomodoro — Separate Work & Break Controls", () => {
    it("allows independent work and break minute/second adjustments", () => {
      const res = parseAndValidatePomodoro("25", "30", "5", "15");
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.workMs, (25 * 60 + 30) * 1000);
      assert.strictEqual(res.breakMs, (5 * 60 + 15) * 1000);
    });

    it("validates seconds are within 0-59 and minutes are non-negative", () => {
      const resInvalidWorkSec = parseAndValidatePomodoro("25", "60", "5", "0");
      assert.strictEqual(resInvalidWorkSec.valid, false);
      assert.match(resInvalidWorkSec.reason ?? "", /Seconds must be between 0 and 59/);

      const resInvalidBreakSec = parseAndValidatePomodoro("25", "0", "5", "-2");
      assert.strictEqual(resInvalidBreakSec.valid, false);
      assert.match(resInvalidBreakSec.reason ?? "", /Seconds must be between 0 and 59/);

      const resInvalidMin = parseAndValidatePomodoro("-1", "0", "5", "0");
      assert.strictEqual(resInvalidMin.valid, false);
      assert.match(resInvalidMin.reason ?? "", /Minutes must be between 0 and 1440/);
    });
  });

  describe("5. Pomodoro — Phase Transition Desktop Notifications", () => {
    it("sends exactly one notification for Work -> Break transition", () => {
      const workCompleteSession: TimerSession = {
        id: "pomo-sess-1",
        mode: "Pomodoro",
        state: "Completed",
        started_at: 1000,
        paused_at: null,
        target_at: 1501000,
        duration_ms: 1500000,
        remaining_ms: 0,
        pomodoro_phase: "Work",
        completed_cycles: 0,
      };

      const notif = coordinator.evaluate(workCompleteSession);
      assert.ok(notif);
      assert.strictEqual(notif.title, "Pomodoro");
      assert.strictEqual(notif.body, "Focus session complete. Time for a well-deserved break!");

      // Duplicate check
      assert.strictEqual(coordinator.evaluate(workCompleteSession), null);
    });

    it("sends exactly one notification for Break -> Work transition", () => {
      const breakCompleteSession: TimerSession = {
        id: "pomo-sess-1",
        mode: "Pomodoro",
        state: "Completed",
        started_at: 1501000,
        paused_at: null,
        target_at: 1801000,
        duration_ms: 300000,
        remaining_ms: 0,
        pomodoro_phase: "ShortBreak",
        completed_cycles: 1,
      };

      const notif = coordinator.evaluate(breakCompleteSession);
      assert.ok(notif);
      assert.strictEqual(notif.title, "Pomodoro");
      assert.strictEqual(notif.body, "Break ended. Ready to focus again!");

      // Duplicate check
      assert.strictEqual(coordinator.evaluate(breakCompleteSession), null);
    });

    it("does not send notification during pause or reset", () => {
      const pausedPomo: TimerSession = {
        id: "pomo-sess-2",
        mode: "Pomodoro",
        state: "Paused",
        started_at: 1000,
        paused_at: 50000,
        target_at: 1501000,
        duration_ms: 1500000,
        remaining_ms: 100000,
        pomodoro_phase: "Work",
        completed_cycles: 0,
      };
      assert.strictEqual(coordinator.evaluate(pausedPomo), null);
    });
  });

  describe("6. Timer Tab Layout & Vertical Stability", () => {
    it("verifies stable shell height and top-aligned tab bar across mode switches", () => {
      const shellPath = path.resolve(ROOT_DIR, "apps/desktop/src/components/island/IslandShell.tsx");
      const shellContent = fs.readFileSync(shellPath, "utf-8");

      // Verify island shell enforces fixed height for expanded mode
      assert.match(
        shellContent,
        /height:\s*expHeight/,
        "IslandShell must enforce fixed expanded height to prevent vertical jitter"
      );

      const cssPath = path.resolve(ROOT_DIR, "apps/desktop/src/styles/index.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      // Verify TimerWidget flex layout guarantees top-anchored tab bar
      assert.match(
        cssContent,
        /\.bbq-timer-widget\s*\{[^}]*justify-content:\s*flex-start/s,
        "Timer widget must top-align content"
      );
      assert.match(
        cssContent,
        /\.bbq-timer-mode-bar\s*\{[^}]*flex-shrink:\s*0/s,
        "Timer mode bar must have flex-shrink: 0"
      );
      assert.match(
        cssContent,
        /\.bbq-timer-content-body\s*\{[^}]*flex:\s*1/s,
        "Content body must fill remaining space"
      );
    });
  });
});
