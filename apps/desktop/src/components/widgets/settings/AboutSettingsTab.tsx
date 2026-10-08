import React from "react";
import { Icon } from "../../common/Icon.tsx";
import { APP_VERSION } from "../../../version.ts";
import { openAllowlistedReleaseUrl } from "../../../state/settingsState.ts";
import { formatCapabilityStatus } from "../settingsModel.ts";
import type { AboutSettingsTabProps } from "./settingsTypes.ts";

export const AboutSettingsTab: React.FC<AboutSettingsTabProps> = ({
  capabilities,
  onCopyDiagnostics,
  onReplayTour,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div
        style={{
          padding: "12px",
          background: "var(--bbq-surface-elevated)",
          borderRadius: "8px",
          border: "1px solid var(--bbq-border)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", color: "var(--bbq-accent)" }} aria-hidden="true">
          <Icon name="palm" size={28} />
        </span>
        <div>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>BBQ Desktop</h3>
          <span style={{ fontSize: "12px", color: "var(--bbq-accent)", fontWeight: 600 }}>
            Version {APP_VERSION} (Production Edition)
          </span>
          <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--bbq-text-muted)" }}>
            Lightweight, hardware-accelerated desktop productivity island.
          </p>
        </div>
      </div>

      {/* Updates Section */}
      <div style={{ paddingTop: "8px", borderTop: "1px solid var(--bbq-border)", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <span style={{ fontWeight: 500, fontSize: "12px", color: "var(--bbq-text)", display: "block" }}>
              Updates
            </span>
            <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
              Official releases on GitHub
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              id="settings-check-updates-btn"
              className="bbq-btn-secondary"
              style={{ fontSize: "11px", padding: "4px 10px", cursor: "pointer" }}
              onClick={() => openAllowlistedReleaseUrl()}
            >
              Check for Updates
            </button>
            <button
              type="button"
              id="settings-view-releases-btn"
              className="bbq-btn-secondary"
              style={{ fontSize: "11px", padding: "4px 10px", cursor: "pointer" }}
              onClick={() => openAllowlistedReleaseUrl()}
            >
              View Releases
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>License:</span>
          <span style={{ fontWeight: 500 }}>MIT License (Open Source)</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>Architecture:</span>
          <span style={{ fontWeight: 500 }}>Tauri 2 + Rust Core + React 19</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>Telemetry & Tracking:</span>
          <span style={{ fontWeight: 500, color: "var(--bbq-success)" }}>None (100% Local-First)</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>Local Database:</span>
          <span style={{ fontWeight: 500 }}>SQLite 3 (WAL Mode)</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>Safe Uninstall:</span>
          <span style={{ fontWeight: 500 }}>Non-destructive (Preferences preserved)</span>
        </div>
      </div>

      {capabilities && (
        <div style={{ paddingTop: "8px", borderTop: "1px solid var(--bbq-border)" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--bbq-text)", display: "block", marginBottom: "8px" }}>
            Platform Capabilities ({capabilities.platform})
          </span>
          <div id="platform-capabilities-list" style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
            {[
              { label: "Global Hotkey", status: capabilities.globalHotkey },
              { label: "Clipboard Live Events", status: capabilities.clipboardLiveEvents },
              { label: "Clipboard History", status: capabilities.clipboardHistory },
              { label: "Media Control", status: capabilities.mediaControl },
              { label: "Media Events", status: capabilities.mediaEvents },
              { label: "Notifications", status: capabilities.notifications },
              { label: "Display Change Events", status: capabilities.displayChangeEvents },
              { label: "Window Positioning", status: capabilities.windowAbsolutePositioning },
            ].map(({ label, status }) => {
              const formatted = formatCapabilityStatus(status);
              return (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--bbq-text-muted)" }}>{label}:</span>
                  <span
                    className="bbq-capability-badge"
                    data-status={status}
                  >
                    {formatted.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ paddingTop: "8px", borderTop: "1px solid var(--bbq-border)", display: "flex", gap: "8px" }}>
        <button
          type="button"
          id="bbq-copy-diagnostics-btn"
          onClick={onCopyDiagnostics}
          style={{
            flex: 1,
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px solid var(--bbq-border)",
            background: "var(--bbq-surface)",
            color: "var(--bbq-text)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
          aria-label="Copy sanitized diagnostic information"
        >
          Copy Diagnostics
        </button>
        <button
          type="button"
          onClick={onReplayTour}
          style={{
            flex: 1,
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px solid var(--bbq-accent)",
            background: "rgba(59, 130, 246, 0.1)",
            color: "var(--bbq-accent)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
          aria-label="Replay welcome onboarding tour"
        >
          Replay Welcome Tour
        </button>
      </div>
    </div>
  );
};
