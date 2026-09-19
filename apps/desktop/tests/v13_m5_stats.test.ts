import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeStats,
  clampPercent,
  formatBytes,
  calculateGaugeDash,
  appendTrendSample,
  MAX_TREND_SAMPLES,
  type TrendSample,
} from "../src/components/widgets/statsModel.ts";
import type { SystemState, SystemCapabilities } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v1.3 - Milestone 5: Hardware Telemetry & Stats HUD", () => {
  describe("STATS_MODEL Normalization & Clamping", () => {
    it("returns safe defaults when system state is null or undefined", () => {
      const stats = normalizeStats(null);
      assert.strictEqual(stats.cpu.usagePercent, 0);
      assert.strictEqual(stats.cpu.available, false);
      assert.strictEqual(stats.memory.usagePercent, 0);
      assert.strictEqual(stats.memory.available, false);
      assert.strictEqual(stats.battery.available, false);
      assert.strictEqual(stats.network.connected, false);
      assert.strictEqual(stats.systemInfo.os, "Desktop");
    });

    it("clamps percentages to [0, 100] and protects against NaN, Infinity, negative values", () => {
      assert.strictEqual(clampPercent(-10), 0);
      assert.strictEqual(clampPercent(0), 0);
      assert.strictEqual(clampPercent(47.2), 47);
      assert.strictEqual(clampPercent(99.6), 100);
      assert.strictEqual(clampPercent(100), 100);
      assert.strictEqual(clampPercent(150), 100);
      assert.strictEqual(clampPercent(NaN), 0);
      assert.strictEqual(clampPercent(Infinity), 0);
      assert.strictEqual(clampPercent(-Infinity), 0);
      assert.strictEqual(clampPercent(null), 0);
      assert.strictEqual(clampPercent(undefined), 0);
    });

    it("formats byte sizes with user-friendly units and bounds checking", () => {
      assert.strictEqual(formatBytes(0), "0 B");
      assert.strictEqual(formatBytes(-100), "0 B");
      assert.strictEqual(formatBytes(NaN), "0 B");
      assert.strictEqual(formatBytes(512), "512 B");
      assert.strictEqual(formatBytes(1024), "1 KB");
      assert.strictEqual(formatBytes(1536), "1.5 KB");
      assert.strictEqual(formatBytes(1048576 * 256), "256 MB");
      assert.strictEqual(formatBytes(1073741824 * 8), "8 GB");
      assert.strictEqual(formatBytes(1073741824 * 16.5), "16.5 GB");
    });

    it("normalizes a full active system telemetry snapshot correctly", () => {
      const sampleState: SystemState = {
        battery: {
          available: true,
          percentage: 82,
          charging: true,
          plugged_in: true,
          power_source: "AC Power",
        },
        network: {
          connected: true,
          interface_name: "Wi-Fi 6E",
          connection_type: "Internet Access",
          signal_strength: 4,
        },
        cpu: {
          usage_percent: 34.2,
          core_count: 16,
        },
        memory: {
          total_bytes: 34359738368, // 32 GB
          used_bytes: 17179869184,  // 16 GB
          usage_percent: 50.0,
        },
        muted: false,
        volume: 0.8,
        uptime_seconds: 7320, // 2h 2m
        hostname: "BBQ-RIG",
        operating_system: "Windows 11",
        platform: "windows",
      };

      const caps: SystemCapabilities = {
        has_battery: true,
        can_read_network: true,
        can_read_cpu: true,
        can_read_memory: true,
        can_control_volume: false,
        can_mute: false,
      };

      const stats = normalizeStats(sampleState, caps);

      assert.strictEqual(stats.cpu.available, true);
      assert.strictEqual(stats.cpu.usagePercent, 34);
      assert.strictEqual(stats.cpu.coreCount, 16);
      assert.strictEqual(stats.cpu.label, "34%");

      assert.strictEqual(stats.memory.available, true);
      assert.strictEqual(stats.memory.usagePercent, 50);
      assert.strictEqual(stats.memory.formattedUsed, "16 GB");
      assert.strictEqual(stats.memory.formattedTotal, "32 GB");

      assert.strictEqual(stats.battery.available, true);
      assert.strictEqual(stats.battery.percentage, 82);
      assert.strictEqual(stats.battery.charging, true);
      assert.strictEqual(stats.battery.statusText, "Charging");

      assert.strictEqual(stats.network.connected, true);
      assert.strictEqual(stats.network.statusText, "Wi-Fi 6E");

      assert.strictEqual(stats.systemInfo.os, "Windows 11");
      assert.strictEqual(stats.systemInfo.hostname, "BBQ-RIG");
      assert.strictEqual(stats.systemInfo.uptimeFormatted, "2h 2m");
    });
  });

  describe("GAUGE_MATHEMATICS", () => {
    it("calculates exact circumference and dash offset for 0%, 50%, and 100%", () => {
      const radius = 36;
      const expectedCircumference = Number((2 * Math.PI * 36).toFixed(2)); // ~226.19

      const gauge0 = calculateGaugeDash(radius, 0);
      assert.strictEqual(gauge0.circumference, expectedCircumference);
      assert.strictEqual(gauge0.dashOffset, expectedCircumference); // full offset = empty fill

      const gauge50 = calculateGaugeDash(radius, 50);
      assert.strictEqual(gauge50.circumference, expectedCircumference);
      assert.ok(Math.abs(gauge50.dashOffset - expectedCircumference * 0.5) < 0.1); // half offset

      const gauge100 = calculateGaugeDash(radius, 100);
      assert.strictEqual(gauge100.circumference, expectedCircumference);
      assert.strictEqual(gauge100.dashOffset, 0); // zero offset = full fill
    });
  });

  describe("BOUNDED_TREND & Memory Safety", () => {
    it("enforces bounded ring buffer history (default max 30 samples)", () => {
      let history: TrendSample[] = [];

      for (let i = 0; i < 50; i++) {
        history = appendTrendSample(history, {
          timestamp: Date.now() + i * 1000,
          cpuPercent: i * 2,
          memoryPercent: 50,
        });
      }

      assert.strictEqual(history.length, MAX_TREND_SAMPLES);
      // Verify oldest samples were evicted
      assert.strictEqual(history[history.length - 1].cpuPercent, 98);
      assert.strictEqual(history[0].cpuPercent, (50 - MAX_TREND_SAMPLES) * 2);
    });
  });

  describe("STATIC_AUDIT & INVARIANT VERIFICATION", () => {
    const systemWidgetPath = path.resolve(__dirname, "../src/components/widgets/SystemWidget.tsx");
    const compactIndicatorsPath = path.resolve(__dirname, "../src/components/island/CompactIndicators.tsx");
    const statsModelPath = path.resolve(__dirname, "../src/components/widgets/statsModel.ts");
    const systemStatePath = path.resolve(__dirname, "../src/state/systemState.ts");
    const indexCssPath = path.resolve(__dirname, "../src/styles/index.css");

    it("ensures ZERO setInterval in system/stats code", () => {
      const files = [systemWidgetPath, compactIndicatorsPath, statsModelPath, systemStatePath];
      for (const f of files) {
        const content = fs.readFileSync(f, "utf8");
        assert.doesNotMatch(content, /setInterval\s*\(/, `Forbidden setInterval found in ${path.basename(f)}`);
      }
    });

    it("ensures ZERO requestAnimationFrame polling loops in system/stats code", () => {
      const files = [systemWidgetPath, compactIndicatorsPath, statsModelPath, systemStatePath];
      for (const f of files) {
        const content = fs.readFileSync(f, "utf8");
        assert.doesNotMatch(content, /requestAnimationFrame\s*\(/, `Forbidden requestAnimationFrame found in ${path.basename(f)}`);
      }
    });

    it("ensures ZERO emoji icons in SystemWidget and CompactSystemIndicator", () => {
      const systemWidgetContent = fs.readFileSync(systemWidgetPath, "utf8");
      assert.doesNotMatch(systemWidgetContent, /[⚡🔋🌐📡🔇🔊💻⚙️]/, "Forbidden emoji found in SystemWidget.tsx");

      const compactContent = fs.readFileSync(compactIndicatorsPath, "utf8");
      const systemIndicatorMatch = compactContent.match(/export const CompactSystemIndicator[\s\S]*?^};/m);
      assert.ok(systemIndicatorMatch, "CompactSystemIndicator must exist");
      assert.doesNotMatch(systemIndicatorMatch[0], /[⚡🔋🌐📡🔇🔊💻⚙️]/, "Forbidden emoji found in CompactSystemIndicator");
    });

    it("ensures ZERO filter: drop-shadow in stats HUD CSS (zero-halo invariant)", () => {
      const cssContent = fs.readFileSync(indexCssPath, "utf8");
      const statsCssMatch = cssContent.match(/\.bbq-stats-hud-container[\s\S]*?\.bbq-stats-trend-legend/);
      assert.ok(statsCssMatch, "Stats HUD CSS block must exist");
      assert.doesNotMatch(statsCssMatch[0], /drop-shadow/, "Forbidden drop-shadow found in stats HUD CSS");
      assert.match(statsCssMatch[0], /box-shadow:\s*none/, "Outer box-shadow must be strictly none");
    });

    it("ensures prefers-reduced-motion overrides exist for stats gauges", () => {
      const cssContent = fs.readFileSync(indexCssPath, "utf8");
      assert.match(cssContent, /prefers-reduced-motion[\s\S]*?\.bbq-stats-gauge-fill/, "Reduced motion rule must exist for stats gauge fill");
      assert.match(cssContent, /data-reduced-motion="true"[\s\S]*?\.bbq-stats-gauge-fill/, "data-reduced-motion rule must exist for stats gauge fill");
    });

    it("ensures SystemWidget snapshot action implements a >=1000ms cooldown and cleanup", () => {
      const systemWidgetContent = fs.readFileSync(systemWidgetPath, "utf8");
      assert.match(systemWidgetContent, /isCoolingDown/, "SystemWidget must track isCoolingDown state");
      assert.match(systemWidgetContent, /1000\s*-\s*elapsed/, "SystemWidget must enforce a 1000ms minimum cooldown window");
      assert.match(systemWidgetContent, /clearTimeout\s*\(/, "SystemWidget must clear active cooldown timers on unmount");
      assert.doesNotMatch(systemWidgetContent, /setInterval/, "SystemWidget must never use setInterval");
    });
  });
});

