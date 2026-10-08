import React from "react";
import { Switch } from "../../common/SettingsControls.tsx";
import { Icon } from "../../common/Icon.tsx";
import type { HotkeySettingsTabProps } from "./settingsTypes.ts";

export const HotkeySettingsTab: React.FC<HotkeySettingsTabProps> = ({
  globalHotkey,
  hotkeyEnabled,
  draftHotkey,
  isRecordingHotkey,
  hotkeyError,
  conflictError,
  hotkeySupported,
  capabilities,
  hotkeyInputRef,
  onDraftHotkeyChange,
  onStartRecording,
  onStopRecording,
  onSaveHotkey,
  onCancelHotkey,
  onHotkeyKeyDown,
  onToggle,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {!hotkeySupported && capabilities && (
        <div
          id="hotkey-platform-warning"
          role="status"
          style={{
            padding: "8px 10px",
            borderRadius: "6px",
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            color: "#f59e0b",
            fontSize: "12px",
            lineHeight: 1.4,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Icon name="globe" size={13} aria-hidden="true" />
          <span>
            Global shortcut registration is {capabilities.globalHotkey} on {capabilities.platform}. The island can be opened via tray icon or CLI.
          </span>
        </div>
      )}

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <label htmlFor="global-hotkey-input" style={{ fontWeight: 500, fontSize: "13px" }}>
            Global Shortcut Combination
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>Current:</span>
            <span
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid var(--bbq-border)",
                borderRadius: "4px",
                padding: "1px 6px",
                fontSize: "11px",
                fontFamily: "monospace",
                fontWeight: 600,
                color: hotkeyEnabled ? "var(--bbq-accent, #60a5fa)" : "var(--bbq-text-muted)",
              }}
            >
              {globalHotkey || "None"}
            </span>
            {!hotkeyEnabled && (
              <span style={{ fontSize: "10px", color: "#f59e0b" }}>(Disabled)</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            ref={hotkeyInputRef}
            id="global-hotkey-input"
            type="text"
            data-hotkey-recording={isRecordingHotkey ? "true" : undefined}
            value={
              isRecordingHotkey
                ? draftHotkey
                  ? `${draftHotkey}...`
                  : "Press key combination..."
                : draftHotkey
            }
            onChange={(e) => {
              if (!isRecordingHotkey) {
                onDraftHotkeyChange(e.target.value);
              }
            }}
            onKeyDown={onHotkeyKeyDown}
            placeholder={isRecordingHotkey ? "Press key combination..." : "e.g. Ctrl+Shift+B"}
            disabled={!hotkeySupported}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: "6px",
              border: isRecordingHotkey
                ? "1px solid var(--bbq-accent)"
                : "1px solid var(--bbq-border)",
              background: isRecordingHotkey
                ? "var(--bbq-accent-subtle, rgba(255, 107, 53, 0.15))"
                : "var(--bbq-surface)",
              color: "var(--bbq-text)",
              fontSize: "13px",
              boxSizing: "border-box",
              opacity: !hotkeySupported ? 0.5 : 1,
              cursor: !hotkeySupported ? "not-allowed" : "text",
            }}
            aria-label="Global hotkey combination"
          />
          <button
            type="button"
            id="record-hotkey-btn"
            disabled={!hotkeySupported}
            onClick={() => {
              if (!isRecordingHotkey) {
                onStartRecording();
              } else {
                onStopRecording();
              }
            }}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--bbq-border)",
              background: isRecordingHotkey
                ? "var(--bbq-accent)"
                : "rgba(255, 255, 255, 0.06)",
              color: isRecordingHotkey ? "#fff" : "var(--bbq-text)",
              fontSize: "12px",
              cursor: !hotkeySupported ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              opacity: !hotkeySupported ? 0.5 : 1,
            }}
          >
            {isRecordingHotkey ? "Stop Recording" : "Record Keys"}
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button
            type="button"
            id="save-hotkey-btn"
            onClick={onSaveHotkey}
            disabled={
              !hotkeySupported ||
              draftHotkey.trim() === globalHotkey ||
              !draftHotkey.trim()
            }
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "none",
              background:
                draftHotkey.trim() === globalHotkey || !draftHotkey.trim()
                  ? "rgba(255, 255, 255, 0.08)"
                  : "var(--bbq-accent, #3b82f6)",
              color:
                draftHotkey.trim() === globalHotkey || !draftHotkey.trim()
                  ? "var(--bbq-text-muted)"
                  : "#fff",
              fontSize: "12px",
              fontWeight: 500,
              cursor:
                draftHotkey.trim() === globalHotkey || !draftHotkey.trim()
                  ? "default"
                  : "pointer",
            }}
          >
            Save Hotkey
          </button>
          <button
            type="button"
            id="cancel-hotkey-btn"
            onClick={onCancelHotkey}
            disabled={draftHotkey === globalHotkey && !isRecordingHotkey}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid var(--bbq-border)",
              background: "transparent",
              color: "var(--bbq-text)",
              fontSize: "12px",
              cursor:
                draftHotkey === globalHotkey && !isRecordingHotkey
                  ? "default"
                  : "pointer",
              opacity:
                draftHotkey === globalHotkey && !isRecordingHotkey
                  ? 0.5
                  : 1,
            }}
          >
            Cancel
          </button>
        </div>

        {(hotkeyError || conflictError) && (
          <div
            id="hotkey-conflict-error"
            role="alert"
            style={{
              marginTop: "8px",
              padding: "8px 10px",
              borderRadius: "6px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: "12px",
              lineHeight: 1.4,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Icon name="close" size={13} aria-hidden="true" />
            <span>{hotkeyError || conflictError}</span>
          </div>
        )}

        <span
          style={{
            fontSize: "11px",
            color: "var(--bbq-text-muted)",
            display: "block",
            marginTop: "6px",
          }}
        >
          Pressing this shortcut globally expands BBQ to front and focuses the Launcher search.
        </span>
      </div>

      <div style={{ paddingTop: "6px", borderTop: "1px solid var(--bbq-border)" }}>
        <Switch
          id="hotkey-enable-toggle"
          checked={hotkeyEnabled}
          disabled={!hotkeySupported}
          onChange={(checked) => onToggle("hotkey_enabled", checked)}
          label="Hotkey Trigger Enabled"
          description={
            !hotkeySupported && capabilities
              ? `Global shortcuts are ${capabilities.globalHotkey} on ${capabilities.platform}.`
              : "Toggle whether the global shortcut is actively registered with the OS."
          }
        />
      </div>
    </div>
  );
};
