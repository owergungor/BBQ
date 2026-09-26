/**
 * BBQ v1.3 - Milestone 5: Hardware Telemetry & Stats Model
 * Pure, deterministic logic for system metrics normalization, percentage clamping,
 * memory formatting, SVG gauge mathematics, and bounded trend history.
 *
 * Strict Project Invariants:
 * - NO setInterval / setTimeout loops
 * - NO requestAnimationFrame loops
 * - Bounded trend memory (max 30-60 samples)
 * - Safe numeric handling (zero division, NaN, Infinity)
 */

import type { SystemState, SystemCapabilities } from "@bbq/types";

export interface NormalizedStats {
  cpu: {
    usagePercent: number;
    coreCount: number;
    available: boolean;
    label: string;
  };
  memory: {
    usagePercent: number;
    usedBytes: number;
    totalBytes: number;
    formattedUsed: string;
    formattedTotal: string;
    available: boolean;
    label: string;
  };
  battery: {
    available: boolean;
    percentage: number;
    charging: boolean;
    pluggedIn: boolean;
    statusText: string;
    powerSource: string | null;
  };
  network: {
    connected: boolean;
    connectionType: string;
    interfaceName: string | null;
    statusText: string;
  };
  systemInfo: {
    os: string;
    hostname: string | null;
    platform: string;
    uptimeFormatted: string | null;
  };
}

export interface TrendSample {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
}

export const MAX_TREND_SAMPLES = 30;

/**
 * Clamps a percentage value to [0, 100], handling NaN, Infinity, and negative values.
 */
export function clampPercent(val: number | null | undefined): number {
  if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(val)));
}

/**
 * Formats byte sizes cleanly (e.g. "8.2 GB", "16 GB", "512 MB", "0 B").
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIndex = Math.max(0, Math.min(sizes.length - 1, i));

  const value = bytes / Math.pow(k, clampedIndex);
  // If whole number, format without decimal, otherwise up to 1 decimal place
  const formatted = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);

  return `${formatted} ${sizes[clampedIndex]}`;
}

/**
 * Normalizes raw SystemState and Capabilities into a sanitized, display-ready model.
 */
export function normalizeStats(
  state: SystemState | null | undefined,
  capabilities?: SystemCapabilities | null
): NormalizedStats {
  if (!state) {
    return {
      cpu: { usagePercent: 0, coreCount: 1, available: false, label: "0%" },
      memory: {
        usagePercent: 0,
        usedBytes: 0,
        totalBytes: 0,
        formattedUsed: "0 GB",
        formattedTotal: "0 GB",
        available: false,
        label: "0%",
      },
      battery: {
        available: false,
        percentage: 0,
        charging: false,
        pluggedIn: false,
        statusText: "Unavailable",
        powerSource: null,
      },
      network: {
        connected: false,
        connectionType: "Offline",
        interfaceName: null,
        statusText: "Disconnected",
      },
      systemInfo: {
        os: "Desktop",
        hostname: null,
        platform: "unknown",
        uptimeFormatted: null,
      },
    };
  }

  // CPU
  const rawCpuUsage = state.cpu?.usage_percent;
  const cpuPercent = clampPercent(rawCpuUsage);
  const coreCount = state.cpu?.core_count && state.cpu.core_count > 0 ? state.cpu.core_count : 1;
  const hasCpu =
    capabilities?.can_read_cpu !== false &&
    state.cpu !== null &&
    state.cpu !== undefined &&
    rawCpuUsage !== undefined;
  let cpuLabel = "0%";
  if (typeof rawCpuUsage === "number" && !Number.isNaN(rawCpuUsage)) {
    if (rawCpuUsage > 0 && rawCpuUsage < 1) {
      cpuLabel = "<1%";
    } else {
      cpuLabel = `${cpuPercent}%`;
    }
  }

  // Memory
  const totalMem = state.memory?.total_bytes ?? 0;
  const usedMem = state.memory?.used_bytes ?? 0;
  const rawMemPct =
    state.memory?.usage_percent ?? (totalMem > 0 ? (usedMem / totalMem) * 100 : 0);
  const memPercent = clampPercent(rawMemPct);
  const hasMem =
    capabilities?.can_read_memory !== false &&
    state.memory !== null &&
    state.memory !== undefined &&
    totalMem > 0;

  // Battery
  const hasBattery = capabilities?.has_battery !== false && state.battery.available;
  const batteryPct = clampPercent(state.battery.percentage);
  const batteryStatusText = state.battery.charging
    ? "Charging"
    : state.battery.plugged_in
    ? "Plugged In"
    : hasBattery
    ? "On Battery"
    : "No Battery";

  // Network
  const netConnected = state.network.connected;
  const netType = state.network.connection_type || (netConnected ? "Connected" : "Offline");
  const netStatusText = netConnected
    ? state.network.interface_name || netType
    : "Disconnected";

  // System
  const uptimeSec = state.uptime_seconds;
  let uptimeFormatted: string | null = null;
  if (typeof uptimeSec === "number" && uptimeSec > 0) {
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    uptimeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  return {
    cpu: {
      usagePercent: cpuPercent,
      coreCount,
      available: hasCpu,
      label: cpuLabel,
    },
    memory: {
      usagePercent: memPercent,
      usedBytes: usedMem,
      totalBytes: totalMem,
      formattedUsed: formatBytes(usedMem),
      formattedTotal: formatBytes(totalMem),
      available: hasMem,
      label: `${memPercent}%`,
    },
    battery: {
      available: hasBattery,
      percentage: batteryPct,
      charging: state.battery.charging,
      pluggedIn: state.battery.plugged_in,
      statusText: batteryStatusText,
      powerSource: state.battery.power_source,
    },
    network: {
      connected: netConnected,
      connectionType: netType,
      interfaceName: state.network.interface_name,
      statusText: netStatusText,
    },
    systemInfo: {
      os: state.operating_system || "Desktop",
      hostname: state.hostname,
      platform: state.platform || "unknown",
      uptimeFormatted,
    },
  };
}

/**
 * Calculates SVG stroke-dashoffset for circular gauges.
 * Circumference = 2 * PI * radius
 * Offset = Circumference * (1 - percent / 100)
 */
export function calculateGaugeDash(radius: number, percent: number): {
  circumference: number;
  dashOffset: number;
} {
  const safeRadius = Math.max(1, radius);
  const clamped = clampPercent(percent);
  const circumference = 2 * Math.PI * safeRadius;
  const dashOffset = circumference * (1 - clamped / 100);

  return {
    circumference: Number(circumference.toFixed(2)),
    dashOffset: Number(dashOffset.toFixed(2)),
  };
}

/**
 * Appends a new trend sample into a strictly bounded ring buffer (default max 30 samples).
 * Prevents memory leaks and unbounded growth.
 */
export function appendTrendSample(
  history: TrendSample[],
  sample: TrendSample,
  maxSamples: number = MAX_TREND_SAMPLES
): TrendSample[] {
  const safeLimit = Math.max(5, maxSamples);
  const next = [...history, sample];
  if (next.length > safeLimit) {
    return next.slice(next.length - safeLimit);
  }
  return next;
}
