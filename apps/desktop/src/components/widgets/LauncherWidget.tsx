import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { LauncherItem, BbqActionType } from "@bbq/types";
import {
  useLauncherState,
  refreshLauncher,
  launchAction,
  toggleFavorite,
  clearRecent,
} from "../../state/launcherState.ts";
import { searchLauncherItems } from "../../utils/launcherSearch.ts";

interface LauncherWidgetProps {
  onSelectWidget?: (widgetId: string) => void;
  onCollapse?: () => void;
}

export const LauncherWidget: React.FC<LauncherWidgetProps> = ({
  onSelectWidget,
  onCollapse,
}) => {
  const {
    items,
    favorites,
    recent,
    capabilities,
    isLoading,
    error,
  } = useLauncherState();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    refreshLauncher().catch(console.error);
  }, []);

  // Auto focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
  const recentIds = useMemo(() => new Set(recent.map((r) => r.id)), [recent]);

  // Unified deterministic smart search and empty-query ranking
  const visibleItems = useMemo<LauncherItem[]>(() => {
    return searchLauncherItems(query, items, favoriteIds, recentIds);
  }, [query, items, favoriteIds, recentIds]);

  // Keep selected index within bounds
  useEffect(() => {
    if (visibleItems.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= visibleItems.length) {
      setSelectedIndex(visibleItems.length - 1);
    }
  }, [visibleItems.length, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(".bbq-launcher-item.active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle action execution
  const handleExecute = useCallback(
    async (item: LauncherItem) => {
      // Execute typed action via service
      await launchAction(item);

      // Handle BBQ built-in navigation
      if (item.action.type === "bbq_action" && onSelectWidget) {
        const bbqAction = item.action.payload.action as BbqActionType;
        switch (bbqAction) {
          case "open_clipboard":
            onSelectWidget("clipboard");
            return;
          case "open_timer":
            onSelectWidget("timer");
            return;
          case "open_reminders":
            onSelectWidget("reminder");
            return;
          case "open_system":
            onSelectWidget("system");
            return;
          case "open_media":
            onSelectWidget("media");
            return;
          case "open_settings":
            onSelectWidget("settings");
            return;
        }
      }

      // Explicit execution finishes command surface -> transition Island to Idle
      if (onCollapse) {
        onCollapse();
      }
    },
    [onSelectWidget, onCollapse]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < visibleItems.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : Math.max(0, visibleItems.length - 1)
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelectedIndex(Math.max(0, visibleItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visibleItems[selectedIndex]) {
        handleExecute(visibleItems[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
      } else if (onCollapse) {
        onCollapse();
      }
    }
  };


  const getActionIcon = (item: LauncherItem): string => {
    if (item.icon) return item.icon;
    switch (item.action.type) {
      case "open_application":
        return "🚀";
      case "open_file":
        return "📄";
      case "open_folder":
        return "📁";
      case "open_url":
        return "🌐";
      case "system_action":
        return "⚙️";
      case "bbq_action":
        return "🧭";
    }
  };

  const renderItemRow = (item: LauncherItem, idx: number) => {
    const isSelected = idx === selectedIndex;
    const itemDomId = `launcher-item-${item.id}`;

    return (
      <div
        key={item.id}
        id={itemDomId}
        role="option"
        aria-selected={isSelected}
        className={`bbq-launcher-item ${isSelected ? "active" : ""}`}
        onClick={() => handleExecute(item)}
        onMouseEnter={() => setSelectedIndex(idx)}
      >
        <div className="bbq-launcher-item-icon" aria-hidden="true">
          {getActionIcon(item)}
        </div>
        <div className="bbq-launcher-item-content">
          <div className="bbq-launcher-item-title">{item.title}</div>
          {item.subtitle && (
            <div className="bbq-launcher-item-subtitle">{item.subtitle}</div>
          )}
        </div>
        <div className="bbq-launcher-item-actions">
          {item.usage_count > 0 && (
            <span className="bbq-launcher-usage-count" title="Times launched">
              {item.usage_count}
            </span>
          )}
          <button
            type="button"
            className={`bbq-launcher-fav-btn ${item.favorite ? "favorited" : ""}`}
            aria-label={item.favorite ? "Remove from favorites" : "Add to favorites"}
            title={item.favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(item).catch(console.error);
            }}
          >
            {item.favorite ? "★" : "☆"}
          </button>
        </div>
      </div>
    );
  };

  const activeDescendant = visibleItems[selectedIndex]
    ? `launcher-item-${visibleItems[selectedIndex].id}`
    : undefined;

  return (
    <div id="bbq-launcher-widget" className="bbq-launcher-widget">
      {/* Search Input Bar */}
      <div className="bbq-launcher-search-container" role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-controls="bbq-launcher-items-list">
        <span className="bbq-launcher-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="text"
          className="bbq-launcher-input"
          placeholder="Search quick actions, apps, files, links..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-controls="bbq-launcher-items-list"
          aria-activedescendant={activeDescendant}
          aria-label="Launcher search"
        />
        {query && (
          <button
            type="button"
            className="bbq-launcher-clear-btn"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Error banner if any */}
      {error && (
        <div className="bbq-launcher-error-banner" role="alert">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Items List */}
      <div
        id="bbq-launcher-items-list"
        ref={listRef}
        role="listbox"
        aria-label="Launcher items"
        className="bbq-launcher-list"
      >
        {isLoading && visibleItems.length === 0 ? (
          <div className="bbq-launcher-empty">Loading launcher...</div>
        ) : visibleItems.length === 0 ? (
          <div className="bbq-launcher-empty">
            <div>No matching actions found</div>
            <div className="bbq-launcher-empty-suggestions">
              <span className="bbq-launcher-suggestion-label">Try:</span>
              <button
                type="button"
                className="bbq-launcher-suggestion-pill"
                onClick={() => {
                  setQuery("Timer");
                  inputRef.current?.focus();
                }}
              >
                Timer
              </button>
              <button
                type="button"
                className="bbq-launcher-suggestion-pill"
                onClick={() => {
                  setQuery("Clipboard");
                  inputRef.current?.focus();
                }}
              >
                Clipboard
              </button>
              <button
                type="button"
                className="bbq-launcher-suggestion-pill"
                onClick={() => {
                  setQuery("Reminders");
                  inputRef.current?.focus();
                }}
              >
                Reminders
              </button>
            </div>
          </div>
        ) : query.trim() ? (
          // Flat list for search results
          <div className="bbq-launcher-section">
            <div className="bbq-launcher-section-header">Search Results</div>
            {visibleItems.map((item, idx) => renderItemRow(item, idx))}
          </div>
        ) : (
          // Categorized views when not searching
          <>
            {favorites.length > 0 && (
              <div className="bbq-launcher-section">
                <div className="bbq-launcher-section-header">Favorites</div>
                {favorites.map((item) => {
                  const idx = visibleItems.findIndex((v) => v.id === item.id);
                  return renderItemRow(item, idx >= 0 ? idx : 0);
                })}
              </div>
            )}

            {recent.length > 0 && (
              <div className="bbq-launcher-section">
                <div className="bbq-launcher-section-header" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Recent</span>
                  <button
                    type="button"
                    className="bbq-launcher-clear-recent-btn"
                    onClick={() => clearRecent().catch(console.error)}
                    title="Clear recent history"
                  >
                    Clear
                  </button>
                </div>
                {recent.map((item) => {
                  const idx = visibleItems.findIndex((v) => v.id === item.id);
                  return renderItemRow(item, idx >= 0 ? idx : 0);
                })}
              </div>
            )}

            <div className="bbq-launcher-section">
              <div className="bbq-launcher-section-header">Quick Actions</div>
              {items
                .filter((item) => item.source === "built_in")
                .map((item) => {
                  const idx = visibleItems.findIndex((v) => v.id === item.id);
                  return renderItemRow(item, idx >= 0 ? idx : 0);
                })}
            </div>
          </>
        )}
      </div>

      {/* Screen reader live announcement */}
      <div className="bbq-sr-only" role="status" aria-live="polite">
        {visibleItems.length} {visibleItems.length === 1 ? "result" : "results"} available
      </div>

      {/* Footer with keyboard hints & capabilities */}
      <div className="bbq-launcher-footer">
        <div className="bbq-launcher-hints">
          <span className="bbq-kbd">↑↓</span> navigate
          <span className="bbq-kbd">home/end</span> jump
          <span className="bbq-kbd">↵</span> open
          <span className="bbq-kbd">esc</span> close
        </div>
        {capabilities && (
          <div className="bbq-launcher-caps" title="Platform capabilities">
            {capabilities.open_application && <span title="App launch supported">App</span>}
            {capabilities.open_file && <span title="File open supported">File</span>}
            {capabilities.open_url && <span title="URL open supported">URL</span>}
          </div>
        )}
      </div>
    </div>
  );
};
