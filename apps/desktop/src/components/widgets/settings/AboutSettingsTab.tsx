import React from "react";
import { Icon } from "../../common/Icon.tsx";
import { APP_VERSION } from "../../../version.ts";
import { openAllowlistedReleaseUrl } from "../../../state/settingsState.ts";
import {
  useUpdaterState,
  checkForUpdates,
  downloadAndInstallUpdate,
  restartApp,
} from "../../../state/updaterState.ts";
import { useTranslation, formatLocaleDate, formatBytes } from "../../../i18n/index.ts";
import { formatCapabilityStatus } from "../settingsModel.ts";
import type { AboutSettingsTabProps } from "./settingsTypes.ts";

export const AboutSettingsTab: React.FC<AboutSettingsTabProps> = ({
  capabilities,
  onCopyDiagnostics,
  onReplayTour,
}) => {
  const { t, currentLanguage } = useTranslation();
  const updater = useUpdaterState();

  const handleCheck = () => {
    checkForUpdates();
  };

  const handleInstall = () => {
    downloadAndInstallUpdate();
  };

  const handleRestart = () => {
    restartApp();
  };

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

      {/* Auto-Updater Section */}
      <div
        id="settings-updater-section"
        style={{
          paddingTop: "8px",
          borderTop: "1px solid var(--bbq-border)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--bbq-text)", display: "block" }}>
              {t("updater.title")}
            </span>
            <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
              {updater.status === "up_to_date"
                ? t("updater.upToDate", { version: APP_VERSION })
                : updater.status === "checking"
                ? t("updater.checking")
                : updater.status === "update_available" && updater.availableVersion
                ? t("updater.updateAvailable", { version: updater.availableVersion })
                : t("updater.description")}
            </span>
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              id="settings-check-updates-btn"
              className="bbq-btn-secondary"
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                cursor: updater.status === "checking" || updater.status === "downloading" ? "not-allowed" : "pointer",
                opacity: updater.status === "checking" || updater.status === "downloading" ? 0.7 : 1,
              }}
              disabled={updater.status === "checking" || updater.status === "downloading" || updater.status === "installing"}
              onClick={handleCheck}
            >
              {updater.status === "checking" ? t("updater.checking") : t("updater.checkForUpdates")}
            </button>
            <button
              type="button"
              id="settings-view-releases-btn"
              className="bbq-btn-secondary"
              style={{ fontSize: "11px", padding: "4px 10px", cursor: "pointer" }}
              onClick={() => openAllowlistedReleaseUrl()}
            >
              {t("updater.viewReleases")}
            </button>
          </div>
        </div>

        {/* Update Available Card */}
        {updater.status === "update_available" && updater.availableVersion && (
          <div
            id="updater-available-card"
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid var(--bbq-accent)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--bbq-accent)" }}>
                {t("updater.updateAvailable", { version: updater.availableVersion })}
              </span>
              {updater.releaseDate && (
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  {formatLocaleDate(updater.releaseDate, currentLanguage)}
                </span>
              )}
            </div>

            {updater.releaseNotes && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--bbq-text)",
                  maxHeight: "80px",
                  overflowY: "auto",
                  padding: "6px",
                  background: "var(--bbq-surface)",
                  borderRadius: "4px",
                  border: "1px solid var(--bbq-border)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {updater.releaseNotes}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                id="updater-install-btn"
                className="bbq-btn-primary"
                style={{
                  fontSize: "11px",
                  padding: "6px 12px",
                  background: "var(--bbq-accent)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={handleInstall}
              >
                {t("updater.downloadAndInstall")}
              </button>
            </div>
          </div>
        )}

        {/* Downloading State with Progress Bar */}
        {updater.status === "downloading" && updater.progress && (
          <div
            id="updater-downloading-card"
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              background: "var(--bbq-surface-elevated)",
              border: "1px solid var(--bbq-border)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
              <span style={{ fontWeight: 600, color: "var(--bbq-text)" }}>
                {t("updater.downloading", { percentage: updater.progress.percentage })}
              </span>
              <span style={{ color: "var(--bbq-text-muted)" }}>
                {formatBytes(updater.progress.downloadedBytes, currentLanguage)} / {formatBytes(updater.progress.totalBytes, currentLanguage)}
              </span>
            </div>

            <div
              style={{
                width: "100%",
                height: "6px",
                background: "var(--bbq-border)",
                borderRadius: "3px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${updater.progress.percentage}%`,
                  height: "100%",
                  background: "var(--bbq-accent)",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Installing State */}
        {updater.status === "installing" && (
          <div
            id="updater-installing-card"
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              background: "var(--bbq-surface-elevated)",
              border: "1px solid var(--bbq-border)",
              fontSize: "12px",
              color: "var(--bbq-text)",
              fontWeight: 500,
            }}
          >
            {t("updater.installing")}
          </div>
        )}

        {/* Success State - Restart Required */}
        {updater.status === "success" && (
          <div
            id="updater-success-card"
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              background: "rgba(52, 199, 89, 0.1)",
              border: "1px solid var(--bbq-success, #34c759)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--bbq-success, #34c759)" }}>
              {t("updater.installedSuccess")}
            </span>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--bbq-text-muted)" }}>
              {t("updater.restartExplanation", { version: updater.availableVersion || "" })}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                id="updater-restart-btn"
                className="bbq-btn-primary"
                style={{
                  fontSize: "11px",
                  padding: "6px 12px",
                  background: "var(--bbq-success, #34c759)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={handleRestart}
              >
                {t("updater.restartNow")}
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {updater.status === "error" && updater.error && (
          <div
            id="updater-error-card"
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              background: "rgba(255, 59, 48, 0.08)",
              border: "1px solid var(--bbq-danger, #ff3b30)",
              fontSize: "11px",
              color: "var(--bbq-danger, #ff3b30)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>{t("updater.errorChecking", { error: updater.error })}</span>
            <button
              type="button"
              className="bbq-btn-secondary"
              style={{ fontSize: "10px", padding: "2px 6px", cursor: "pointer", flexShrink: 0 }}
              onClick={handleCheck}
            >
              {t("common.retry")}
            </button>
          </div>
        )}
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
