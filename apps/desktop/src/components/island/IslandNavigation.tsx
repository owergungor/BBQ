import React from "react";
import type { WidgetDefinition } from "../../island/widgetRegistry.ts";

interface IslandNavigationProps {
  activeWidgetId: string | null;
  widgets: WidgetDefinition[];
  fileCount?: number;
  clipboardCount?: number;
  dropCount?: number;
  onSelectWidget: (widgetId: string) => void;
  onCollapse: () => void;
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
      role="tablist"
    >
      <div className="bbq-nav-tab-group" role="presentation">
        {widgets.map((widget, index) => {
          const isActive = activeWidgetId === widget.id;
          let badge: string | null = null;
          if (widget.id === "files" && fileCount > 0) {
            badge = `(${fileCount})`;
          } else if (widget.id === "clipboard" && clipboardCount > 0) {
            badge = `(${clipboardCount})`;
          } else if (widget.id === "drop" && dropCount > 0) {
            badge = `(${dropCount})`;
          }

          const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              const nextIndex = (index + 1) % widgets.length;
              const nextWidget = widgets[nextIndex];
              if (nextWidget) {
                onSelectWidget(nextWidget.id);
                document.getElementById(`tab-${nextWidget.id}`)?.focus();
              }
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              const prevIndex = (index - 1 + widgets.length) % widgets.length;
              const prevWidget = widgets[prevIndex];
              if (prevWidget) {
                onSelectWidget(prevWidget.id);
                document.getElementById(`tab-${prevWidget.id}`)?.focus();
              }
            } else if (e.key === "Home") {
              e.preventDefault();
              const firstWidget = widgets[0];
              if (firstWidget) {
                onSelectWidget(firstWidget.id);
                document.getElementById(`tab-${firstWidget.id}`)?.focus();
              }
            } else if (e.key === "End") {
              e.preventDefault();
              const lastWidget = widgets[widgets.length - 1];
              if (lastWidget) {
                onSelectWidget(lastWidget.id);
                document.getElementById(`tab-${lastWidget.id}`)?.focus();
              }
            }
          };

          return (
            <button
              key={widget.id}
              id={`tab-${widget.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              aria-controls={`widget-container-${widget.id}`}
              className={`bbq-btn bbq-nav-tab ${isActive ? "bbq-btn-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectWidget(widget.id);
              }}
              onKeyDown={handleKeyDown}
              title={`${widget.title} Widget`}
              aria-label={`${widget.title} tab${badge ? ` with ${badge}` : ""}`}
            >
              <span className="bbq-nav-icon" aria-hidden="true">
                {widget.icon}
              </span>
              <span className="bbq-nav-title">{widget.title}</span>
              {badge && <span className="bbq-nav-badge">{badge}</span>}
            </button>
          );
        })}
      </div>

      <div className="bbq-nav-actions" role="presentation">
        <button
          type="button"
          className="bbq-btn bbq-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
          title="Collapse Island (Esc)"
          aria-label="Collapse Island"
        >
          Collapse
        </button>
      </div>
    </nav>
  );
};
