import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import type { WidgetDefinition } from "../../island/widgetRegistry.ts";
import { Icon } from "../common/Icon.tsx";
import {
  getWidgetIconName,
  isTabSelectable,
  getNextSelectableIndex,
  getFirstSelectableIndex,
  getLastSelectableIndex,
  getClampedWheelIndex,
} from "./segmentedTabBarModel.ts";

export {
  getWidgetIconName,
  isTabSelectable,
  getNextSelectableIndex,
  getFirstSelectableIndex,
  getLastSelectableIndex,
  getClampedWheelIndex,
};

export interface SegmentedTabBarProps {
  activeWidgetId: string | null;
  widgets: WidgetDefinition[];
  fileCount?: number;
  clipboardCount?: number;
  dropCount?: number;
  onSelectWidget: (widgetId: string) => void;
}

interface IndicatorGeometry {
  left: number;
  width: number;
  visible: boolean;
}

export const SegmentedTabBar: React.FC<SegmentedTabBarProps> = ({
  activeWidgetId,
  widgets,
  fileCount = 0,
  clipboardCount = 0,
  dropCount = 0,
  onSelectWidget,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastWheelTimeRef = useRef<number>(0);
  const [indicator, setIndicator] = useState<IndicatorGeometry>({
    left: 0,
    width: 0,
    visible: false,
  });

  // Calculate sliding indicator coordinates based on active tab's offset relative to container
  const updateIndicator = () => {
    if (!activeWidgetId || !containerRef.current) {
      setIndicator((prev) => ({ ...prev, visible: false }));
      return;
    }

    const activeEl = tabsRef.current.get(activeWidgetId);
    if (!activeEl) {
      setIndicator((prev) => ({ ...prev, visible: false }));
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();
    const left = tabRect.left - containerRect.left + containerRef.current.scrollLeft;
    const width = tabRect.width;

    setIndicator({
      left,
      width,
      visible: width > 0,
    });
  };

  useLayoutEffect(() => {
    updateIndicator();
  }, [activeWidgetId, widgets]);

  // Keep indicator aligned on window resize or font load
  useEffect(() => {
    const handleResize = () => updateIndicator();
    window.addEventListener("resize", handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      observer = new ResizeObserver(() => updateIndicator());
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
    };
  }, [activeWidgetId]);

  // Smoothly scroll active tab into view when activeWidgetId changes
  useEffect(() => {
    if (activeWidgetId) {
      const el = tabsRef.current.get(activeWidgetId);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      }
    }
  }, [activeWidgetId]);

  // Mouse wheel tab navigation with 150ms event gate and boundary clamping
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (widgets.length <= 1) return;

    const now = Date.now();
    if (now - lastWheelTimeRef.current < 150) {
      return;
    }

    const delta = e.deltaY || e.deltaX;
    if (Math.abs(delta) < 15) {
      return;
    }

    const currentIndex = widgets.findIndex((w) => w.id === activeWidgetId);
    if (currentIndex < 0) return;

    const direction: 1 | -1 = delta > 0 ? 1 : -1;
    const nextIndex = getClampedWheelIndex(currentIndex, widgets, direction);

    if (nextIndex !== currentIndex && widgets[nextIndex]) {
      lastWheelTimeRef.current = now;
      onSelectWidget(widgets[nextIndex].id);
    }
  };

  return (
    <div
      ref={containerRef}
      className="bbq-segmented-tab-bar"
      role="tablist"
      aria-label="BBQ Navigation Tabs"
      onWheel={handleWheel}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Sliding Active Indicator Pill (Hardware-accelerated CSS translate3d) */}
      <div
        className={`bbq-segmented-indicator ${indicator.visible ? "visible" : ""}`}
        style={{
          transform: `translate3d(${indicator.left}px, 0, 0)`,
          width: `${indicator.width}px`,
        }}
        aria-hidden="true"
      />

      {/* Tabs */}
      {widgets.map((widget, index) => {
        const isActive = activeWidgetId === widget.id;
        const selectable = isTabSelectable(widget);

        let badge: string | null = null;
        if (widget.id === "files" && fileCount > 0) {
          badge = `(${fileCount})`;
        } else if (widget.id === "clipboard" && clipboardCount > 0) {
          badge = `(${clipboardCount})`;
        } else if (widget.id === "drop" && dropCount > 0) {
          badge = `(${dropCount})`;
        }

        const iconName = getWidgetIconName(widget.id);

        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (widgets.length === 0) return;

          if (e.key === "ArrowRight") {
            e.preventDefault();
            const nextIdx = getNextSelectableIndex(index, widgets, 1);
            const target = widgets[nextIdx];
            if (target && nextIdx !== index) {
              onSelectWidget(target.id);
              tabsRef.current.get(target.id)?.focus();
            }
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            const prevIdx = getNextSelectableIndex(index, widgets, -1);
            const target = widgets[prevIdx];
            if (target && prevIdx !== index) {
              onSelectWidget(target.id);
              tabsRef.current.get(target.id)?.focus();
            }
          } else if (e.key === "Home") {
            e.preventDefault();
            const firstIdx = getFirstSelectableIndex(widgets);
            const target = widgets[firstIdx];
            if (target) {
              onSelectWidget(target.id);
              tabsRef.current.get(target.id)?.focus();
            }
          } else if (e.key === "End") {
            e.preventDefault();
            const lastIdx = getLastSelectableIndex(widgets);
            const target = widgets[lastIdx];
            if (target) {
              onSelectWidget(target.id);
              tabsRef.current.get(target.id)?.focus();
            }
          }
        };

        return (
          <button
            key={widget.id}
            ref={(el) => {
              if (el) {
                tabsRef.current.set(widget.id, el);
              } else {
                tabsRef.current.delete(widget.id);
              }
            }}
            id={`tab-${widget.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            aria-controls={`widget-container-${widget.id}`}
            aria-disabled={!selectable ? "true" : undefined}
            disabled={!selectable}
            className={`bbq-segmented-tab ${isActive ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (selectable) {
                onSelectWidget(widget.id);
              }
            }}
            onKeyDown={handleKeyDown}
            title={`${widget.title} Widget`}
            aria-label={`${widget.title} tab${badge ? ` with ${badge}` : ""}`}
          >
            <span className="bbq-segmented-tab-icon" aria-hidden="true">
              <Icon name={iconName} size={14} strokeWidth={1.75} />
            </span>
            <span className="bbq-segmented-tab-label">{widget.title}</span>
            {badge && <span className="bbq-segmented-tab-badge">{badge}</span>}
          </button>
        );
      })}
    </div>
  );
};
