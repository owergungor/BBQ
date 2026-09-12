import React, { useEffect, useCallback } from "react";
import type { DropAction, DropTarget } from "@bbq/types";
import {
  useDropState,
  executeDropAction,
  clearDrop,
  setSelectedActionIndex,
  formatDropSize,
} from "../../state/dropState.ts";

export const DropWidget: React.FC = () => {
  const {
    currentBatch,
    actions,
    selectedActionIndex,
    status,
    error,
    resultMessage,
    isDraggingOver,
  } = useDropState();

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      if (actions.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedActionIndex((selectedActionIndex + 1) % actions.length);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedActionIndex(
          (selectedActionIndex - 1 + actions.length) % actions.length
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const action = actions[selectedActionIndex];
        if (action && status !== "executing") {
          executeDropAction(action);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearDrop();
      }
    },
    [actions, selectedActionIndex, status]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const getItemIcon = (item: DropTarget): string => {
    if (item.kind === "directory") return "📁";
    switch (item.classification) {
      case "image":
        return "🖼️";
      case "document":
        return "📄";
      case "archive":
        return "📦";
      case "code":
        return "💻";
      case "audio":
        return "🎵";
      case "video":
        return "🎬";
      default:
        return "📎";
    }
  };

  const getActionDetails = (
    action: DropAction,
    isBatch: boolean
  ): { label: string; icon: string; description: string } => {
    switch (action) {
      case "open":
        return {
          label: isBatch ? "Open All" : "Open",
          icon: "↗️",
          description: "Launch with default application",
        };
      case "reveal":
        return {
          label: isBatch ? "Reveal All" : "Reveal in Folder",
          icon: "📂",
          description: "Show in system file manager",
        };
      case "copy_path":
        return {
          label: isBatch ? "Copy All Paths" : "Copy Path",
          icon: "📋",
          description: "Copy file path to clipboard (explicit only)",
        };
      case "add_to_workspace":
        return {
          label: isBatch ? "Add All to Workspace" : "Add to Workspace",
          icon: "➕",
          description: "Store reference in Workspace Files",
        };
      default:
        return {
          label: action,
          icon: "⚡",
          description: "Execute action",
        };
    }
  };

  const isBatch = Boolean(currentBatch && currentBatch.count > 1);

  return (
    <div
      className={`bbq-drop-widget ${isDraggingOver ? "dragging-over" : ""}`}
      onClick={(e) => e.stopPropagation()}
      role="region"
      aria-label="Drop Zone and Smart File Actions"
    >
      <div className="bbq-drop-header">
        <div className="bbq-drop-title-group">
          <span
            className="bbq-status-dot"
            style={{
              background:
                status === "executing"
                  ? "#f59e0b"
                  : status === "error"
                  ? "#ef4444"
                  : status === "ready"
                  ? "#10b981"
                  : "var(--accent, #3b82f6)",
            }}
          />
          <span className="bbq-drop-title">Drop Zone</span>
          {currentBatch && (
            <span className="bbq-drop-badge">
              {currentBatch.count} {currentBatch.count === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        {currentBatch && (
          <button
            type="button"
            className="bbq-btn bbq-btn-secondary"
            onClick={clearDrop}
            title="Clear current dropped items (Escape)"
          >
            Clear
          </button>
        )}
      </div>

      {status === "inspecting" && (
        <div className="bbq-drop-loading" aria-live="polite">
          <span className="bbq-drop-spinner" />
          <span>Inspecting file metadata...</span>
        </div>
      )}

      {error && (
        <div className="bbq-drop-alert bbq-drop-error" role="alert">
          <span className="bbq-alert-icon">⚠️</span>
          <span className="bbq-alert-text">{error}</span>
        </div>
      )}

      {resultMessage && !error && (
        <div className="bbq-drop-alert bbq-drop-success" role="status">
          <span className="bbq-alert-icon">✓</span>
          <span className="bbq-alert-text">{resultMessage}</span>
        </div>
      )}

      {!currentBatch && status !== "inspecting" && (
        <div className="bbq-drop-empty-target">
          <div className="bbq-drop-icon">📥</div>
          <div className="bbq-drop-prompt">
            {isDraggingOver ? "Release to inspect items" : "Drag files or folders here"}
          </div>
          <div className="bbq-drop-hint">
            Metadata inspection only. No files are moved, copied, or deleted.
          </div>
        </div>
      )}

      {currentBatch && (
        <div className="bbq-drop-content">
          {/* Target preview: single or batch */}
          {!isBatch && currentBatch.items[0] ? (
            <div className="bbq-drop-single-item">
              <div className="bbq-drop-item-icon">
                {getItemIcon(currentBatch.items[0])}
              </div>
              <div className="bbq-drop-item-details">
                <div className="bbq-drop-item-name" title={currentBatch.items[0].path}>
                  {currentBatch.items[0].name}
                </div>
                <div className="bbq-drop-item-meta">
                  <span className="bbq-drop-tag">
                    {currentBatch.items[0].kind === "directory" ? "Folder" : "File"}
                  </span>
                  <span>{formatDropSize(currentBatch.items[0].size)}</span>
                  {currentBatch.items[0].extension && (
                    <span>• {currentBatch.items[0].extension.toUpperCase()}</span>
                  )}
                  {currentBatch.items[0].classification !== "unknown" && (
                    <span className="bbq-drop-class-tag">
                      {currentBatch.items[0].classification}
                    </span>
                  )}
                </div>
                <div className="bbq-drop-item-path" title={currentBatch.items[0].path}>
                  {currentBatch.items[0].path}
                </div>
              </div>
            </div>
          ) : (
            <div className="bbq-drop-batch-container">
              <div className="bbq-drop-batch-header">
                <span>Batch of {currentBatch.count} items (max 50)</span>
              </div>
              <div className="bbq-drop-batch-list" role="list">
                {currentBatch.items.map((item) => (
                  <div key={item.id} className="bbq-drop-batch-row" role="listitem">
                    <span className="bbq-batch-row-icon">{getItemIcon(item)}</span>
                    <span className="bbq-batch-row-name" title={item.path}>
                      {item.name}
                    </span>
                    <span className="bbq-batch-row-size">
                      {formatDropSize(item.size)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contextual Smart Actions */}
          <div className="bbq-drop-actions-section">
            <div className="bbq-drop-actions-header">Smart Actions</div>
            <div className="bbq-drop-actions-list" role="listbox" aria-label="Available Actions">
              {actions.map((act, index) => {
                const details = getActionDetails(act, isBatch);
                const isSelected = index === selectedActionIndex;
                return (
                  <button
                    key={act}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`bbq-drop-action-btn ${isSelected ? "selected" : ""}`}
                    onClick={() => executeDropAction(act)}
                    disabled={status === "executing"}
                  >
                    <span className="bbq-drop-action-icon">{details.icon}</span>
                    <div className="bbq-drop-action-text">
                      <span className="bbq-drop-action-label">{details.label}</span>
                      <span className="bbq-drop-action-desc">{details.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
