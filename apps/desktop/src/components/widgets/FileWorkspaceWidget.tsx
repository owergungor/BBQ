/**
 * FileWorkspaceWidget.tsx
 * Modernized File Workspace Hub for BBQ v1.3 Milestone 8.
 * Interaction-driven refresh, category filtering, search, and sequential execution.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useFileState } from "../../state/fileState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import { Icon } from "../common/Icon.tsx";
import {
  classifyWorkspaceFile,
  filterWorkspaceFiles,
  sortWorkspaceFiles,
  calculateWorkspaceStats,
  planSequentialExecution,
  type FileCategory,
} from "./fileWorkspaceModel.ts";

export const FileWorkspaceWidget: React.FC = () => {
  const { entries, isLoading } = useFileState();
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isOpeningAll, setIsOpeningAll] = useState(false);

  const handleCycleSort = useCallback(() => {
    setSortBy((prev) => (prev === "date" ? "name" : prev === "name" ? "size" : "date"));
  }, []);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleRefresh = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await bbqCommands.fileGetWorkspace();
      showStatus("Workspace refreshed");
    } catch {
      showStatus("Refresh failed");
    }
  }, []);

  const handleOpen = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ok = await bbqCommands.fileOpen(id);
    if (!ok) {
      showStatus("Failed to open file");
    }
  }, []);

  const handleReveal = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ok = await bbqCommands.fileReveal(id);
    if (!ok) {
      showStatus("Failed to reveal file");
    }
  }, []);

  const handleRemove = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ok = await bbqCommands.fileRemove(id);
    if (ok) {
      showStatus("Reference removed");
    } else {
      showStatus("Failed to remove reference");
    }
  }, []);

  const handleClear = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await bbqCommands.fileClearWorkspace();
    if (ok) {
      showStatus("Workspace cleared");
    } else {
      showStatus("Failed to clear workspace");
    }
  }, []);

  const handleOpenAll = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const plan = planSequentialExecution(filteredEntries);
    if (plan.executable.length === 0) {
      showStatus(plan.skippedMissing > 0 ? "Skipped missing files" : "No files to open");
      return;
    }

    setIsOpeningAll(true);
    showStatus(`Opening ${plan.executable.length} files...`);

    // Execute sequentially with gentle spacing to prevent process table flooding
    for (let i = 0; i < plan.executable.length; i++) {
      const item = plan.executable[i];
      try {
        await bbqCommands.fileOpen(item.id);
      } catch {
        // Continue opening subsequent files
      }
      if (i < plan.executable.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    }

    setIsOpeningAll(false);
    showStatus(`Opened ${plan.executable.length} files`);
  }, [entries, selectedCategory, searchQuery]);

  // Pure filtering and sorting
  const filteredEntries = useMemo(() => {
    const filtered = filterWorkspaceFiles(entries, selectedCategory, searchQuery);
    return sortWorkspaceFiles(filtered, sortBy);
  }, [entries, selectedCategory, searchQuery, sortBy]);

  const stats = useMemo(() => calculateWorkspaceStats(entries), [entries]);

  const categories: { id: FileCategory; label: string }[] = [
    { id: "all", label: "All" },
    { id: "code", label: "Code" },
    { id: "media", label: "Media" },
    { id: "document", label: "Docs" },
    { id: "archive", label: "Archives" },
  ];

  return (
    <div
      className="bbq-file-widget"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "8px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="bbq-file-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div className="bbq-file-title-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="bbq-status-dot" style={{ background: "var(--bbq-accent, #0a84ff)" }} />
          <span className="bbq-file-title" style={{ fontWeight: 600, fontSize: "13px" }}>
            Workspace Files
          </span>
          <span
            className="bbq-clipboard-badge"
            style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: "4px",
              background: "var(--bbq-surface-elevated)",
              border: "1px solid var(--bbq-border)",
            }}
          >
            {stats.totalCount} / 100
          </span>
          {stats.missingCount > 0 && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--bbq-danger, #ff453a)",
                background: "rgba(255, 69, 58, 0.12)",
                padding: "1px 5px",
                borderRadius: "4px",
                border: "1px solid rgba(255, 69, 58, 0.25)",
              }}
            >
              {stats.missingCount} Missing
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {statusMessage && (
            <span
              style={{ fontSize: "11px", color: "var(--bbq-accent)", fontWeight: 500 }}
              role="status"
              aria-live="polite"
            >
              {statusMessage}
            </span>
          )}

          <button
            type="button"
            id="file-workspace-refresh-btn"
            onClick={handleRefresh}
            title="Refresh workspace status"
            aria-label="Refresh workspace status"
            style={{
              background: "var(--bbq-surface-elevated)",
              border: "1px solid var(--bbq-border)",
              borderRadius: "4px",
              padding: "3px 6px",
              cursor: "pointer",
              color: "var(--bbq-text)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Icon name="refresh" size={12} />
          </button>

          {filteredEntries.length > 0 && (
            <button
              type="button"
              id="file-workspace-open-all-btn"
              className="bbq-btn bbq-btn-secondary"
              onClick={handleOpenAll}
              disabled={isOpeningAll}
              title="Open up to 10 files in default applications"
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                borderRadius: "4px",
                cursor: isOpeningAll ? "not-allowed" : "pointer",
                background: "var(--bbq-surface-elevated)",
                border: "1px solid var(--bbq-border)",
                color: "var(--bbq-text)",
              }}
            >
              {isOpeningAll ? "Opening..." : "Open All"}
            </button>
          )}

          {entries.length > 0 && (
            <button
              type="button"
              id="file-workspace-clear-all-btn"
              className="bbq-btn bbq-btn-danger"
              onClick={handleClear}
              title="Clear workspace references (does not delete user files)"
              style={{
                fontSize: "11px",
                padding: "3px 8px",
                borderRadius: "4px",
                cursor: "pointer",
                background: "rgba(255, 69, 58, 0.15)",
                border: "1px solid rgba(255, 69, 58, 0.3)",
                color: "var(--bbq-danger, #ff453a)",
              }}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Filter Row: Category Pills & Search */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <div
          role="tablist"
          aria-label="File categories"
          style={{ display: "flex", gap: "4px", overflowX: "auto" }}
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                id={`file-category-${cat.id}`}
                role="tab"
                type="button"
                aria-selected={isSelected}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: isSelected
                    ? "1px solid var(--bbq-accent)"
                    : "1px solid var(--bbq-border)",
                  background: isSelected
                    ? "var(--bbq-accent-subtle, rgba(10, 132, 255, 0.15))"
                    : "var(--bbq-surface-elevated)",
                  color: isSelected ? "var(--bbq-accent)" : "var(--bbq-text-muted)",
                  fontWeight: isSelected ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 120ms ease",
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <button
            type="button"
            id="file-workspace-sort-btn"
            onClick={handleCycleSort}
            title={`Sorted by ${sortBy} (click to change)`}
            aria-label={`Sorted by ${sortBy}`}
            style={{
              background: "var(--bbq-surface-elevated)",
              border: "1px solid var(--bbq-border)",
              borderRadius: "4px",
              padding: "3px 6px",
              cursor: "pointer",
              color: "var(--bbq-text-muted)",
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            {sortBy}
          </button>

          <div style={{ position: "relative", width: "120px", flexShrink: 0 }}>
            <input
              id="file-workspace-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              aria-label="Search workspace files"
              style={{
                width: "100%",
                padding: "3px 20px 3px 6px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "1px solid var(--bbq-border)",
                background: "var(--bbq-surface-elevated)",
                color: "var(--bbq-text)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute",
                right: "4px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--bbq-text-muted)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Icon name="close" size={10} />
            </button>
          )}
        </div>
      </div>
    </div>

      {/* File List */}
      {isLoading ? (
        <div
          className="bbq-file-empty"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--bbq-text-muted)",
            fontSize: "12px",
          }}
        >
          <span>Loading workspace files...</span>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div
          className="bbq-file-empty"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--bbq-text-muted)",
            fontSize: "12px",
            textAlign: "center",
            padding: "16px",
            gap: "4px",
          }}
        >
          <Icon name="files" size={24} aria-hidden="true" style={{ opacity: 0.5, marginBottom: "4px" }} />
          {entries.length === 0 ? (
            <>
              <span>Drop files onto the Island to stage project references.</span>
              <span style={{ fontSize: "11px", opacity: 0.7 }}>
                Files remain in place — BBQ stores metadata references only.
              </span>
            </>
          ) : (
            <span>No files match the selected filter.</span>
          )}
        </div>
      ) : (
        <div
          className="bbq-file-list"
          role="list"
          aria-label="Staged workspace files"
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            paddingRight: "2px",
          }}
        >
          {filteredEntries.map((entry) => {
            const { iconName } = classifyWorkspaceFile(entry.extension);
            return (
              <div
                key={entry.id}
                role="listitem"
                className={`bbq-file-item ${entry.missing ? "bbq-file-missing" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  background: entry.missing
                    ? "rgba(255, 69, 58, 0.05)"
                    : "var(--bbq-surface-elevated)",
                  border: entry.missing
                    ? "1px solid rgba(255, 69, 58, 0.2)"
                    : "1px solid var(--bbq-border)",
                  gap: "8px",
                }}
              >
                <div
                  className="bbq-file-item-left"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    className="bbq-file-icon"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: entry.missing ? "var(--bbq-danger)" : "var(--bbq-accent)",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={iconName} size={15} aria-hidden="true" />
                  </span>
                  <div
                    className="bbq-file-info"
                    style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}
                  >
                    <div
                      className="bbq-file-name"
                      title={entry.path}
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "var(--bbq-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.name}
                    </div>
                    <div
                      className="bbq-file-meta"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "10px",
                        color: "var(--bbq-text-muted)",
                      }}
                    >
                      <span>{entry.size_bytes ? `${Math.round(entry.size_bytes / 1024)} KB` : "0 B"}</span>
                      {entry.extension && <span>• {entry.extension.toUpperCase()}</span>}
                      {entry.missing && (
                        <span
                          className="bbq-file-missing-badge"
                          style={{
                            color: "var(--bbq-danger, #ff453a)",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: "2px",
                          }}
                        >
                          <Icon name="close" size={9} aria-hidden="true" />
                          Missing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className="bbq-file-actions"
                  style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
                >
                  <button
                    type="button"
                    className="bbq-file-btn"
                    onClick={(e) => handleOpen(e, entry.id)}
                    title="Open file with default application"
                    aria-label={`Open ${entry.name}`}
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "none",
                      border: "1px solid var(--bbq-border)",
                      color: "var(--bbq-text)",
                      cursor: "pointer",
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="bbq-file-btn"
                    onClick={(e) => handleReveal(e, entry.id)}
                    title="Reveal in file explorer"
                    aria-label={`Reveal ${entry.name}`}
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "none",
                      border: "1px solid var(--bbq-border)",
                      color: "var(--bbq-text)",
                      cursor: "pointer",
                    }}
                  >
                    Reveal
                  </button>
                  <button
                    type="button"
                    className="bbq-file-btn bbq-btn-delete"
                    onClick={(e) => handleRemove(e, entry.id)}
                    title="Remove reference from BBQ (does not delete file)"
                    aria-label={`Remove reference for ${entry.name}`}
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "none",
                      border: "1px solid var(--bbq-border)",
                      color: "var(--bbq-text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Icon name="trash" size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
