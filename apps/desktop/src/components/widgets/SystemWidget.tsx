import React, { useEffect, useCallback, useMemo, useState, useRef } from "react";
import { useSystemState, refreshSystemState } from "../../state/systemState.ts";
import { Icon } from "../common/Icon.tsx";
import {
  normalizeStats,
  calculateGaugeDash,
  appendTrendSample,
  type TrendSample,
} from "./statsModel.ts";

export const SystemWidget: React.FC = () => {
  const { system, capabilities, isLoading } = useSystemState();
  const [trendHistory, setTrendHistory] = useState<TrendSample[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any active one-shot cooldown timer upon unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  const stats = useMemo(
    () => normalizeStats(system, capabilities),
    [system, capabilities]
  );

  // On-demand refresh when the widget is mounted/viewed (zero continuous polling)
  useEffect(() => {
    refreshSystemState();
  }, []);

  // Record bounded trend point upon telemetry arrival (max 30 points in memory, no DB writes)
  useEffect(() => {
    if (stats.cpu.available || stats.memory.available) {
      setTrendHistory((prev) =>
        appendTrendSample(prev, {
          timestamp: Date.now(),
          cpuPercent: stats.cpu.usagePercent,
          memoryPercent: stats.memory.usagePercent,
        })
      );
    }
  }, [stats.cpu.usagePercent, stats.memory.usagePercent, stats.cpu.available, stats.memory.available]);

  const handleManualRefresh = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing || isCoolingDown || isLoading) return;

    const startTime = Date.now();
    setIsRefreshing(true);
    setIsCoolingDown(true);

    try {
      await refreshSystemState();
    } finally {
      setIsRefreshing(false);
      const elapsed = Date.now() - startTime;
      const remainingCooldown = Math.max(0, 1000 - elapsed);

      if (remainingCooldown > 0) {
        if (cooldownTimerRef.current !== null) {
          clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = setTimeout(() => {
          setIsCoolingDown(false);
          cooldownTimerRef.current = null;
        }, remainingCooldown);
      } else {
        setIsCoolingDown(false);
      }
    }
  }, [isRefreshing, isCoolingDown, isLoading]);

  // Gauge geometries (radius 36)
  const cpuGauge = useMemo(() => calculateGaugeDash(36, stats.cpu.usagePercent), [stats.cpu.usagePercent]);
  const memGauge = useMemo(() => calculateGaugeDash(36, stats.memory.usagePercent), [stats.memory.usagePercent]);

  // Sparkline coordinates for bounded trend
  const sparklinePoints = useMemo(() => {
    if (trendHistory.length < 2) return null;
    const width = 160;
    const height = 24;
    const step = width / Math.max(1, trendHistory.length - 1);

    const cpuCoords = trendHistory
      .map((s, i) => `${(i * step).toFixed(1)},${(height - (s.cpuPercent / 100) * height).toFixed(1)}`)
      .join(" ");

    const memCoords = trendHistory
      .map((s, i) => `${(i * step).toFixed(1)},${(height - (s.memoryPercent / 100) * height).toFixed(1)}`)
      .join(" ");

    return { cpuCoords, memCoords };
  }, [trendHistory]);

  return (
    <div id="bbq-system-widget" className="bbq-stats-hud-container">
      {/* Header Bar */}
      <div className="bbq-stats-hud-header">
        <div className="bbq-stats-title-group">
          <div className="bbq-stats-badge">
            <Icon name="stats" size={13} aria-hidden="true" />
            <span>Hardware Telemetry</span>
          </div>
          <span className="bbq-stats-host-subtitle">
            {stats.systemInfo.hostname ? `${stats.systemInfo.hostname} • ` : ""}
            {stats.systemInfo.os}
          </span>
        </div>

        <button
          type="button"
          className="bbq-stats-refresh-btn"
          onClick={handleManualRefresh}
          disabled={isRefreshing || isLoading || isCoolingDown}
          title={isCoolingDown ? "Refresh cooldown active (1s)" : "Refresh hardware metrics on demand"}
          aria-label={isCoolingDown ? "Refresh cooldown active" : "Refresh hardware metrics"}
        >
          <Icon name="search" size={11} className={isRefreshing ? "spin" : ""} aria-hidden="true" />
          <span>{isRefreshing ? "Refreshing..." : isCoolingDown ? "Cooldown..." : "Snapshot"}</span>
        </button>
      </div>

      {/* Main Hero Gauges */}
      <div className="bbq-stats-gauges-row">
        {/* CPU Gauge Card */}
        <div
          className="bbq-stats-gauge-card"
          role="progressbar"
          aria-label="CPU Usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stats.cpu.usagePercent}
          aria-valuetext={`${stats.cpu.usagePercent}% CPU Usage, ${stats.cpu.coreCount} Cores`}
        >
          <div className="bbq-stats-gauge-svg-wrap">
            <svg className="bbq-stats-gauge-svg" viewBox="0 0 90 90" aria-hidden="true">
              {/* Background Track */}
              <circle
                className="bbq-stats-gauge-track"
                cx="45"
                cy="45"
                r="36"
                strokeWidth="6.5"
              />
              {/* Animated Value Stroke */}
              <circle
                className="bbq-stats-gauge-fill cpu"
                cx="45"
                cy="45"
                r="36"
                strokeWidth="6.5"
                strokeDasharray={cpuGauge.circumference}
                strokeDashoffset={cpuGauge.dashOffset}
              />
            </svg>
            <div className="bbq-stats-gauge-center">
              <span className="bbq-stats-gauge-val">{stats.cpu.usagePercent}%</span>
              <span className="bbq-stats-gauge-subval">CPU</span>
            </div>
          </div>

          <div className="bbq-stats-gauge-info">
            <span className="bbq-stats-gauge-name">Processor</span>
            <span className="bbq-stats-gauge-detail">
              {stats.cpu.coreCount} {stats.cpu.coreCount === 1 ? "Core" : "Logical Cores"}
            </span>
          </div>
        </div>

        {/* Memory Gauge Card */}
        <div
          className="bbq-stats-gauge-card"
          role="progressbar"
          aria-label="Memory Usage"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stats.memory.usagePercent}
          aria-valuetext={`${stats.memory.usagePercent}% Memory Usage, ${stats.memory.formattedUsed} used of ${stats.memory.formattedTotal}`}
        >
          <div className="bbq-stats-gauge-svg-wrap">
            <svg className="bbq-stats-gauge-svg" viewBox="0 0 90 90" aria-hidden="true">
              {/* Background Track */}
              <circle
                className="bbq-stats-gauge-track"
                cx="45"
                cy="45"
                r="36"
                strokeWidth="6.5"
              />
              {/* Animated Value Stroke */}
              <circle
                className="bbq-stats-gauge-fill mem"
                cx="45"
                cy="45"
                r="36"
                strokeWidth="6.5"
                strokeDasharray={memGauge.circumference}
                strokeDashoffset={memGauge.dashOffset}
              />
            </svg>
            <div className="bbq-stats-gauge-center">
              <span className="bbq-stats-gauge-val">{stats.memory.usagePercent}%</span>
              <span className="bbq-stats-gauge-subval">RAM</span>
            </div>
          </div>

          <div className="bbq-stats-gauge-info">
            <span className="bbq-stats-gauge-name">Memory</span>
            <span className="bbq-stats-gauge-detail">
              {stats.memory.formattedUsed} / {stats.memory.formattedTotal}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="bbq-stats-secondary-grid">
        {/* Battery Tile */}
        <div className="bbq-stats-tile">
          <div className="bbq-stats-tile-icon" aria-hidden="true">
            <Icon
              name={stats.battery.charging ? "battery-charging" : "battery"}
              size={15}
            />
          </div>
          <div className="bbq-stats-tile-content">
            <div className="bbq-stats-tile-top">
              <span className="bbq-stats-tile-label">Battery</span>
              <span className="bbq-stats-tile-val">
                {stats.battery.available ? `${stats.battery.percentage}%` : "Unavailable"}
              </span>
            </div>
            <span className="bbq-stats-tile-subtext">
              {stats.battery.statusText}
              {stats.battery.powerSource ? ` • ${stats.battery.powerSource}` : ""}
            </span>
          </div>
        </div>

        {/* Network Tile */}
        <div className="bbq-stats-tile">
          <div className="bbq-stats-tile-icon" aria-hidden="true">
            <Icon name="network" size={15} />
          </div>
          <div className="bbq-stats-tile-content">
            <div className="bbq-stats-tile-top">
              <span className="bbq-stats-tile-label">Network</span>
              <span className="bbq-stats-tile-val">
                {stats.network.connected ? "Online" : "Offline"}
              </span>
            </div>
            <span className="bbq-stats-tile-subtext" title={stats.network.statusText}>
              {stats.network.statusText}
            </span>
          </div>
        </div>

        {/* System Uptime / Host Tile */}
        <div className="bbq-stats-tile">
          <div className="bbq-stats-tile-icon" aria-hidden="true">
            <Icon name="cpu" size={15} />
          </div>
          <div className="bbq-stats-tile-content">
            <div className="bbq-stats-tile-top">
              <span className="bbq-stats-tile-label">Uptime</span>
              <span className="bbq-stats-tile-val">
                {stats.systemInfo.uptimeFormatted ?? "Active"}
              </span>
            </div>
            <span className="bbq-stats-tile-subtext">
              {stats.systemInfo.platform}
            </span>
          </div>
        </div>
      </div>

      {/* Micro-Trend Sparkline (Recent Snapshots) */}
      {sparklinePoints && (
        <div className="bbq-stats-trend-container" aria-label="Recent resource trend">
          <span className="bbq-stats-trend-title">Recent Trend:</span>
          <svg className="bbq-stats-sparkline" viewBox="0 0 160 24" aria-hidden="true">
            <polyline
              className="bbq-sparkline-line cpu"
              points={sparklinePoints.cpuCoords}
            />
            <polyline
              className="bbq-sparkline-line mem"
              points={sparklinePoints.memCoords}
            />
          </svg>
          <div className="bbq-stats-trend-legend" aria-hidden="true">
            <span className="legend-item"><span className="dot cpu" /> CPU</span>
            <span className="legend-item"><span className="dot mem" /> RAM</span>
          </div>
        </div>
      )}
    </div>
  );
};
