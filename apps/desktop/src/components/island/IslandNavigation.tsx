import React from "react";
import type { WidgetDefinition } from "../../island/widgetRegistry.ts";
import {
  SegmentedTabBar,
  getNextSelectableIndex,
  getFirstSelectableIndex,
  getLastSelectableIndex,
} from "./SegmentedTabBar.tsx";
import { Icon } from "../common/Icon.tsx";

export interface IslandNavigationProps {
  activeWidgetId: string | null;
  widgets: WidgetDefinition[];
  fileCount?: number;
  clipboardCount?: number;
  dropCount?: number;
  onSelectWidget: (widgetId: string) => void;
  onCollapse: () => void;
}

/**
 * Handles accessible keyboard navigation across navigation tabs.
 * Supports ArrowRight, ArrowLeft, Home, and End keys with safe selectable checks.
 */
export function handleTabKeyDown(
  e: React.KeyboardEvent,
  index: number,
  widgets: WidgetDefinition[],
  onSelectWidget: (id: string) => void
): void {
  if (widgets.length === 0) return;

  if (e.key === "ArrowRight") {
    e.preventDefault();
    const nextIndex = getNextSelectableIndex(index, widgets, 1);
    const nextWidget = widgets[nextIndex];
    if (nextWidget) {
      onSelectWidget(nextWidget.id);
      document.getElementById(`tab-${nextWidget.id}`)?.focus();
    }
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    const prevIndex = getNextSelectableIndex(index, widgets, -1);
    const prevWidget = widgets[prevIndex];
    if (prevWidget) {
      onSelectWidget(prevWidget.id);
      document.getElementById(`tab-${prevWidget.id}`)?.focus();
    }
  } else if (e.key === "Home") {
    e.preventDefault();
    const firstIndex = getFirstSelectableIndex(widgets);
    const firstWidget = widgets[firstIndex];
    if (firstWidget) {
      onSelectWidget(firstWidget.id);
      document.getElementById(`tab-${firstWidget.id}`)?.focus();
    }
  } else if (e.key === "End") {
    e.preventDefault();
    const lastIndex = getLastSelectableIndex(widgets);
    const lastWidget = widgets[lastIndex];
    if (lastWidget) {
      onSelectWidget(lastWidget.id);
      document.getElementById(`tab-${lastWidget.id}`)?.focus();
    }
  }
}

export const IslandNavigation: React.FC<IslandNavigationProps> = ({
  activeWidgetId,
  widgets,
  fileCount = 0,
  clipboardCount = 0,
  dropCount = 0,
  onSelectWidget,
  onCollapse,
}) => {
  return (
    <nav
      className="bbq-island-navigation"
      aria-label="BBQ Widgets Navigation"
      onClick={(e) => e.stopPropagation()}
    >
      <SegmentedTabBar
        activeWidgetId={activeWidgetId}
        widgets={widgets}
        fileCount={fileCount}
        clipboardCount={clipboardCount}
        dropCount={dropCount}
        onSelectWidget={onSelectWidget}
      />

      <div className="bbq-nav-actions" role="presentation">
        <button
          type="button"
          className="bbq-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
          title="Collapse Island (Esc)"
          aria-label="Collapse Island"
        >
          <Icon name="close" size={12} strokeWidth={2} />
        </button>
      </div>
    </nav>
  );
};
