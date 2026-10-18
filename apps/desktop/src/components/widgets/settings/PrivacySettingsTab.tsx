import React from "react";
import { NumberInput, Switch } from "../../common/SettingsControls.tsx";
import { Icon } from "../../common/Icon.tsx";
import type { PrivacySettingsTabProps } from "./settingsTypes.ts";
import { useTranslation } from "../../../i18n/index.ts";

export const PrivacySettingsTab: React.FC<PrivacySettingsTabProps> = ({
  clipboardHistoryEnabled,
  draftClipboardMax,
  draftRetention,
  clipboardLiveSupported,
  capabilities,
  isLoading,
  onDraftClipboardMaxChange,
  onDraftRetentionChange,
  onCommitClipboardMax,
  onCommitRetention,
  onToggle,
  onResetDefaults,
}) => {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = React.useState(false);
  const cancelBtnRef = React.useRef<HTMLButtonElement>(null);

  const handleStartConfirm = () => {
    setShowConfirm(true);
    setTimeout(() => cancelBtnRef.current?.focus(), 40);
  };

  const handleCancelConfirm = () => {
    setShowConfirm(false);
    setTimeout(() => document.getElementById("privacy-reset-defaults-btn")?.focus(), 40);
  };

  const handleExecuteReset = async () => {
    setShowConfirm(false);
    if (onResetDefaults) {
      await onResetDefaults();
    }
  };

  return (
    <div
      id="settings-panel-privacy-content"
      style={{ display: "flex", flexDirection: "column", gap: "14px", paddingBottom: "12px" }}
    >
      {!clipboardLiveSupported && capabilities && (
        <div
          id="clipboard-platform-notice"
          role="status"
          style={{
            padding: "8px 10px",
            borderRadius: "6px",
            background: "rgba(59, 130, 246, 0.12)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            color: "#60a5fa",
            fontSize: "12px",
            lineHeight: 1.4,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Icon name="globe" size={13} aria-hidden="true" />
          <span>
            Clipboard live events are {capabilities.clipboardLiveEvents} on {capabilities.platform}. Clips are captured on-demand upon interaction.
          </span>
        </div>
      )}
      <Switch
        id="clipboard-history-toggle"
        checked={clipboardHistoryEnabled}
        onChange={(checked) => onToggle("clipboard_history_enabled", checked)}
        label={t("settings.privacy.clipboardHistory") || "Clipboard History"}
        description={
          t("settings.privacy.clipboardHistoryDesc") ||
          "Stores copied text clips in local SQLite. Disabling immediately purges all stored items."
        }
      />

      <div id="clipboard-max-slider" className="bbq-numeric-control-wrapper">
        <NumberInput
          id="clipboard-max-input"
          label={t("settings.privacy.maxEntries") || "Max Entries"}
          description={t("settings.privacy.maxEntriesDesc") || "Maximum clipboard history items stored in SQLite (10–100 items)."}
          value={draftClipboardMax}
          min={10}
          max={100}
          step={10}
          unit="items"
          onChange={onDraftClipboardMaxChange}
          onCommit={onCommitClipboardMax}
        />
      </div>

      <div id="clipboard-retention-slider" className="bbq-numeric-control-wrapper">
        <NumberInput
          id="clipboard-retention-input"
          label={t("settings.privacy.retention") || "Retention Period"}
          description={t("settings.privacy.retentionDesc") || "Days to retain clipboard history before automatic purge (1–90 days)."}
          value={draftRetention}
          min={1}
          max={90}
          step={1}
          unit="days"
          onChange={onDraftRetentionChange}
          onCommit={onCommitRetention}
        />
      </div>

      {/* Reset Action — Exclusively in Privacy Tab */}
      {onResetDefaults && (
        <div
          id="privacy-reset-section"
          className="bbq-privacy-reset-card"
          style={{
            marginTop: "8px",
            paddingTop: "14px",
            borderTop: "1px solid var(--bbq-border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--bbq-text)",
              }}
            >
              {t("common.reset") || "Reset Preferences"}
            </span>
            <span
              style={{
                fontSize: "11px",
                color: "var(--bbq-text-muted)",
                lineHeight: 1.4,
              }}
            >
              {t("settings.privacy.resetDesc") ||
                "Restores clipboard retention limits and application preferences to default values. Stored SQLite data history is preserved."}
            </span>
          </div>
          {showConfirm ? (
            <div
              id="privacy-reset-confirm-box"
              role="alertdialog"
              aria-modal="false"
              aria-label={t("settings.resetModal.title") || "Reset Preferences?"}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  handleCancelConfirm();
                }
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--bbq-danger, #ff453a)",
                background: "rgba(255, 69, 58, 0.08)",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--bbq-text)", lineHeight: 1.4 }}>
                {t("settings.resetModal.description") ||
                  "Are you sure you want to reset all preferences to default values? This action cannot be undone."}
              </span>
              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  id="privacy-reset-cancel-btn"
                  ref={cancelBtnRef}
                  className="bbq-btn bbq-btn-secondary"
                  style={{
                    fontSize: "11px",
                    padding: "3px 10px",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                  onClick={handleCancelConfirm}
                >
                  {t("settings.resetModal.cancel") || "Cancel"}
                </button>
                <button
                  type="button"
                  id="privacy-reset-confirm-btn"
                  className="bbq-btn bbq-btn-danger"
                  style={{
                    fontSize: "11px",
                    padding: "3px 12px",
                    background: "var(--bbq-danger, #ff453a)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: isLoading ? "not-allowed" : "pointer",
                  }}
                  disabled={isLoading}
                  onClick={handleExecuteReset}
                >
                  {t("settings.resetModal.confirm") || "Reset to Defaults"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                id="privacy-reset-defaults-btn"
                type="button"
                onClick={handleStartConfirm}
                disabled={isLoading}
                className="bbq-button-danger"
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--bbq-danger)",
                  background: "var(--bbq-danger-bg, rgba(239, 68, 68, 0.1))",
                  color: "var(--bbq-danger)",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 120ms ease",
                }}
                aria-label={t("settings.resetModal.title") || "Reset preferences to defaults"}
              >
                <Icon name="refresh" size={13} aria-hidden="true" />
                <span>{t("common.reset") || "Reset to Defaults"}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
