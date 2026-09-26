import React from "react";
import type { IslandMode } from "@bbq/types";
import type { IslandMachineState } from "../../island/islandState.ts";
import type { WidgetSizingContract } from "@bbq/types";
import { Icon } from "../common/Icon.tsx";

interface IslandShellProps {
  state: IslandMachineState;
  mode: IslandMode;
  hasMedia?: boolean;
  isDragOver?: boolean;
  sizing?: WidgetSizingContract;
  contentWidth?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const IslandShell: React.FC<IslandShellProps> = ({
  state,
  mode,
  hasMedia,
  isDragOver,
  sizing,
  contentWidth,
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onKeyDown,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
}) => {
  const modeClass = `mode-${mode.toLowerCase()}`;
  const stateClass = `state-${state.toLowerCase()}`;
  const mediaClass = hasMedia ? "has-media" : "";
  const dragClass = isDragOver ? "drag-over" : "";

  let dynamicStyle: React.CSSProperties = { ...style };
  if (sizing) {
    if (state === "Idle") {
      const w = contentWidth
        ? Math.min(sizing.compact.maxWidth, Math.max(sizing.compact.minWidth, contentWidth))
        : sizing.compact.preferredWidth;
      dynamicStyle = {
        ...dynamicStyle,
        maxWidth: `${w}px`,
        maxHeight: `${sizing.compact.preferredHeight}px`,
      };
    } else if (state === "Hovering") {
      const baseW = contentWidth
        ? Math.min(sizing.compact.maxWidth, Math.max(sizing.compact.minWidth, contentWidth))
        : sizing.compact.preferredWidth;
      dynamicStyle = {
        ...dynamicStyle,
        maxWidth: `${baseW + 40}px`,
        maxHeight: `${sizing.compact.preferredHeight + 6}px`,
      };
    } else if (state === "Expanded") {
      dynamicStyle = {
        ...dynamicStyle,
        maxWidth: `${sizing.expanded.preferredWidth}px`,
        maxHeight: `${sizing.expanded.preferredHeight}px`,
      };
    }
  }

  return (
    <div
      id="bbq-island-shell"
      role="region"
      aria-label="BBQ Productivity Island"
      tabIndex={0}
      className={`bbq-island-shell ${modeClass} ${stateClass} ${mediaClass} ${dragClass}`}
      style={dynamicStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className={`bbq-drop-target-indicator ${isDragOver ? "visible" : ""}`}
        aria-hidden={!isDragOver}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <Icon name="drop" size={14} aria-hidden="true" />
          <span>Stage files on Drop Shelf</span>
        </span>
      </div>
      {children}
    </div>
  );
};
