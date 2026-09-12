import React, { useCallback } from "react";
import { clipboardStore, useClipboardState } from "../../state/clipboardState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import type { ClipboardEntry } from "@bbq/types";

export const ClipboardWidget: React.FC = () => {
  const { enabled, entries, status } = useClipboardState();

  const handleToggleEnabled = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !enabled;
    await bbqCommands.clipboardSetHistoryEnabled(next);
    clipboardStore.setState({ enabled: next });
    if (next) {
      const history = await bbqCommands.clipboardGetHistory();
      const updatedStatus = await bbqCommands.clipboardGetStatus();
      clipboardStore.setState({ entries: history, status: updatedStatus });
    } else {
      clipboardStore.setState({ entries: [], status: null });
    }
  }, [enabled]);

  const handleClearHistory = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.clipboardClearHistory();
    clipboardStore.setState({
      entries: [],
      status: status ? { ...status, total_entries: 0 } : null,
    });
  }, [status]);

  const handleDeleteEntry = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await bbqCommands.clipboardDeleteEntry(id);
      clipboardStore.setState((prev) => ({
        entries: prev.entries.filter((entry) => entry.id !== id),
        status: prev.status
          ? {
              ...prev.status,
              total_entries: Math.max(0, prev.status.total_entries - 1),
            }
          : null,
      }));
    },
    []
  );

  const handleCopyAgain = useCallback(
    async (e: React.MouseEvent, entry: ClipboardEntry) => {
      e.stopPropagation();
      if (entry.content) {
        try {
          await navigator.clipboard.writeText(entry.content);
        } catch {
          // Fallback if browser clipboard permission is restricted
        }
      }
    },
    []
  );

  const formatTypeIcon = (type: string) => {
    switch (type) {
      case "text":
        return "📄";
      case "image":
        return "🖼️";
      case "file_list":
        return "📁";
      default:
        return "📎";
    }
  };

  return (
    <div className="bbq-clipboard-widget" onClick={(e) => e.stopPropagation()}>
      <div className="bbq-clipboard-header">
        <div className="bbq-clipboard-title-group">
          <span className="bbq-status-dot" style={{ background: enabled ? "var(--accent, #6366f1)" : "#666" }} />
          <span className="bbq-clipboard-title">Clipboard History</span>
          {status && enabled && (
            <span className="bbq-clipboard-badge">
              {entries.length} / {status.max_entries}
            </span>
          )}
        </div>

        <div className="bbq-clipboard-actions">
          <button
            type="button"
            className={`bbq-btn ${enabled ? "bbq-btn-active" : ""}`}
            onClick={handleToggleEnabled}
            title={enabled ? "Disable clipboard history" : "Enable clipboard history"}
          >
            {enabled ? "Enabled" : "Disabled"}
          </button>

          {enabled && entries.length > 0 && (
            <button
              type="button"
              className="bbq-btn bbq-btn-danger"
              onClick={handleClearHistory}
              title="Clear all saved history"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {!enabled ? (
        <div className="bbq-clipboard-privacy-notice">
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Privacy Protected</div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary, #94a3b8)", lineHeight: "1.4" }}>
            Clipboard history is strictly local-first and disabled by default.
            Enable it above to save recent text clippings securely on this device.
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="bbq-clipboard-empty">
          <span>No clipboard items yet. Copy some text to see it here.</span>
        </div>
      ) : (
        <div className="bbq-clipboard-list">
          {entries.map((entry) => (
            <div key={entry.id} className="bbq-clipboard-item">
              <div className="bbq-clipboard-item-header">
                <span className="bbq-clipboard-item-type" title={entry.content_type}>
                  {formatTypeIcon(entry.content_type)} {entry.content_type}
                </span>

                {entry.possible_sensitive && (
                  <span className="bbq-clipboard-sensitive-badge" title="May contain credentials or tokens">
                    🔒 Sensitive
                  </span>
                )}

                <div className="bbq-clipboard-item-buttons">
                  {entry.content && (
                    <button
                      type="button"
                      className="bbq-clipboard-small-btn"
                      onClick={(e) => handleCopyAgain(e, entry)}
                      title="Copy again"
                    >
                      Copy
                    </button>
                  )}
                  <button
                    type="button"
                    className="bbq-clipboard-small-btn bbq-btn-delete"
                    onClick={(e) => handleDeleteEntry(e, entry.id)}
                    title="Delete item"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="bbq-clipboard-item-preview" title={entry.preview}>
                {entry.preview}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
