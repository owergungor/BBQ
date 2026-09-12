import React, { useCallback } from "react";
import { useSystemState } from "../../state/systemState.ts";
import { bbqCommands } from "../../ipc/commands.ts";

export const SystemWidget: React.FC = () => {
  const { system, capabilities, isLoading } = useSystemState();

  const handleToggleMute = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.systemToggleMuted();
  }, []);

  const handleVolumeChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = parseFloat(e.target.value);
    await bbqCommands.systemSetVolume(nextVolume);
  }, []);

  if (isLoading && !system.operating_system) {
    return (
      <div className="bbq-system-widget-loading" style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>
        <span className="bbq-status-dot pulse" /> Reading system metrics...
      </div>
    );
  }

  const { battery, network, volume, muted, operating_system, platform } = system;
  const currentVolume = volume ?? 1.0;
  const isMuted = muted ?? false;

  return (
    <div id="bbq-system-widget" className="bbq-system-widget">
      <div className="bbq-system-grid">
        {/* Battery Section */}
        <div className="bbq-system-card">
          <div className="bbq-system-card-header">
            <span className="bbq-system-card-icon" aria-hidden="true">
              {battery.charging ? "⚡" : "🔋"}
            </span>
            <span className="bbq-system-card-title">Battery</span>
          </div>
          <div className="bbq-system-card-value">
            {battery.available && battery.percentage !== null
              ? `${battery.percentage}%`
              : "Unavailable"}
          </div>
          <div className="bbq-system-card-subtext">
            {battery.charging
              ? "Charging"
              : battery.plugged_in
              ? "Plugged In"
              : battery.available
              ? "On Battery"
              : "No Battery"}
            {battery.power_source ? ` • ${battery.power_source}` : ""}
          </div>
        </div>

        {/* Network Section */}
        <div className="bbq-system-card">
          <div className="bbq-system-card-header">
            <span className="bbq-system-card-icon" aria-hidden="true">
              {network.connected ? "🌐" : "📡"}
            </span>
            <span className="bbq-system-card-title">Network</span>
          </div>
          <div className="bbq-system-card-value">
            {network.connected ? "Connected" : "Disconnected"}
          </div>
          <div className="bbq-system-card-subtext">
            {network.interface_name ?? network.connection_type ?? "Offline"}
          </div>
        </div>

        {/* Volume Section */}
        <div className="bbq-system-card">
          <div className="bbq-system-card-header">
            <span className="bbq-system-card-icon" aria-hidden="true">
              {isMuted ? "🔇" : "🔊"}
            </span>
            <span className="bbq-system-card-title">Volume</span>
          </div>
          <div className="bbq-system-card-value">
            {isMuted ? "Muted" : `${Math.round(currentVolume * 100)}%`}
          </div>
          <div className="bbq-system-controls-row">
            {capabilities?.can_control_volume ? (
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : currentVolume}
                onChange={handleVolumeChange}
                className="bbq-system-slider"
                aria-label="Volume slider"
              />
            ) : null}
            {capabilities?.can_mute ? (
              <button
                type="button"
                className={`bbq-btn bbq-system-mute-btn ${isMuted ? "bbq-btn-active" : ""}`}
                onClick={handleToggleMute}
                aria-label={isMuted ? "Unmute system" : "Mute system"}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Host / Platform Section */}
        <div className="bbq-system-card">
          <div className="bbq-system-card-header">
            <span className="bbq-system-card-icon" aria-hidden="true">💻</span>
            <span className="bbq-system-card-title">System</span>
          </div>
          <div className="bbq-system-card-value">
            {operating_system || "Desktop"}
          </div>
          <div className="bbq-system-card-subtext">
            {system.hostname ? `${system.hostname} • ` : ""}
            {platform}
          </div>
        </div>
      </div>
    </div>
  );
};
