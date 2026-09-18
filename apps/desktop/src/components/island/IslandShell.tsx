import React from "react";
import type { IslandMode } from "@bbq/types";
import type { IslandMachineState } from "../../island/islandState.ts";
import { Icon } from "../common/Icon.tsx";

interface IslandShellProps {
  state: IslandMachineState;
  mode: IslandMode;
  hasMedia?: boolean;
  isDragOver?: boolean;
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

  return (
    <div
      id="bbq-island-shell"
      role="region"
      aria-label="BBQ Productivity Island"
      tabIndex={0}
      className={`bbq-island-shell ${modeClass} ${stateClass} ${mediaClass} ${dragClass}`}
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
