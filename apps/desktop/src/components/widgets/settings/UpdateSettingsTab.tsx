import React, { useState } from "react";
import { Icon } from "../../common/Icon.tsx";
import { APP_VERSION } from "../../../version.ts";
import { openAllowlistedReleaseUrl } from "../../../state/settingsState.ts";
import {
  useUpdaterState,
  checkForUpdates,
  downloadAndInstallUpdate,
  restartApp,
  openUpdateModal,
} from "../../../state/updaterState.ts";
import { useTranslation, formatLocaleDate } from "../../../i18n/index.ts";

export const UpdateSettingsTab: React.FC = () => {
  const { t, currentLanguage } = useTranslation();
  const updater = useUpdaterState();
  const [confirmingInstall, setConfirmingInstall] = useState(false);

  const handleCheck = () => {
    setConfirmingInstall(false);
    checkForUpdates();
  };

  const handleStartInstall = () => {
    openUpdateModal();
  };

  const handleConfirmInstall = () => {
    setConfirmingInstall(false);
    downloadAndInstallUpdate();
  };

  const handleCancelConfirm = () => {
    setConfirmingInstall(false);
  };

  const handleRestart = () => {
    restartApp();
  };

  const isBusy =
    updater.status === "checking" ||
    updater.status === "downloading" ||
    updater.status === "installing";

  return (
    <div
      id="settings-update-tab-panel"
      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
    >
      {/* Compact Main Integrated Update Card */}
      <div
        style={{
          padding: "8px 12px",
          background: "var(--bbq-surface-elevated)",
          borderRadius: "8px",
          border: "1px solid var(--bbq-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "var(--bbq-surface)",
              color: updater.status === "success" ? "var(--bbq-success, #34c759)" : "var(--bbq-accent)",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <Icon
              name={
                updater.status === "success"
                  ? "check"
                  : updater.status === "error"
                  ? "alert-triangle"
                  : "refresh"
              }
              size={16}
            />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--bbq-text)" }}>
                BBQ
              </span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "1px 6px",
                  borderRadius: "9999px",
                  background: "var(--bbq-surface)",
                  color: "var(--bbq-accent)",
                  fontWeight: 600,
                }}
              >
                v{APP_VERSION}
              </span>
              <span
                id="updater-status-pill"
                className="bbq-capability-badge"
                style={{
                  fontSize: "10px",
                  padding: "1px 7px",
                  borderRadius: "9999px",
                  fontWeight: 500,
                  background:
                    updater.status === "update_available"
                      ? "rgba(10, 132, 255, 0.15)"
                      : updater.status === "success"
                      ? "rgba(52, 199, 89, 0.15)"
                      : updater.status === "error"
                      ? "rgba(255, 69, 58, 0.15)"
                      : "var(--bbq-surface)",
                  color:
                    updater.status === "update_available"
                      ? "var(--bbq-accent, #0a84ff)"
                      : updater.status === "success"
                      ? "var(--bbq-success, #34c759)"
                      : updater.status === "error"
                      ? "var(--bbq-danger, #ff453a)"
                      : "var(--bbq-text-muted)",
                }}
              >
                {updater.status === "update_available" && (t("updater.statusAvailable") || "Update Available")}
                {updater.status === "checking" && (t("updater.statusChecking") || "Checking...")}
                {updater.status === "up_to_date" && (t("updater.statusUpToDate") || "Up to date")}
                {updater.status === "downloading" && (t("updater.statusDownloading") || "Downloading...")}
                {updater.status === "installing" && (t("updater.statusInstalling") || "Installing...")}
                {updater.status === "success" && (t("updater.statusReady") || "Ready to Install")}
                {updater.status === "error" && (t("updater.statusError") || "Error")}
                {updater.status === "idle" && (t("updater.statusUpToDate") || "Up to date")}
              </span>
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "var(--bbq-text-muted)",
                display: "block",
                marginTop: "1px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {updater.status === "up_to_date"
                ? t("updater.upToDate", { version: APP_VERSION })
                : updater.status === "checking"
                ? t("updater.checking")
                : updater.status === "update_available" && updater.availableVersion
                ? t("updater.updateAvailable", { version: updater.availableVersion })
                : updater.status === "downloading"
                ? t("updater.downloading", { percentage: updater.progress?.percentage ?? 0 })
                : updater.status === "installing"
                ? t("updater.installing")
                : updater.status === "success"
                ? t("updater.installedSuccess")
                : t("updater.description")}
            </span>
            {updater.lastCheckedAt && updater.status === "up_to_date" && (
              <span style={{ fontSize: "10px", color: "var(--bbq-text-muted)", display: "block" }}>
                {t("updater.lastChecked", {
                  time: formatLocaleDate(new Date(updater.lastCheckedAt).toISOString(), currentLanguage),
                }) || `Last checked: ${formatLocaleDate(new Date(updater.lastCheckedAt).toISOString(), currentLanguage)}`}
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {updater.status === "success" ? (
            <button
              type="button"
              id="updater-restart-btn"
              className="bbq-btn-primary"
              style={{
                fontSize: "11px",
                padding: "4px 14px",
                background: "var(--bbq-success, #34c759)",
                color: "#ffffff",
                border: "none",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={handleRestart}
            >
              {t("updater.restartNow")}
            </button>
          ) : updater.status === "update_available" && !confirmingInstall ? (
            <button
              type="button"
              id="updater-install-btn"
              className="bbq-btn-primary"
              style={{
                fontSize: "11px",
                padding: "4px 14px",
                background: "var(--bbq-accent)",
                color: "#ffffff",
                border: "none",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={handleStartInstall}
            >
              {t("updater.downloadAndInstall")}
            </button>
          ) : (
            <button
              type="button"
              id="settings-check-updates-btn"
              className="bbq-btn-secondary"
              style={{
                fontSize: "11px",
                padding: "4px 12px",
                borderRadius: "9999px",
                cursor: isBusy ? "not-allowed" : "pointer",
                opacity: isBusy ? 0.7 : 1,
              }}
              disabled={isBusy}
              onClick={handleCheck}
            >
              {updater.status === "checking" ? t("updater.checking") : t("updater.checkForUpdates")}
            </button>
          )}

          <button
            type="button"
            id="settings-view-releases-btn"
            className="bbq-btn-secondary"
            style={{
              fontSize: "11px",
              padding: "4px 12px",
              borderRadius: "9999px",
              cursor: "pointer",
            }}
            onClick={() => openAllowlistedReleaseUrl()}
          >
            {t("updater.viewReleases")}
          </button>
        </div>
      </div>

      {/* Release Notes (bounded to maxHeight 80px) */}
      {updater.releaseNotes && updater.status === "update_available" && (
        <div
          id="updater-available-notes"
          style={{
            fontSize: "11px",
            color: "var(--bbq-text)",
            maxHeight: "80px",
            overflowY: "auto",
            padding: "6px 8px",
            background: "var(--bbq-surface)",
            borderRadius: "6px",
            border: "1px solid var(--bbq-border)",
            whiteSpace: "pre-wrap",
            lineHeight: "1.3",
          }}
        >
          {updater.releaseNotes}
        </div>
      )}

      {/* Confirmation prompt (preserves test backwards-compatibility) */}
      {confirmingInstall && (
        <div
          id="updater-confirm-prompt"
          style={{
            padding: "8px 12px",
            background: "var(--bbq-surface)",
            borderRadius: "8px",
            border: "1px solid var(--bbq-accent)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--bbq-text)" }}>
            {t("updater.confirmDownload", { version: `v${updater.availableVersion}` }) ||
              `Ready to download and install v${updater.availableVersion}?`}
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              id="updater-confirm-cancel-btn"
              className="bbq-btn-secondary"
              style={{
                fontSize: "10px",
                padding: "3px 8px",
                borderRadius: "9999px",
                cursor: "pointer",
              }}
              onClick={handleCancelConfirm}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              id="updater-confirm-install-btn"
              className="bbq-btn-primary"
              style={{
                fontSize: "10px",
                padding: "3px 10px",
                background: "var(--bbq-accent)",
                color: "#ffffff",
                border: "none",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={handleConfirmInstall}
            >
              {t("updater.downloadAndInstall")}
            </button>
          </div>
        </div>
      )}

      {/* Error Banner if error occurs */}
      {updater.status === "error" && updater.error && (
        <div
          id="updater-error-card"
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
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
            id="updater-error-retry-btn"
            className="bbq-btn-secondary"
            style={{
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "9999px",
              cursor: "pointer",
              flexShrink: 0,
            }}
            onClick={handleCheck}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
    </div>
  );
};
