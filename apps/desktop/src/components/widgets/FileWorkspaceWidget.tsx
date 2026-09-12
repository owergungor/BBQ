import React, { useCallback } from "react";
import { useFileState, formatFileSize } from "../../state/fileState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import type { FileEntry } from "@bbq/types";

export const FileWorkspaceWidget: React.FC = () => {
  const { entries, isLoading } = useFileState();

  const handleOpen = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await bbqCommands.fileOpen(id);
  }, []);

  const handleReveal = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await bbqCommands.fileReveal(id);
  }, []);

  const handleRemove = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await bbqCommands.fileRemove(id);
  }, []);

  const handleClear = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.fileClearWorkspace();
  }, []);

  const getFileIcon = (entry: FileEntry): string => {
    const ext = entry.extension?.toLowerCase() ?? "";
    const mime = entry.mime_type?.toLowerCase() ?? "";

    if (ext === "pdf" || mime.includes("pdf")) return "📄";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) || mime.startsWith("image/"))
      return "🖼️";
    if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext) || mime.startsWith("audio/"))
      return "🎵";
    if (["mp4", "mkv", "webm", "mov", "avi"].includes(ext) || mime.startsWith("video/"))
      return "🎬";
    if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "📦";
    if (["rs", "js", "ts", "tsx", "py", "json", "html", "css", "sh"].includes(ext)) return "💻";
    return "📄";
  };

  return (
    <div className="bbq-file-widget" onClick={(e) => e.stopPropagation()}>
      <div className="bbq-file-header">
        <div className="bbq-file-title-group">
          <span className="bbq-status-dot" style={{ background: "var(--accent, #3b82f6)" }} />
          <span className="bbq-file-title">Workspace Files</span>
          <span className="bbq-clipboard-badge">{entries.length} / 100</span>
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            className="bbq-btn bbq-btn-danger"
            onClick={handleClear}
            title="Clear workspace references (does not delete user files)"
          >
            Clear All
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="bbq-file-empty">
          <span>Loading workspace files...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="bbq-file-empty">
          <span style={{ fontSize: "20px", display: "block", marginBottom: "6px" }}>📂</span>
          <span>Drop files onto the Island to create workspace references.</span>
          <span style={{ fontSize: "11px", color: "var(--text-secondary, #94a3b8)", marginTop: "4px" }}>
            Files remain in their original folders — BBQ stores metadata references only.
          </span>
        </div>
      ) : (
        <div className="bbq-file-list">
          {entries.map((entry) => (
            <div key={entry.id} className={`bbq-file-item ${entry.missing ? "bbq-file-missing" : ""}`}>
              <div className="bbq-file-item-left">
                <span className="bbq-file-icon">{getFileIcon(entry)}</span>
                <div className="bbq-file-info">
                  <div className="bbq-file-name" title={entry.path}>
                    {entry.name}
                  </div>
                  <div className="bbq-file-meta">
                    <span>{formatFileSize(entry.size_bytes)}</span>
                    {entry.extension && <span>• {entry.extension.toUpperCase()}</span>}
                    {entry.missing && (
                      <span className="bbq-file-missing-badge" title="File not found at referenced path">
                        ⚠️ Missing
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="bbq-file-actions">
                <button
                  type="button"
                  className="bbq-file-btn"
                  onClick={(e) => handleOpen(e, entry.id)}
                  title="Open file with default application"
                >
                  Open
                </button>
                <button
                  type="button"
                  className="bbq-file-btn"
                  onClick={(e) => handleReveal(e, entry.id)}
                  title="Reveal in folder"
                >
                  Reveal
                </button>
                <button
                  type="button"
                  className="bbq-file-btn bbq-btn-delete"
                  onClick={(e) => handleRemove(e, entry.id)}
                  title="Remove reference from BBQ (does not delete file)"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
