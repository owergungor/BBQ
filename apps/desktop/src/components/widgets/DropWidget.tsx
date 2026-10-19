import React, { useEffect, useCallback, useMemo } from "react";
import type { DropAction } from "@bbq/types";
import {
  useDropState,
  executeDropAction,
  clearDrop,
  setSelectedActionIndex,
} from "../../state/dropState.ts";
import { escapeManager, EscapePriority } from "../../island/escapeManager.ts";
import { Icon } from "../common/Icon.tsx";
import { useTranslation } from "../../i18n/index.ts";
import {
  normalizeStagedFile,
  boundAndDeduplicateStagedItems,
  MAX_DROP_SHELF_ITEMS,
} from "./productivityModel.ts";

export const DropWidget: React.FC = () => {
  const { t } = useTranslation();
  const {
    currentBatch,
    actions,
    selectedActionIndex,
    status,
    error,
    resultMessage,
    isDraggingOver,
  } = useDropState();

  // Register high-priority Escape handler while Drop Shelf has active items or actions.
  // First Escape clears the drop shelf and prevents parent Island collapse.
  useEffect(() => {
    if (!currentBatch && actions.length === 0) return;

    const unregister = escapeManager.register(() => {
      clearDrop();
      return true; // Consumed: prevent parent island collapse
    }, EscapePriority.CHILD_INTERACTION);

    return unregister;
  }, [currentBatch, actions.length]);

  // Keyboard navigation for action items (Arrow keys and Enter)
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
      }
    },
    [actions, selectedActionIndex, status]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const getActionDetails = (
    action: DropAction,
    isBatch: boolean
  ): { label: string; iconName: "external-link" | "files" | "copy" | "check"; description: string } => {
    switch (action) {
      case "open":
        return {
          label: isBatch ? t("widgets.drop.openAll") || "Open All" : t("widgets.drop.open") || "Open",
          iconName: "external-link",
          description: t("widgets.drop.openDesc") || "Launch with default application",
        };
      case "reveal":
        return {
          label: isBatch ? t("widgets.drop.revealAll") || "Reveal All" : t("widgets.drop.reveal") || "Reveal in Folder",
          iconName: "files",
          description: t("widgets.drop.revealDesc") || "Show in system file manager",
        };
      case "copy_path":
        return {
          label: isBatch ? t("widgets.drop.copyAll") || "Copy All Paths" : t("widgets.drop.copyPath") || "Copy Path",
          iconName: "copy",
          description: t("widgets.drop.copyPathDesc") || "Copy file path to clipboard (explicit only)",
        };
      case "add_to_workspace":
        return {
          label: isBatch ? t("widgets.drop.addAll") || "Add All to Workspace" : t("widgets.drop.addToWorkspace") || "Add to Workspace",
          iconName: "check",
          description: t("widgets.drop.addToWorkspaceDesc") || "Store reference in Workspace Files",
        };
      case "drag_out":
        return {
          label: isBatch ? t("widgets.drop.dragOutAll") || "Drag Out All" : t("widgets.drop.dragOut") || "Drag Out",
          iconName: "external-link",
          description: t("widgets.drop.dragOutDesc") || "Initiate native drag-out to desktop or Explorer",
        };
      default:
        return {
          label: action,
          iconName: "external-link",
          description: "Execute action",
        };
    }
  };

  const isBatch = Boolean(currentBatch && currentBatch.count > 1);

  // Bounded & deduplicated staged items
  const { items: stagedItems, wasLimited } = useMemo(() => {
    return boundAndDeduplicateStagedItems(currentBatch?.items, MAX_DROP_SHELF_ITEMS);
  }, [currentBatch]);

  return (
    <div
      className={"bbq-drop-widget" + (isDraggingOver ? " dragging-over" : "")}
      onClick={(e) => e.stopPropagation()}
      role="region"
      aria-label="Drop Shelf Staging Area"
    >
      {/* Header with status dot, title, count badge, and clear button */}
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
                  : "var(--bbq-accent, #0A84FF)",
            }}
          />
          <span className="bbq-drop-title">{t("widgets.drop.title") || "Drop Shelf"}</span>
          {currentBatch && (
            <span className="bbq-drop-badge">
              {stagedItems.length} / {MAX_DROP_SHELF_ITEMS}
            </span>
          )}
        </div>

        {currentBatch && (
          <button
            type="button"
            className="bbq-btn bbq-btn-secondary"
            onClick={clearDrop}
            title={t("widgets.drop.clearShelfTooltip") || "Clear staged files (Escape)"}
            aria-label={t("widgets.drop.clearShelf") || "Clear staged files from shelf"}
          >
            <Icon name="trash" size={11} aria-hidden="true" />
            <span>{t("widgets.drop.clearShelf") || "Clear Shelf"}</span>
          </button>
        )}
      </div>

      {status === "inspecting" && (
        <div className="bbq-drop-loading" aria-live="polite">
          <span className="bbq-drop-spinner" />
          <span>{t("widgets.drop.inspecting") || "Inspecting file metadata..."}</span>
        </div>
      )}

      {error && (
        <div className="bbq-drop-alert bbq-drop-error" role="alert">
          <Icon name="close" size={12} aria-hidden="true" />
          <span className="bbq-alert-text">{error}</span>
        </div>
      )}

      {resultMessage && !error && (
        <div className="bbq-drop-alert bbq-drop-success" role="status">
          <Icon name="check" size={12} aria-hidden="true" />
          <span className="bbq-alert-text">{resultMessage}</span>
        </div>
      )}

      {/* Empty Drop Zone State */}
      {!currentBatch && status !== "inspecting" && (
        <div className="bbq-drop-empty-target">
          <div className="bbq-drop-empty-icon-wrap">
            <Icon name="drop" size={32} aria-hidden="true" />
          </div>
          <div className="bbq-drop-prompt">
            {isDraggingOver
              ? t("widgets.drop.releasePrompt") || "Release to stage files on Shelf"
              : t("widgets.drop.prompt") || "Drag files or folders here to stage"}
          </div>
          <div className="bbq-drop-hint">
            {t("widgets.drop.hint") ||
              "Zero binary memory footprint. BBQ inspects and stages metadata references only."}
          </div>
        </div>
      )}

      {/* Active Staged Files Shelf */}
      {currentBatch && (
        <div className="bbq-drop-content">
          {wasLimited && (
            <div className="bbq-drop-limit-notice" role="status">
              <span>
                {t("widgets.drop.cappedNotice", { max: MAX_DROP_SHELF_ITEMS }) ||
                  `Staged items capped at ${MAX_DROP_SHELF_ITEMS} maximum for memory safety.`}
              </span>
            </div>
          )}

          {/* Staged File Cards Grid / List */}
          <div className="bbq-drop-shelf-list" role="list" aria-label="Staged files list">
            {stagedItems.map((target) => {
              const file = normalizeStagedFile(target);
              return (
                <div
                  key={file.id}
                  className="bbq-staged-file-card"
                  role="listitem"
                  draggable
                  onDragStart={(e) => {
                    e.preventDefault();
                    executeDropAction("drag_out", file.id);
                  }}
                  title={`${file.path} (Drag to export)`}
                >
                  <div className="bbq-staged-file-left">
                    <span className="bbq-staged-file-icon">
                      <Icon name={file.iconName} size={15} aria-hidden="true" />
                    </span>
                    <div className="bbq-staged-file-details">
                      <div className="bbq-staged-file-name" title={file.path}>
                        {file.name}
                      </div>
                      <div className="bbq-staged-file-meta">
                        <span className="bbq-staged-tag">{file.category}</span>
                        <span>{file.formattedSize}</span>
                        {file.extension && <span>• {file.extension}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contextual Smart Actions */}
          <div className="bbq-drop-actions-section">
            <div className="bbq-drop-actions-header">
              {t("widgets.drop.quickActions") || "Quick Actions"}
            </div>
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
                    className={"bbq-drop-action-btn" + (isSelected ? " selected" : "")}
                    onClick={() => executeDropAction(act)}
                    disabled={status === "executing"}
                  >
                    <span className="bbq-drop-action-icon">
                      <Icon name={details.iconName} size={14} aria-hidden="true" />
                    </span>
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
