import React from "react";
import { Icon } from "../../common/Icon.tsx";
import { APP_VERSION } from "../../../version.ts";
import { setTargetSettingsTab } from "../SettingsWidget.tsx";
import { useUpdaterState } from "../../../state/updaterState.ts";
import { useTranslation } from "../../../i18n/index.ts";
import { formatCapabilityStatus } from "../settingsModel.ts";
import type { AboutSettingsTabProps } from "./settingsTypes.ts";

export const AboutSettingsTab: React.FC<AboutSettingsTabProps> = ({
  capabilities,
  onCopyDiagnostics,
  onReplayTour,
}) => {
  const { t } = useTranslation();
  const updater = useUpdaterState();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Brand Header */}
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
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>{t("settings.about.productName")}</h3>
          <span style={{ fontSize: "12px", color: "var(--bbq-accent)", fontWeight: 600 }}>
            {/* Version {APP_VERSION} (Production Edition) */}
            {t("common.version")} {APP_VERSION} ({t("settings.about.edition")})
          </span>
          <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--bbq-text-muted)" }}>
            {t("settings.about.tagline")}
          </p>
        </div>
      </div>

      {/* Updater Shortcut */}
      <div
        id="settings-updater-section"
        style={{
          padding: "10px 12px",
          background: "var(--bbq-surface-elevated)",
          borderRadius: "8px",
          border: "1px solid var(--bbq-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--bbq-text)", display: "block" }}>
            {t("updater.title")}
          </span>
          <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
            {updater.status === "up_to_date"
              ? t("updater.upToDate", { version: APP_VERSION })
              : updater.status === "update_available" && updater.availableVersion
              ? t("updater.updateAvailable", { version: updater.availableVersion })
              : t("updater.description")}
          </span>
        </div>
        <button
          type="button"
          id="settings-check-updates-btn"
          className="bbq-btn-secondary"
          style={{ fontSize: "11px", padding: "4px 10px", cursor: "pointer" }}
          onClick={() => setTargetSettingsTab("update")}
        >
          {t("settings.tabs.update") || "Update"}
        </button>
      </div>

      {/* Technical Specifications */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>{t("settings.about.licenseLabel")}</span>
          <span style={{ fontWeight: 500 }}>{t("settings.about.licenseVal") || "MIT License (Open Source)"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>{t("settings.about.archLabel")}</span>
          <span style={{ fontWeight: 500 }}>{t("settings.about.archVal")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>{t("settings.about.telemetryLabel")}</span>
          <span style={{ fontWeight: 500, color: "var(--bbq-success)" }}>{t("settings.about.telemetryVal")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>{t("settings.about.dbLabel")}</span>
          <span style={{ fontWeight: 500 }}>{t("settings.about.dbVal")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--bbq-text-muted)" }}>{t("settings.about.uninstallLabel")}</span>
          <span style={{ fontWeight: 500 }}>{t("settings.about.uninstallVal")}</span>
        </div>
      </div>

      {capabilities && (
        <div style={{ paddingTop: "8px", borderTop: "1px solid var(--bbq-border)" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--bbq-text)", display: "block", marginBottom: "8px" }}>
            {t("settings.about.capabilitiesTitle", { platform: capabilities.platform })}
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

      {/* Action Buttons */}
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
          aria-label={t("settings.about.copyDiagnostics")}
        >
          {t("settings.about.copyDiagnostics")}
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
          aria-label={t("settings.about.replayTour") || "Replay Welcome Tour"}
        >
          {t("settings.about.replayTour") || "Replay Welcome Tour"}
        </button>
      </div>
    </div>
  );
};
