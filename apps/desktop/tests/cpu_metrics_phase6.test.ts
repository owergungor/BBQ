import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeStats,
  clampPercent,
} from "../src/components/widgets/statsModel.ts";
import type { SystemState, SystemCapabilities } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.1 — Phase 6: Process CPU Metrics Contracts", () => {
  const baseCaps: SystemCapabilities = {
    has_battery: true,
    can_read_network: true,
    can_read_cpu: true,
    can_read_memory: true,
    can_control_volume: true,
    can_mute: true,
  };

  describe("6A. Process CPU Normalization & Formatting", () => {
    it("reports first sample as graceful 0% baseline", () => {
      const state: SystemState = {
        battery: { available: true, percentage: 80, charging: false, plugged_in: false, time_remaining_seconds: null, power_source: null },
        network: { connected: true, connection_type: "wifi", interface_name: null, signal_strength: null },
        cpu: { usage_percent: 0.0, core_count: 8 },
        memory: { total_bytes: 16000000000, used_bytes: 8000000000, usage_percent: 50.0 },
        operating_system: "Windows",
        platform: "windows",
      };

      const normalized = normalizeStats(state, baseCaps);
      assert.strictEqual(normalized.cpu.available, true);
      assert.strictEqual(normalized.cpu.usagePercent, 0);
      assert.strictEqual(normalized.cpu.label, "0%");
    });

    it("prefers '<1%' label for very low process CPU (0 < cpu < 1) instead of misleading 0%", () => {
      const state: SystemState = {
        battery: { available: true, percentage: 80, charging: false, plugged_in: false, time_remaining_seconds: null, power_source: null },
        network: { connected: true, connection_type: "wifi", interface_name: null, signal_strength: null },
        cpu: { usage_percent: 0.15, core_count: 8 },
        memory: { total_bytes: 16000000000, used_bytes: 8000000000, usage_percent: 50.0 },
        operating_system: "Windows",
        platform: "windows",
      };

      const normalized = normalizeStats(state, baseCaps);
      assert.strictEqual(normalized.cpu.available, true);
      assert.strictEqual(normalized.cpu.label, "<1%");
    });

    it("formats nonzero load normally (e.g. 15.4% -> 15%)", () => {
      const state: SystemState = {
        battery: { available: true, percentage: 80, charging: false, plugged_in: false, time_remaining_seconds: null, power_source: null },
        network: { connected: true, connection_type: "wifi", interface_name: null, signal_strength: null },
        cpu: { usage_percent: 15.4, core_count: 8 },
        memory: { total_bytes: 16000000000, used_bytes: 8000000000, usage_percent: 50.0 },
        operating_system: "Windows",
        platform: "windows",
      };

      const normalized = normalizeStats(state, baseCaps);
      assert.strictEqual(normalized.cpu.available, true);
      assert.strictEqual(normalized.cpu.usagePercent, 15);
      assert.strictEqual(normalized.cpu.label, "15%");
    });

    it("normalizes multi-core capacity and bounds usage to 100%", () => {
      assert.strictEqual(clampPercent(120), 100);
      assert.strictEqual(clampPercent(-10), 0);
      assert.strictEqual(clampPercent(NaN), 0);
    });

    it("handles failed or unavailable CPU gracefully", () => {
      const stateNoCpu: SystemState = {
        battery: { available: true, percentage: 80, charging: false, plugged_in: false, time_remaining_seconds: null, power_source: null },
        network: { connected: true, connection_type: "wifi", interface_name: null, signal_strength: null },
        cpu: null,
        memory: null,
        operating_system: "Linux",
        platform: "linux",
      };

      const normalized = normalizeStats(stateNoCpu, { ...baseCaps, can_read_cpu: false });
      assert.strictEqual(normalized.cpu.available, false);
      assert.strictEqual(normalized.cpu.label, "0%");
    });
  });

  describe("6B. Rust Native Process CPU Implementation Verification", () => {
    it("proves Windows implementation uses GetCurrentProcess and GetProcessTimes (not GetSystemTimes)", () => {
      const windowsRsPath = path.join(ROOT_DIR, "crates/platform/src/windows.rs");
      const content = fs.readFileSync(windowsRsPath, "utf-8");

      assert.ok(
        content.includes("GetCurrentProcess"),
        "Must use GetCurrentProcess to measure host process CPU"
      );
      assert.ok(
        content.includes("GetProcessTimes"),
        "Must use GetProcessTimes to measure host process CPU"
      );
      assert.ok(
        !content.includes("GetSystemTimes"),
        "Must NOT use GetSystemTimes (defect in v2.0)"
      );
    });

    it("proves Linux implementation uses /proc/self/stat", () => {
      const linuxRsPath = path.join(ROOT_DIR, "crates/platform/src/linux.rs");
      const content = fs.readFileSync(linuxRsPath, "utf-8");

      assert.ok(
        content.includes("/proc/self/stat"),
        "Must use /proc/self/stat for process CPU on Linux"
      );
    });
  });
});
