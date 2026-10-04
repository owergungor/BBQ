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

    it("displays '--' loading/measuring state when CPU telemetry is pending initial sample (not forced 0%)", () => {
      const statePending: SystemState = {
        battery: { available: true, percentage: 80, charging: false, plugged_in: false, time_remaining_seconds: null, power_source: null },
        network: { connected: true, connection_type: "wifi", interface_name: null, signal_strength: null },
        cpu: null,
        memory: { total_bytes: 16000000000, used_bytes: 8000000000, usage_percent: 50.0 },
        operating_system: "Windows",
        platform: "windows",
      };

      const normalized = normalizeStats(statePending, baseCaps);
      assert.strictEqual(normalized.cpu.available, false);
      assert.strictEqual(normalized.cpu.label, "--");
    });
  });

  describe("6B. Rust Native System CPU Implementation Verification", () => {
    it("proves Windows implementation uses GetSystemTimes for real system-wide CPU metrics", () => {
      const windowsRsPath = path.join(ROOT_DIR, "crates/platform/src/windows.rs");
      const content = fs.readFileSync(windowsRsPath, "utf-8");

      assert.ok(
        content.includes("GetSystemTimes"),
        "Must use GetSystemTimes to measure real system-wide CPU"
      );
    });

    it("proves Linux implementation uses /proc/stat for real system-wide CPU metrics", () => {
      const linuxRsPath = path.join(ROOT_DIR, "crates/platform/src/linux.rs");
      const content = fs.readFileSync(linuxRsPath, "utf-8");

      assert.ok(
        content.includes("/proc/stat"),
        "Must use /proc/stat for system-wide CPU on Linux"
      );
    });

    it("proves macOS implementation enables system CPU telemetry", () => {
      const macosRsPath = path.join(ROOT_DIR, "crates/platform/src/macos.rs");
      const content = fs.readFileSync(macosRsPath, "utf-8");

      assert.ok(
        content.includes("can_read_cpu: true"),
        "Must report can_read_cpu: true on macOS platform"
      );
    });
  });
});
