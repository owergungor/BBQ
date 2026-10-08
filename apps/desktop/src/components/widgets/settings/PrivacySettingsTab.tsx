import React from "react";
import { Slider, Switch } from "../../common/SettingsControls.tsx";
import { Icon } from "../../common/Icon.tsx";
import type { PrivacySettingsTabProps } from "./settingsTypes.ts";

export const PrivacySettingsTab: React.FC<PrivacySettingsTabProps> = ({
  clipboardHistoryEnabled,
  draftClipboardMax,
  draftRetention,
  clipboardLiveSupported,
  capabilities,
  onDraftClipboardMaxChange,
  onDraftRetentionChange,
  onCommitClipboardMax,
  onCommitRetention,
  onToggle,
}) => {
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
        label="Clipboard History"
        description="Stores copied text clips in local SQLite. Disabling immediately purges all stored items."
      />

      <Slider
        id="clipboard-max-slider"
        label="Max Entries"
        value={draftClipboardMax}
        min={10}
        max={100}
        step={10}
        valueDisplay={`${draftClipboardMax} items`}
        onChange={onDraftClipboardMaxChange}
        onCommit={onCommitClipboardMax}
      />

      <Slider
        id="clipboard-retention-slider"
        label="Retention Period"
        value={draftRetention}
        min={1}
        max={90}
        step={1}
        valueDisplay={`${draftRetention} days`}
        onChange={onDraftRetentionChange}
        onCommit={onCommitRetention}
      />
    </div>
  );
};
