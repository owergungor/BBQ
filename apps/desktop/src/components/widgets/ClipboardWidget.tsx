import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { clipboardStore, useClipboardState } from "../../state/clipboardState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import type { ClipboardEntry } from "@bbq/types";
import { Icon } from "../common/Icon.tsx";
import {
  normalizeClipboardEntry,
  boundClipboardEntries,
  MAX_CLIPBOARD_HISTORY_ENTRIES,
} from "./productivityModel.ts";

export const ClipboardWidget: React.FC = () => {
  const { enabled, entries, status } = useClipboardState();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

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
        const ok = await bbqCommands.clipboardWriteText(entry.content);
        if (!ok && typeof navigator !== "undefined" && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(entry.content);
          } catch {
            // Fallback if browser permission is restricted
          }
        }
        if (copyFeedbackTimerRef.current) {
          clearTimeout(copyFeedbackTimerRef.current);
        }
        setCopyFeedback("Copied clipping to clipboard");
        copyFeedbackTimerRef.current = setTimeout(() => {
          setCopyFeedback(null);
          copyFeedbackTimerRef.current = null;
        }, 2000);
      }
    },
    []
  );

  const toggleRevealSensitive = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const normalizedCards = useMemo(() => {
    const bounded = boundClipboardEntries(entries, MAX_CLIPBOARD_HISTORY_ENTRIES);
    const now = Date.now();
    return bounded.map((entry) => ({
      raw: entry,
      normalized: normalizeClipboardEntry(entry, now),
    }));
  }, [entries]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedCards;
    return normalizedCards.filter(({ raw, normalized }) => {
      const content = (raw.content || "").toLowerCase();
      const preview = normalized.preview.toLowerCase();
      return content.includes(q) || preview.includes(q);
    });
  }, [normalizedCards, searchQuery]);

  // Safely reset/clamp selectedIndex when filtered results change
  useEffect(() => {
    if (filteredCards.length === 0) {
      if (selectedIndex !== -1) {
        setSelectedIndex(-1);
      }
    } else if (selectedIndex >= filteredCards.length) {
      setSelectedIndex(filteredCards.length - 1);
    }
  }, [filteredCards.length, selectedIndex]);

  return (
    <div className="bbq-clipboard-widget" onClick={(e) => e.stopPropagation()}>
      <div className="bbq-clipboard-header">
        <div className="bbq-clipboard-title-group">
          <span className={"bbq-status-dot " + (enabled ? "enabled" : "disabled")} />
          <span className="bbq-clipboard-title">Clipboard History</span>
          {enabled && (
            <span className="bbq-clipboard-badge">
              {entries.length} / {status?.max_entries ?? MAX_CLIPBOARD_HISTORY_ENTRIES}
            </span>
          )}
          {copyFeedback && (
            <span className="bbq-clipboard-feedback" role="status" aria-live="polite">
              {copyFeedback}
            </span>
          )}
        </div>

        <div className="bbq-clipboard-actions">
          <button
            type="button"
            className={"bbq-btn" + (enabled ? " bbq-btn-active" : "")}
            onClick={handleToggleEnabled}
            title={enabled ? "Disable clipboard history" : "Enable clipboard history"}
            aria-label={enabled ? "Disable clipboard history" : "Enable clipboard history"}
          >
            <Icon name={enabled ? "check" : "close"} size={11} aria-hidden="true" />
            <span>{enabled ? "Enabled" : "Disabled"}</span>
          </button>

          {enabled && entries.length > 0 && (
            <button
              type="button"
              className="bbq-btn bbq-btn-danger"
              onClick={handleClearHistory}
              title="Clear all saved history"
              aria-label="Clear all clipboard history"
            >
              <Icon name="trash" size={11} aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-time search filter */}
      {enabled && entries.length > 0 && (
        <div className="bbq-clipboard-search-bar">
          <div className="bbq-clipboard-search-box">
            <Icon name="search" size={12} aria-hidden="true" className="bbq-clipboard-search-icon" />
            <input
              ref={searchInputRef}
              id="clipboard-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  if (filteredCards.length > 0) {
                    e.preventDefault();
                    setSelectedIndex(0);
                    cardRefs.current[0]?.focus();
                  }
                } else if (e.key === "Escape") {
                  if (searchQuery) {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchQuery("");
                  }
                }
              }}
              placeholder="Search clippings..."
              className="bbq-clipboard-search-input"
              aria-label="Filter clipboard clippings"
            />
            {searchQuery && (
              <button
                type="button"
                id="clipboard-search-clear-btn"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="bbq-clipboard-search-clear"
                aria-label="Clear search"
              >
                <Icon name="close" size={10} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {!enabled ? (
        <div className="bbq-clipboard-privacy-notice">
          <div className="bbq-clipboard-privacy-header">
            <Icon name="lock" size={16} aria-hidden="true" />
            <span>Privacy Protected</span>
          </div>
          <div className="bbq-clipboard-privacy-body">
            Clipboard history is strictly local-first and disabled by default.
            Enable it above to save recent text clippings securely on this device without telemetry or logs.
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="bbq-clipboard-empty">
          <Icon name="clipboard" size={24} aria-hidden="true" className="bbq-clipboard-search-icon" />
          <span>No clipboard items yet. Copy text to stage clippings here.</span>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="bbq-clipboard-empty" id="clipboard-search-empty">
          <Icon name="search" size={24} aria-hidden="true" className="bbq-clipboard-search-icon" />
          <span>No clippings matching "{searchQuery}"</span>
        </div>
      ) : (
        <div className="bbq-clipboard-card-grid" role="grid" aria-label="Clipboard history cards">
          {filteredCards.map(({ raw, normalized }, index) => {
            const isRevealed = revealedIds.has(raw.id);
            const isSelected = selectedIndex === index;
            const previewText =
              normalized.isSensitive && isRevealed && raw.content
                ? raw.content.slice(0, 100)
                : normalized.preview;

            return (
              <div
                key={normalized.id}
                ref={(el) => {
                  cardRefs.current[index] = el;
                }}
                className={
                  "bbq-clipboard-card" +
                  (isSelected ? " selected" : "") +
                  (normalized.isSensitive ? " is-sensitive" : "")
                }
                tabIndex={0}
                role="row"
                aria-selected={isSelected}
                onMouseEnter={() => setSelectedIndex(index)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const nextIndex = Math.min(index + 1, filteredCards.length - 1);
                    setSelectedIndex(nextIndex);
                    cardRefs.current[nextIndex]?.focus();
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (index === 0) {
                      setSelectedIndex(-1);
                      searchInputRef.current?.focus();
                    } else {
                      const prevIndex = index - 1;
                      setSelectedIndex(prevIndex);
                      cardRefs.current[prevIndex]?.focus();
                    }
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCopyAgain(e as unknown as React.MouseEvent, raw);
                  } else if (e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                    handleDeleteEntry(e as unknown as React.MouseEvent, raw.id);
                  }
                }}
              >
                <div className="bbq-clipboard-card-header">
                  <div className="bbq-clipboard-card-tag">
                    <Icon name={normalized.iconName} size={12} aria-hidden="true" />
                    <span className="bbq-clipboard-card-type">{normalized.contentType}</span>
                    {normalized.isSensitive && (
                      <button
                        type="button"
                        className="bbq-clipboard-sensitive-pill"
                        data-state={isRevealed ? "revealed" : "protected"}
                        onClick={(e) => toggleRevealSensitive(raw.id, e)}
                        title={isRevealed ? "Hide sensitive credentials" : "Click to reveal masked credentials"}
                        aria-label={isRevealed ? "Hide sensitive credentials" : "Click to reveal masked credentials"}
                      >
                        <Icon name={isRevealed ? "eye-off" : "eye"} size={10} aria-hidden="true" />
                        <span>{isRevealed ? "Hide" : "Protected"}</span>
                      </button>
                    )}
                  </div>

                  <div className="bbq-clipboard-card-actions">
                    <span className="bbq-clipboard-time-ago">{normalized.timeAgo}</span>
                    {raw.content && (
                      <button
                        type="button"
                        className="bbq-clipboard-action-btn"
                        onClick={(e) => handleCopyAgain(e, raw)}
                        title="Copy again"
                        aria-label={"Copy clipping: " + normalized.preview}
                      >
                        <Icon name="copy" size={11} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="bbq-clipboard-action-btn delete"
                      onClick={(e) => handleDeleteEntry(e, raw.id)}
                      title="Delete item"
                      aria-label="Delete clipboard clipping"
                    >
                      <Icon name="close" size={11} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="bbq-clipboard-card-preview" title={raw.content || normalized.preview}>
                  {previewText}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
