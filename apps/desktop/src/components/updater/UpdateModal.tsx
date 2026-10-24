import React, { useEffect, useRef, useCallback } from "react";
import { Icon } from "../common/Icon.tsx";
import { APP_VERSION } from "../../version.ts";
import {
  useUpdaterState,
  downloadAndInstallUpdate,
  restartApp,
  checkForUpdates,
} from "../../state/updaterState.ts";
import { useTranslation, formatLocaleDate, formatBytes } from "../../i18n/index.ts";
import { escapeManager, EscapePriority } from "../../island/escapeManager.ts";

export interface UpdateModalProps {
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ onClose }) => {
  const { t, currentLanguage } = useTranslation();
  const updater = useUpdaterState();
  const modalCardRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isBusy = updater.status === "downloading" || updater.status === "installing";

  // Safe dismiss handler
  const handleSafeClose = useCallback(() => {
    if (isBusy) return;
    onClose();
  }, [isBusy, onClose]);

  // Escape key coordination
  useEffect(() => {
    const unregister = escapeManager.register(() => {
      if (!isBusy) {
        onClose();
        return true;
      }
      return false;
    }, EscapePriority.MODAL);

    return unregister;
  }, [isBusy, onClose]);

  // Focus management: save previous focus, focus primary button, restore on unmount
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleStartInstall = async () => {
    if (isBusy) return;
    await downloadAndInstallUpdate();
  };

  const handleRestart = async () => {
    await restartApp();
  };

  const handleRetry = async () => {
    if (isBusy) return;
    await checkForUpdates(true);
  };

  return (
    <div
      id="bbq-update-modal-backdrop"
      className="bbq-update-modal-backdrop"
      role="presentation"
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          handleSafeClose();
        }
      }}
    >
      <div
        ref={modalCardRef}
        id="bbq-update-modal-card"
        className="bbq-update-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bbq-update-modal-title"
        onContextMenu={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bbq-update-modal-header">
          <div className="bbq-update-modal-title" id="bbq-update-modal-title">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                color: updater.status === "success" ? "var(--bbq-success, #34c759)" : "var(--bbq-accent, #0a84ff)",
              }}
              aria-hidden="true"
            >
              <Icon
                name={
                  updater.status === "success"
                    ? "check"
                    : updater.status === "error"
                    ? "alert-triangle"
                    : updater.status === "downloading" || updater.status === "installing"
                    ? "refresh"
                    : "sparkles"
                }
                size={16}
              />
            </span>
            <span>{t("updater.modalTitle") || "Update BBQ"}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="bbq-update-modal-version-badge" aria-label={`From version ${APP_VERSION} to ${updater.availableVersion || APP_VERSION}`}>
              <span>v{APP_VERSION}</span>
              <span aria-hidden="true" style={{ opacity: 0.6 }}>→</span>
              <span style={{ fontWeight: 700 }}>v{updater.availableVersion || APP_VERSION}</span>
            </div>
            {!isBusy && (
              <button
                type="button"
                id="updater-modal-header-close-btn"
                onClick={handleSafeClose}
                aria-label={t("common.close") || "Close"}
                title={t("common.close") || "Close"}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "4px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--bbq-text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Release Summary & Date */}
        {updater.releaseDate && (
          <div style={{ fontSize: "10px", color: "var(--bbq-text-muted)" }}>
            {t("updater.releaseDate", { date: formatLocaleDate(updater.releaseDate, currentLanguage) })}
          </div>
        )}

        {/* Release Notes */}
        {updater.releaseNotes && (
          <div
            id="bbq-update-modal-notes"
            className="bbq-update-modal-notes"
            tabIndex={0}
            role="region"
            aria-label={t("updater.releaseNotes") || "Release Notes"}
          >
            {updater.releaseNotes}
          </div>
        )}

        {/* Status / Progress Area */}
        <div className="bbq-update-modal-progress">
          {updater.status === "downloading" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                <span style={{ fontWeight: 600, color: "var(--bbq-text)" }}>
                  {t("updater.downloading", { percentage: updater.progress?.percentage ?? 0 })}
                </span>
                {updater.progress && updater.progress.totalBytes > 0 && (
                  <span style={{ color: "var(--bbq-text-muted)", fontSize: "10px" }}>
                    {formatBytes(updater.progress.downloadedBytes, currentLanguage)} /{" "}
                    {formatBytes(updater.progress.totalBytes, currentLanguage)}
                  </span>
                )}
              </div>
              <div className="bbq-update-modal-progress-bar-bg" role="progressbar" aria-valuenow={updater.progress?.percentage ?? 0} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="bbq-update-modal-progress-bar-fill"
                  style={{
                    width: updater.progress && updater.progress.totalBytes > 0
                      ? `${Math.max(4, Math.min(100, updater.progress.percentage))}%`
                      : "40%",
                  }}
                />
              </div>
            </div>
          )}

          {updater.status === "installing" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--bbq-text)" }}>
              <span style={{ color: "var(--bbq-accent)" }} aria-hidden="true">
                <Icon name="refresh" size={14} />
              </span>
              <span style={{ fontWeight: 500 }}>{t("updater.installing")}</span>
            </div>
          )}

          {updater.status === "success" && (
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                background: "rgba(52, 199, 89, 0.12)",
                border: "1px solid var(--bbq-success, #34c759)",
                fontSize: "11px",
                color: "var(--bbq-text)",
                lineHeight: "1.4",
              }}
            >
              {t("updater.restartExplanation", { version: updater.availableVersion || APP_VERSION })}
            </div>
          )}

          {updater.status === "error" && updater.error && (
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                background: "rgba(255, 59, 48, 0.10)",
                border: "1px solid var(--bbq-danger, #ff3b30)",
                fontSize: "11px",
                color: "var(--bbq-danger, #ff3b30)",
                lineHeight: "1.4",
              }}
            >
              {t("updater.errorDownloading", { error: updater.error })}
            </div>
          )}

          {updater.status === "update_available" && !updater.releaseNotes && (
            <div style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
              {t("updater.confirmDownload", { version: `v${updater.availableVersion}` })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bbq-update-modal-footer">
          {updater.status === "success" ? (
            <>
              <button
                type="button"
                id="updater-modal-close-btn"
                className="bbq-btn-secondary"
                style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "9999px", cursor: "pointer" }}
                onClick={handleSafeClose}
              >
                {t("common.close")}
              </button>
              <button
                ref={primaryBtnRef}
                type="button"
                id="updater-restart-btn"
                className="bbq-btn-primary"
                style={{
                  fontSize: "11px",
                  padding: "4px 16px",
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
            </>
          ) : updater.status === "error" ? (
            <>
              <button
                type="button"
                id="updater-modal-close-btn"
                className="bbq-btn-secondary"
                style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "9999px", cursor: "pointer" }}
                onClick={handleSafeClose}
              >
                {t("common.close")}
              </button>
              <button
                ref={primaryBtnRef}
                type="button"
                id="updater-modal-retry-btn"
                className="bbq-btn-primary"
                style={{
                  fontSize: "11px",
                  padding: "4px 14px",
                  background: "var(--bbq-accent, #0a84ff)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "9999px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={handleRetry}
              >
                {t("common.retry")}
              </button>
            </>
          ) : isBusy ? (
            <button
              type="button"
              id="updater-modal-cancel-disabled-btn"
              className="bbq-btn-secondary"
              style={{
                fontSize: "11px",
                padding: "4px 12px",
                borderRadius: "9999px",
                cursor: "not-allowed",
                opacity: 0.5,
              }}
              disabled
              title={t("updater.cannotCancel") || "Download in progress cannot be cancelled"}
            >
              {t("common.cancel")}
            </button>
          ) : (
            <>
              <button
                type="button"
                id="updater-modal-close-btn"
                className="bbq-btn-secondary"
                style={{ fontSize: "11px", padding: "4px 12px", borderRadius: "9999px", cursor: "pointer" }}
                onClick={handleSafeClose}
              >
                {t("common.cancel")}
              </button>
              <button
                ref={primaryBtnRef}
                type="button"
                id="updater-install-btn"
                className="bbq-btn-primary"
                style={{
                  fontSize: "11px",
                  padding: "4px 16px",
                  background: "var(--bbq-accent, #0a84ff)",
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
