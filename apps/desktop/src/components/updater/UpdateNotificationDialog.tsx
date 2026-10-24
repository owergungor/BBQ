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

export interface UpdateNotificationDialogProps {
  onClose: () => void;
  standalone?: boolean;
}

export const UpdateNotificationDialog: React.FC<UpdateNotificationDialogProps> = ({
  onClose,
  standalone = false,
}) => {
  const { t, currentLanguage } = useTranslation();
  const updater = useUpdaterState();
  const dialogCardRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isBusy = updater.status === "downloading" || updater.status === "installing";

  // Safe dismiss handler ("Sonra" / "Later")
  const handleLater = useCallback(() => {
    if (isBusy) return;
    onClose();
  }, [isBusy, onClose]);

  // Primary action handler ("Güncelle" / "Update")
  const handleUpdate = useCallback(async () => {
    if (isBusy) return;
    await downloadAndInstallUpdate();
  }, [isBusy]);

  const handleRestart = useCallback(async () => {
    await restartApp();
  }, []);

  const handleRetry = useCallback(async () => {
    if (isBusy) return;
    await checkForUpdates(true);
  }, [isBusy]);

  // Keyboard navigation: Enter triggers primary, Escape triggers "Sonra"
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (updater.status === "success") {
          handleRestart();
        } else if (updater.status === "error") {
          handleRetry();
        } else if (!isBusy) {
          handleUpdate();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBusy, updater.status, handleUpdate, handleRestart, handleRetry]);

  // Escape key coordination via centralized escapeManager
  useEffect(() => {
    const unregister = escapeManager.register(() => {
      if (!isBusy) {
        handleLater();
        return true;
      }
      return false;
    }, EscapePriority.MODAL);

    return unregister;
  }, [isBusy, handleLater]);

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

  const cardContent = (
    <div
      ref={dialogCardRef}
      id="bbq-update-notification-dialog"
      className="bbq-update-modal-card bbq-update-notification-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bbq-update-notification-title"
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        maxWidth: "460px",
        width: "100%",
        borderRadius: "var(--bbq-radius-xl, 16px)",
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4)",
        border: "1px solid var(--bbq-border)",
        background: "var(--bbq-surface)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        color: "var(--bbq-text)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "18px 20px",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        className="bbq-update-modal-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div
          id="bbq-update-notification-title"
          className="bbq-update-modal-title"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontWeight: 700,
            fontSize: "14px",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              color:
                updater.status === "success"
                  ? "var(--bbq-success, #34c759)"
                  : "var(--bbq-accent, #0a84ff)",
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
              size={18}
            />
          </span>
          <span>{t("updater.notificationTitle") || "BBQ Update Available"}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Version Transition Badge */}
          <div
            id="update-notification-version-badge"
            className="bbq-update-modal-version-badge"
            aria-label={`From version ${APP_VERSION} to ${updater.availableVersion || APP_VERSION}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 8px",
              borderRadius: "9999px",
              background: "var(--bbq-surface-subtle, rgba(255, 255, 255, 0.08))",
              fontSize: "11px",
              fontFamily: "var(--bbq-font-mono, monospace)",
              border: "1px solid var(--bbq-border-subtle, rgba(255, 255, 255, 0.1))",
            }}
          >
            <span>v{APP_VERSION}</span>
            <span aria-hidden="true" style={{ opacity: 0.6 }}>→</span>
            <span style={{ fontWeight: 700, color: "var(--bbq-accent, #0a84ff)" }}>
              v{updater.availableVersion || APP_VERSION}
            </span>
          </div>

          {!isBusy && (
            <button
              type="button"
              id="update-notification-header-close-btn"
              onClick={handleLater}
              aria-label={t("updater.actionLater") || t("common.close") || "Later"}
              title={t("updater.actionLater") || t("common.close") || "Later"}
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

      {/* Message / Description */}
      <div
        id="bbq-update-notification-message"
        style={{
          fontSize: "12px",
          lineHeight: "1.5",
          color: "var(--bbq-text)",
        }}
      >
        {t("updater.notificationMessage") || "A new version of BBQ is ready to download and install."}
      </div>

      {/* Release Date */}
      {updater.releaseDate && (
        <div style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
          {t("updater.releaseDate", { date: formatLocaleDate(updater.releaseDate, currentLanguage) })}
        </div>
      )}

      {/* Release Notes Snippet */}
      {updater.releaseNotes && (
        <div
          id="bbq-update-notification-notes"
          className="bbq-update-modal-notes"
          tabIndex={0}
          role="region"
          aria-label={t("updater.releaseNotes") || "Release Notes"}
          style={{
            maxHeight: "120px",
            overflowY: "auto",
            padding: "8px 10px",
            borderRadius: "8px",
            background: "var(--bbq-surface-subtle, rgba(0, 0, 0, 0.2))",
            border: "1px solid var(--bbq-border-subtle, rgba(255, 255, 255, 0.06))",
            fontSize: "11px",
            lineHeight: "1.4",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {updater.releaseNotes}
        </div>
      )}

      {/* Progress & Status Area */}
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
            <div
              className="bbq-update-modal-progress-bar-bg"
              role="progressbar"
              aria-valuenow={updater.progress?.percentage ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                width: "100%",
                height: "6px",
                borderRadius: "3px",
                background: "var(--bbq-surface-subtle, rgba(255, 255, 255, 0.1))",
                overflow: "hidden",
              }}
            >
              <div
                className="bbq-update-modal-progress-bar-fill"
                style={{
                  height: "100%",
                  background: "var(--bbq-accent, #0a84ff)",
                  borderRadius: "3px",
                  transition: "width 0.2s ease-out",
                  width:
                    updater.progress && updater.progress.totalBytes > 0
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
      </div>

      {/* Footer Actions */}
      <div
        className="bbq-update-modal-footer"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "10px",
          marginTop: "6px",
        }}
      >
        {updater.status === "success" ? (
          <>
            <button
              type="button"
              id="update-notification-dismiss-btn"
              className="bbq-btn-secondary"
              style={{
                fontSize: "12px",
                padding: "6px 14px",
                borderRadius: "9999px",
                cursor: "pointer",
              }}
              onClick={handleLater}
            >
              {t("updater.actionLater") || t("common.close") || "Later"}
            </button>
            <button
              ref={primaryBtnRef}
              type="button"
              id="update-notification-restart-btn"
              className="bbq-btn-primary"
              style={{
                fontSize: "12px",
                padding: "6px 18px",
                background: "var(--bbq-success, #34c759)",
                color: "#ffffff",
                border: "none",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={handleRestart}
            >
              {t("updater.restartNow") || "Restart BBQ"}
            </button>
          </>
        ) : updater.status === "error" ? (
          <>
            <button
              type="button"
              id="update-notification-later-btn"
              className="bbq-btn-secondary"
              style={{
                fontSize: "12px",
                padding: "6px 14px",
                borderRadius: "9999px",
                cursor: "pointer",
              }}
              onClick={handleLater}
            >
              {t("updater.actionLater") || t("common.close") || "Later"}
            </button>
            <button
              ref={primaryBtnRef}
              type="button"
              id="update-notification-retry-btn"
              className="bbq-btn-primary"
              style={{
                fontSize: "12px",
                padding: "6px 16px",
                background: "var(--bbq-accent, #0a84ff)",
                color: "#ffffff",
                border: "none",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={handleRetry}
            >
              {t("common.retry") || "Retry"}
            </button>
          </>
        ) : isBusy ? (
          <button
            type="button"
            id="update-notification-busy-btn"
            className="bbq-btn-secondary"
            style={{
              fontSize: "12px",
              padding: "6px 14px",
              borderRadius: "9999px",
              cursor: "not-allowed",
              opacity: 0.5,
            }}
            disabled
            title={t("updater.cannotCancel") || "Download in progress cannot be cancelled"}
          >
            {t("updater.actionLater") || "Later"}
          </button>
        ) : (
          <>
            <button
              type="button"
              id="update-notification-later-btn"
              className="bbq-btn-secondary"
              style={{
                fontSize: "12px",
                padding: "6px 16px",
                borderRadius: "9999px",
                cursor: "pointer",
                background: "var(--bbq-surface-subtle, rgba(255, 255, 255, 0.08))",
                border: "1px solid var(--bbq-border)",
                color: "var(--bbq-text)",
              }}
              onClick={handleLater}
            >
              {t("updater.actionLater") || "Later"}
            </button>
            <button
              ref={primaryBtnRef}
              type="button"
              id="update-notification-update-btn"
              className="bbq-btn-primary"
              style={{
                fontSize: "12px",
                padding: "6px 20px",
                background: "var(--bbq-accent, #0a84ff)",
                color: "#ffffff",
                border: "none",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={handleUpdate}
            >
              {t("updater.actionUpdate") || "Update"}
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div
        id="bbq-update-notification-standalone"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      id="bbq-update-notification-backdrop"
      className="bbq-update-modal-backdrop"
      role="presentation"
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          handleLater();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      {cardContent}
    </div>
  );
};
