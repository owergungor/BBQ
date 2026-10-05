import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatStopwatchDisplay,
  parseAndValidateCountdown,
  parseAndValidatePomodoro,
} from "../src/components/widgets/productivityModel.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.3 — Faz 3: Timer UI Layout & Apple Controls Regression Tests", () => {
  const timerWidgetSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/components/widgets/TimerWidget.tsx"),
    "utf8"
  );
  const cssSrc = fs.readFileSync(
    path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
    "utf8"
  );

  // =========================================================================
  // 1. Tab Position Invariant (Header / Tabs separated from content body)
  // =========================================================================
  describe("1. Tab Position Invariant", () => {
    it("ensures tabs are rendered in an isolated header container outside content body", () => {
      // Must have distinct bbq-timer-mode-bar container above bbq-timer-content-body
      assert.ok(
        timerWidgetSrc.includes('className="bbq-timer-mode-bar"'),
        "Must contain dedicated bbq-timer-mode-bar container"
      );
      assert.ok(
        timerWidgetSrc.includes('className="bbq-timer-content-body"'),
        "Must contain separate bbq-timer-content-body container"
      );

      const tabsIndex = timerWidgetSrc.indexOf('className="bbq-timer-mode-bar"');
      const bodyIndex = timerWidgetSrc.indexOf('className="bbq-timer-content-body"');
      assert.ok(
        tabsIndex < bodyIndex,
        "bbq-timer-mode-bar must be rendered strictly before bbq-timer-content-body"
      );
    });

    it("verifies all three modes (Countdown, Stopwatch, Pomodoro) exist with distinct tab triggers", () => {
      assert.ok(
        timerWidgetSrc.includes('id="timer-mode-countdown"'),
        "Must have countdown tab button"
      );
      assert.ok(
        timerWidgetSrc.includes('id="timer-mode-stopwatch"'),
        "Must have stopwatch tab button"
      );
      assert.ok(
        timerWidgetSrc.includes('id="timer-mode-pomodoro"'),
        "Must have pomodoro tab button"
      );
    });

    it("confirms CSS does not use dirty negative margins to fake tab alignment", () => {
      // Ensure no negative margin hacks on bbq-timer-tabs
      const hasNegativeMarginOnTabs = /\.bbq-timer-tabs\s*\{[^}]*margin-top:\s*-[0-9]+/i.test(cssSrc);
      assert.equal(
        hasNegativeMarginOnTabs,
        false,
        "CSS must not use negative margin hack on bbq-timer-tabs"
      );
    });
  });

  // =========================================================================
  // 2. Stopwatch — No Circle / Pure Digital Display
  // =========================================================================
  describe("2. Stopwatch — No Circle / Pure Digital Display", () => {
    it("proves Stopwatch mode bypasses SVG progress ring and renders StopwatchReadout directly", () => {
      assert.ok(
        timerWidgetSrc.includes('session.mode === "Stopwatch" ? ('),
        "Stopwatch mode must conditionally branch away from circular SVG centerpiece"
      );
      assert.ok(
        timerWidgetSrc.includes("<StopwatchReadout session={session} />"),
        "Stopwatch must render direct StopwatchReadout component"
      );
    });

    it("formats centisecond stopwatch values accurately", () => {
      assert.equal(formatStopwatchDisplay(0), "00:00:00.00");
      assert.equal(formatStopwatchDisplay(1230), "00:00:01.23");
      assert.equal(formatStopwatchDisplay(65430), "00:01:05.43");
      assert.equal(formatStopwatchDisplay(3665430), "01:01:05.43");
    });

    it("handles max and long boundary times without overflow or truncation", () => {
      // 59m 59s 990ms
      const fiftyNineMinutes = (59 * 60 + 59) * 1000 + 990;
      assert.equal(formatStopwatchDisplay(fiftyNineMinutes), "00:59:59.99");

      // 99 hours 59m 59s 990ms
      const ninetyNineHours = (99 * 3600 + 59 * 60 + 59) * 1000 + 990;
      assert.equal(formatStopwatchDisplay(ninetyNineHours), "99:59:59.99");
    });
  });

  // =========================================================================
  // 3. Countdown — Separate Minutes & Seconds Controls
  // =========================================================================
  describe("3. Countdown — Separate Minutes & Seconds Controls", () => {
    it("ensures Countdown configuration provides separate inputs for minutes and seconds", () => {
      assert.ok(
        timerWidgetSrc.includes('id="timer-custom-minutes-input"'),
        "Must contain separate minutes input"
      );
      assert.ok(
        timerWidgetSrc.includes('id="timer-custom-seconds-input"'),
        "Must contain separate seconds input"
      );
    });

    it("validates countdown duration parsing: valid minutes + seconds", () => {
      const res = parseAndValidateCountdown("5", "30");
      assert.equal(res.valid, true);
      assert.equal(res.durationMs, (5 * 60 + 30) * 1000);
      assert.equal(res.minutes, 5);
      assert.equal(res.seconds, 30);
    });

    it("rejects zero total duration with clear validation error", () => {
      const res = parseAndValidateCountdown("0", "0");
      assert.equal(res.valid, false);
      assert.ok(res.reason?.includes("cannot start"));
    });

    it("rejects negative minutes or negative seconds", () => {
      const resMin = parseAndValidateCountdown("-1", "30");
      assert.equal(resMin.valid, false);

      const resSec = parseAndValidateCountdown("5", "-10");
      assert.equal(resSec.valid, false);
    });

    it("rejects seconds >= 60", () => {
      const res = parseAndValidateCountdown("5", "60");
      assert.equal(res.valid, false);
      assert.ok(res.reason?.includes("Seconds must be between 0 and 59"));
    });
  });

  // =========================================================================
  // 4. Pomodoro — Separate Work & Break Minutes & Seconds Controls
  // =========================================================================
  describe("4. Pomodoro — Separate Work & Break Minutes & Seconds Controls", () => {
    it("ensures Pomodoro configuration provides separate inputs for work and break minutes/seconds", () => {
      assert.ok(
        timerWidgetSrc.includes('id="pomodoro-work-minutes"'),
        "Must contain pomodoro-work-minutes input"
      );
      assert.ok(
        timerWidgetSrc.includes('id="pomodoro-work-seconds"'),
        "Must contain pomodoro-work-seconds input"
      );
      assert.ok(
        timerWidgetSrc.includes('id="pomodoro-break-minutes"'),
        "Must contain pomodoro-break-minutes input"
      );
      assert.ok(
        timerWidgetSrc.includes('id="pomodoro-break-seconds"'),
        "Must contain pomodoro-break-seconds input"
      );
    });

    it("validates standard pomodoro configuration: 25m work + 5m break", () => {
      const res = parseAndValidatePomodoro("25", "0", "5", "0");
      assert.equal(res.valid, true);
      assert.equal(res.workMs, 25 * 60 * 1000);
      assert.equal(res.breakMs, 5 * 60 * 1000);
    });

    it("validates custom work/break with seconds: 50m 30s work + 10m 15s break", () => {
      const res = parseAndValidatePomodoro("50", "30", "10", "15");
      assert.equal(res.valid, true);
      assert.equal(res.workMs, (50 * 60 + 30) * 1000);
      assert.equal(res.breakMs, (10 * 60 + 15) * 1000);
    });

    it("rejects zero work duration", () => {
      const res = parseAndValidatePomodoro("0", "0", "5", "0");
      assert.equal(res.valid, false);
      assert.ok(res.reason?.includes("cannot start"));
    });

    it("rejects zero break duration", () => {
      const res = parseAndValidatePomodoro("25", "0", "0", "0");
      assert.equal(res.valid, false);
      assert.ok(res.reason?.includes("cannot start"));
    });
  });
});
