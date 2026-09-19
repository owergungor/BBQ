import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { LauncherItem, BbqActionType } from "@bbq/types";
import {
  useLauncherState,
  refreshLauncher,
  launchAction,
  toggleFavorite,
} from "../../state/launcherState.ts";
import { Icon } from "../common/Icon.tsx";
import {
  mapActionToIconName,
  filterAndRankLauncherItems,
  getTopQuickActions,
  clampSelectedIndex,
  MAX_LAUNCHER_VISIBLE_ITEMS,
} from "./launcherModel.ts";

interface LauncherWidgetProps {
  onSelectWidget?: (widgetId: string) => void;
  onCollapse?: () => void;
}

const EXCLUDED_LAUNCHER_ITEM_IDS = new Set([
  "bbq_media",
  "bbq_clipboard",
  "bbq_timer",
  "bbq_reminders",
  "bbq_system",
  "bbq_settings",
]);

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

  // Unified deterministic smart search: 2x2 Quick Actions on empty query, and ranked search when query present
  const visibleItems = useMemo<LauncherItem[]>(() => {
    if (!query.trim()) {
      const availableItems = items.filter((i) => !EXCLUDED_LAUNCHER_ITEM_IDS.has(i.id));
      const availableFavorites = favorites.filter((i) => !EXCLUDED_LAUNCHER_ITEM_IDS.has(i.id));
      const availableRecent = recent.filter((i) => !EXCLUDED_LAUNCHER_ITEM_IDS.has(i.id));
      return getTopQuickActions(availableItems, availableFavorites, availableRecent, 4);
    }
    const filtered = items.filter((item) => !EXCLUDED_LAUNCHER_ITEM_IDS.has(item.id));
    return filterAndRankLauncherItems(filtered, query, MAX_LAUNCHER_VISIBLE_ITEMS);
  }, [query, items, favorites, recent]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex((prev) => clampSelectedIndex(prev, visibleItems.length));
  }, [visibleItems.length]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      ".bbq-launcher-item.active, .bbq-launcher-grid-card.active"
    );
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
          case "open_files":
            onSelectWidget("files");
            return;
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
      if (!query.trim() && visibleItems.length === 4) {
        setSelectedIndex((prev) => (prev + 2 < 4 ? prev + 2 : prev % 2));
      } else {
        setSelectedIndex((prev) =>
          clampSelectedIndex(prev < visibleItems.length - 1 ? prev + 1 : 0, visibleItems.length)
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!query.trim() && visibleItems.length === 4) {
        setSelectedIndex((prev) => (prev - 2 >= 0 ? prev - 2 : prev + 2));
      } else {
        setSelectedIndex((prev) =>
          clampSelectedIndex(prev > 0 ? prev - 1 : Math.max(0, visibleItems.length - 1), visibleItems.length)
        );
      }
    } else if (e.key === "ArrowRight" && !query.trim() && visibleItems.length === 4) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev % 2 === 0 ? prev + 1 : prev));
    } else if (e.key === "ArrowLeft" && !query.trim() && visibleItems.length === 4) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev % 2 === 1 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = visibleItems[selectedIndex];
      if (selected) {
        handleExecute(selected);
      }
    } else if (e.key === "Escape") {
      if (query.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
        setSelectedIndex(0);
      } else if (onCollapse) {
        onCollapse();
      }
    }
  };

  const renderItemRow = (item: LauncherItem, idx: number) => {
    const isSelected = idx === selectedIndex;
    const itemDomId = `launcher-item-${item.id}`;
    const iconName = mapActionToIconName(item.action);

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
          <Icon name={iconName} size={16} />
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
            <Icon name="pin" size={13} />
          </button>
        </div>
      </div>
    );
  };

  const renderGridCard = (item: LauncherItem, idx: number) => {
    const isSelected = idx === selectedIndex;
    const itemDomId = `launcher-item-${item.id}`;
    const iconName = mapActionToIconName(item.action);

    return (
      <div
        key={item.id}
        id={itemDomId}
        role="option"
        aria-selected={isSelected}
        className={`bbq-launcher-grid-card ${isSelected ? "active" : ""}`}
        onClick={() => handleExecute(item)}
        onMouseEnter={() => setSelectedIndex(idx)}
      >
        <div className="bbq-launcher-grid-card-header">
          <span className="bbq-launcher-grid-card-icon" aria-hidden="true">
            <Icon name={iconName} size={18} />
          </span>
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
            <Icon name="pin" size={13} />
          </button>
        </div>
        <div className="bbq-launcher-grid-card-body">
          <div className="bbq-launcher-grid-card-title">{item.title}</div>
          {item.subtitle && (
            <div className="bbq-launcher-grid-card-subtitle">{item.subtitle}</div>
          )}
        </div>
      </div>
    );
  };

  const activeDescendant = visibleItems[selectedIndex]
    ? `launcher-item-${visibleItems[selectedIndex].id}`
    : undefined;

  return (
    <div id="bbq-launcher-widget" className="bbq-launcher-widget" onClick={(e) => e.stopPropagation()}>
      {/* Search Input Bar */}
      <div
        className="bbq-launcher-search-container"
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-controls="bbq-launcher-items-list"
      >
        <span className="bbq-launcher-search-icon" aria-hidden="true">
          <Icon name="search" size={14} />
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
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      {/* Error banner if any */}
      {error && (
        <div className="bbq-launcher-error-banner" role="alert">
          <Icon name="close" size={12} />
          <span>{error}</span>
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
        ) : !query.trim() ? (
          // Default view: 2x2 Quick Actions grid fitting cleanly into expanded island
          <div className="bbq-launcher-quick-actions-container">
            <div className="bbq-launcher-section-header">Quick Actions</div>
            <div className="bbq-launcher-grid-2x2">
              {visibleItems.map((item, idx) => renderGridCard(item, idx))}
            </div>
          </div>
        ) : (
          // Flat list for search results
          <div className="bbq-launcher-section">
            <div className="bbq-launcher-section-header">Search Results</div>
            {visibleItems.map((item, idx) => renderItemRow(item, idx))}
          </div>
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
