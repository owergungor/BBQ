import React, { useState } from "react";
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

export const UpdateSettingsTab: React.FC = () => {
  const { t, currentLanguage } = useTranslation();
  const updater = useUpdaterState();
  const [confirmingInstall, setConfirmingInstall] = useState(false);

  const handleCheck = () => {
    setConfirmingInstall(false);
    checkForUpdates();
  };

  const handleStartInstall = () => {
    setConfirmingInstall(true);
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

  return (
    <div
      id="settings-update-tab-panel"
      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
    >
      {/* Current Version & Status Card */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "var(--bbq-surface)",
              color: "var(--bbq-accent)",
            }}
            aria-hidden="true"
          >
            <Icon name="refresh" size={16} />
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--bbq-text)" }}>
                {t("updater.title")}
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
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "var(--bbq-text-muted)",
                display: "block",
                marginTop: "1px",
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
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            id="settings-check-updates-btn"
            className="bbq-btn-secondary"
            style={{
              fontSize: "11px",
              padding: "4px 12px",
              borderRadius: "9999px",
              cursor:
                updater.status === "checking" ||
                updater.status === "downloading" ||
                updater.status === "installing"
                  ? "not-allowed"
                  : "pointer",
              opacity:
                updater.status === "checking" ||
                updater.status === "downloading" ||
                updater.status === "installing"
                  ? 0.7
                  : 1,
            }}
            disabled={
              updater.status === "checking" ||
              updater.status === "downloading" ||
              updater.status === "installing"
            }
            onClick={handleCheck}
          >
            {updater.status === "checking" ? t("updater.checking") : t("updater.checkForUpdates")}
          </button>
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

      {/* Update Available Card */}
      {updater.status === "update_available" && updater.availableVersion && (
        <div
          id="updater-available-card"
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
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
                padding: "6px 8px",
                background: "var(--bbq-surface)",
                borderRadius: "6px",
                border: "1px solid var(--bbq-border)",
                whiteSpace: "pre-wrap",
                lineHeight: "1.35",
              }}
            >
              <strong style={{ display: "block", marginBottom: "3px" }}>
                {t("updater.releaseNotes")}:
              </strong>
              {updater.releaseNotes}
            </div>
          )}

          {confirmingInstall ? (
            <div
              id="updater-confirm-prompt"
              style={{
                padding: "6px 10px",
                background: "var(--bbq-surface)",
                borderRadius: "6px",
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
                    fontSize: "11px",
                    padding: "3px 10px",
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
                    fontSize: "11px",
                    padding: "3px 12px",
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
          ) : (
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
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
            </div>
          )}
        </div>
      )}

      {/* Downloading State with Progress Bar */}
      {updater.status === "downloading" && updater.progress && (
        <div
          id="updater-downloading-card"
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            background: "var(--bbq-surface-elevated)",
            border: "1px solid var(--bbq-border)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11px",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--bbq-text)" }}>
              {t("updater.downloading", { percentage: updater.progress.percentage })}
            </span>
            <span style={{ color: "var(--bbq-text-muted)" }}>
              {formatBytes(updater.progress.downloadedBytes, currentLanguage)} /{" "}
              {formatBytes(updater.progress.totalBytes, currentLanguage)}
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
            padding: "8px 12px",
            borderRadius: "8px",
            background: "var(--bbq-surface-elevated)",
            border: "1px solid var(--bbq-border)",
            fontSize: "12px",
            color: "var(--bbq-text)",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ color: "var(--bbq-accent)" }} aria-hidden="true">
            <Icon name="refresh" size={14} />
          </span>
          <span>{t("updater.installing")}</span>
        </div>
      )}

      {/* Success State - Restart Required */}
      {updater.status === "success" && (
        <div
          id="updater-success-card"
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            background: "rgba(52, 199, 89, 0.1)",
            border: "1px solid var(--bbq-success, #34c759)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--bbq-success, #34c759)" }} aria-hidden="true">
              <Icon name="check" size={16} />
            </span>
            <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--bbq-success, #34c759)" }}>
              {t("updater.installedSuccess")}
            </span>
          </div>
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
          </div>
        </div>
      )}

      {/* Error State */}
      {updater.status === "error" && updater.error && (
        <div
          id="updater-error-card"
          style={{
            padding: "8px 10px",
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
