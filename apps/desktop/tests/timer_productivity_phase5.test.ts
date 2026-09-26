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

describe("BBQ v2.1 — Phase 5: Timer, Pomodoro, and Stopwatch Contracts", () => {
  describe("5A. Countdown Separate Minutes & Seconds Validation", () => {
    it("accepts valid countdown inputs within bounds", () => {
      const res1 = parseAndValidateCountdown(5, 30);
      assert.strictEqual(res1.valid, true);
      assert.strictEqual(res1.durationMs, (5 * 60 + 30) * 1000);
      assert.strictEqual(res1.minutes, 5);
      assert.strictEqual(res1.seconds, 30);

      const res2 = parseAndValidateCountdown("1440", "0");
      assert.strictEqual(res2.valid, true);
      assert.strictEqual(res2.durationMs, 1440 * 60 * 1000);

      const res3 = parseAndValidateCountdown(0, 45);
      assert.strictEqual(res3.valid, true);
      assert.strictEqual(res3.durationMs, 45 * 1000);
    });

    it("rejects 0:0 with explicit reason", () => {
      const res = parseAndValidateCountdown(0, 0);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.reason, "0:0 cannot start");

      const resStr = parseAndValidateCountdown("0", "0");
      assert.strictEqual(resStr.valid, false);
      assert.strictEqual(resStr.reason, "0:0 cannot start");
    });

    it("rejects out of bounds minutes (>1440 or <0)", () => {
      const resOver = parseAndValidateCountdown(1441, 0);
      assert.strictEqual(resOver.valid, false);
      assert.match(resOver.reason ?? "", /between 0 and 1440/);

      const resNeg = parseAndValidateCountdown(-1, 30);
      assert.strictEqual(resNeg.valid, false);
      assert.match(resNeg.reason ?? "", /between 0 and 1440/);
    });

    it("rejects out of bounds seconds (>59 or <0)", () => {
      const resOver = parseAndValidateCountdown(5, 60);
      assert.strictEqual(resOver.valid, false);
      assert.match(resOver.reason ?? "", /between 0 and 59/);

      const resNeg = parseAndValidateCountdown(5, -5);
      assert.strictEqual(resNeg.valid, false);
      assert.match(resNeg.reason ?? "", /between 0 and 59/);
    });

    it("rejects non-numeric inputs safely", () => {
      const resNaN = parseAndValidateCountdown("abc", 0);
      assert.strictEqual(resNaN.valid, false);
      assert.match(resNaN.reason ?? "", /must be numbers/);
    });
  });

  describe("5B. Pomodoro Separate Work and Break Inputs & Notifications", () => {
    it("accepts valid work and break inputs", () => {
      const res = parseAndValidatePomodoro(25, 0, 5, 0);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.workMs, 25 * 60 * 1000);
      assert.strictEqual(res.breakMs, 5 * 60 * 1000);
    });

    it("rejects 0:0 work duration", () => {
      const res = parseAndValidatePomodoro(0, 0, 5, 0);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.reason, "Work interval 0:0 cannot start");
    });

    it("rejects 0:0 break duration", () => {
      const res = parseAndValidatePomodoro(25, 0, 0, 0);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.reason, "Break interval 0:0 cannot start");
    });

    it("strictly verifies the required Pomodoro notification strings in Rust", () => {
      const eventsRsPath = path.join(ROOT_DIR, "apps/desktop/src-tauri/src/events.rs");
      const content = fs.readFileSync(eventsRsPath, "utf-8");

      assert.ok(
        content.includes("Focus session complete. Time for a well-deserved break!"),
        "Must contain required work complete notification body"
      );
      assert.ok(
        content.includes("Break ended. Ready to focus again!"),
        "Must contain required break complete notification body"
      );
    });
  });

  describe("5C. Stopwatch MM:SS.SS Display & Monotonic Elapsed Time", () => {
    it("formats 0ms into 00:00.00", () => {
      assert.strictEqual(formatStopwatchDisplay(0), "00:00.00");
    });

    it("formats minutes, seconds, and hundredths correctly", () => {
      // 1 minute, 5 seconds, 430 milliseconds -> 01:05.43
      const ms = (1 * 60 + 5) * 1000 + 430;
      assert.strictEqual(formatStopwatchDisplay(ms), "01:05.43");

      // 59 seconds, 990 ms -> 00:59.99
      assert.strictEqual(formatStopwatchDisplay(59990), "00:59.99");

      // 12 minutes, 34 seconds, 560 ms -> 12:34.56
      const ms2 = (12 * 60 + 34) * 1000 + 560;
      assert.strictEqual(formatStopwatchDisplay(ms2), "12:34.56");
    });

    it("handles negative or invalid values gracefully without throwing", () => {
      assert.strictEqual(formatStopwatchDisplay(-100), "00:00.00");
      assert.strictEqual(formatStopwatchDisplay(NaN), "00:00.00");
    });
  });
});
