import React from "react";
import type { IslandMode } from "@bbq/types";
import type { IslandMachineState } from "../../island/islandState.ts";
import type { WidgetSizingContract } from "@bbq/types";
import { Icon } from "../common/Icon.tsx";

import { useSettingsState } from "../../state/settingsState.ts";
import { resolveEffectiveCompactWidth } from "../../island/geometryResolution.ts";
import { useTranslation } from "../../i18n/index.ts";

interface IslandShellProps {
  state: IslandMachineState;
  mode: IslandMode;
  hasMedia?: boolean;
  isDragOver?: boolean;
  sizing?: WidgetSizingContract;
  contentWidth?: number;
  expandedHeight?: number;
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
  moveHud?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export const IslandShell: React.FC<IslandShellProps> = ({
  state,
  mode,
  hasMedia,
  isDragOver,
  sizing,
  contentWidth,
  expandedHeight,
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
  moveHud = false,
  onPointerDown,
}) => {
  const { t } = useTranslation();
  const userCompactWidth = useSettingsState((s) => s.settings.island_width);
  const islandPosition = useSettingsState((s) => s.settings.island_position || "top-center");
  const islandMode = useSettingsState((s) => s.settings.island_mode || "island");
  const islandVerticalPosition = useSettingsState((s) => s.settings.island_vertical_position || "top");
  const dotSize = useSettingsState((s) => s.settings.dot_size || 38);
  const modeClass = `mode-${mode.toLowerCase()}`;
  const styleModeClass = `mode-${islandMode}`;
  const vposClass = `vpos-${islandVerticalPosition}`;
  const stateClass = `state-${state.toLowerCase()}`;
  const mediaClass = hasMedia ? "has-media" : "";
  const dragClass = isDragOver ? "drag-over" : "";
  const moveClass = moveHud ? "bbq-move-hud-active" : "";

  let dynamicStyle: React.CSSProperties = { ...style };
  if (state === "Idle") {
    if (islandMode === "dot") {
      dynamicStyle = {
        ...dynamicStyle,
        width: `${dotSize}px`,
        minWidth: `${dotSize}px`,
        maxWidth: `${dotSize}px`,
        height: `${dotSize}px`,
        minHeight: `${dotSize}px`,
        maxHeight: `${dotSize}px`,
        aspectRatio: "1 / 1",
        borderRadius: "50%",
      };
    } else if (islandMode === "notch") {
      const resolvedW = resolveEffectiveCompactWidth({
        contentMinWidth: contentWidth,
        userCompactWidth,
        widgetSizing: sizing,
      });
      dynamicStyle = {
        ...dynamicStyle,
        minWidth: "160px",
        maxWidth: `${Math.min(480, Math.max(160, resolvedW))}px`,
        minHeight: "34px",
        maxHeight: "var(--bbq-compact-height, 38px)",
      };
    } else {
      const resolvedW = resolveEffectiveCompactWidth({
        contentMinWidth: contentWidth,
        userCompactWidth,
        widgetSizing: sizing,
      });
      dynamicStyle = {
        ...dynamicStyle,
        minWidth: "64px",
        maxWidth: `${Math.min(480, Math.max(64, resolvedW))}px`,
        minHeight: "32px",
        maxHeight: "var(--bbq-compact-height, 38px)",
      };
    }
  } else if (state === "Hovering") {
    if (islandMode === "dot") {
      const hoverDot = dotSize + 6;
      dynamicStyle = {
        ...dynamicStyle,
        width: `${hoverDot}px`,
        maxWidth: `${hoverDot}px`,
        height: `${hoverDot}px`,
        maxHeight: `${hoverDot}px`,
        aspectRatio: "1 / 1",
        borderRadius: "50%",
      };
    } else {
      const resolvedW = resolveEffectiveCompactWidth({
        contentMinWidth: contentWidth,
        userCompactWidth,
        widgetSizing: sizing,
      });
      dynamicStyle = {
        ...dynamicStyle,
        maxWidth: `${resolvedW + 40}px`,
        maxHeight: "var(--bbq-peek-height, 44px)",
      };
    }
  } else if (state === "Expanded") {
    const expHeight = expandedHeight
      ? `${expandedHeight}px`
      : (sizing ? `${sizing.expanded.preferredHeight}px` : "var(--bbq-expanded-height, 360px)");
    const expWidth = sizing ? `${sizing.expanded.preferredWidth}px` : "var(--bbq-expanded-width, 520px)";
    dynamicStyle = {
      ...dynamicStyle,
      width: expWidth,
      maxWidth: expWidth,
      height: expHeight,
      maxHeight: expHeight,
    };
  }

  return (
    <div
      id="bbq-island-shell"
      role="region"
      aria-label={t("shell.ariaLabel") || "BBQ Productivity Island"}
      tabIndex={0}
      data-anchor={islandPosition}
      data-island-mode={islandMode}
      data-vertical-pos={islandVerticalPosition}
      data-move-hud={moveHud ? "true" : undefined}
      className={`bbq-island-shell ${modeClass} ${styleModeClass} ${vposClass} ${stateClass} ${mediaClass} ${dragClass} ${moveClass}`.trim()}
      style={dynamicStyle}
      onPointerDown={onPointerDown}
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
          <span>{t("shell.stageFilesDrop") || "Stage files on Drop Shelf"}</span>
        </span>
      </div>
      {children}
    </div>
  );
};