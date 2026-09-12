import React, { useEffect } from "react";
import type { IslandMode } from "@bbq/types";
import type { IslandMachineState } from "../../island/islandState.ts";
import { widgetRegistry } from "../../island/widgetRegistry.ts";
import { useFileState } from "../../state/fileState.ts";
import { useClipboardState } from "../../state/clipboardState.ts";
import { useDropState } from "../../state/dropState.ts";
import { CompactIslandPill } from "./CompactIndicators.tsx";
import { IslandNavigation } from "./IslandNavigation.tsx";
import { WidgetContainer } from "../widgets/WidgetContainer.tsx";
import { FileWorkspaceWidget } from "../widgets/FileWorkspaceWidget.tsx";
import { ClipboardWidget } from "../widgets/ClipboardWidget.tsx";
import { MediaWidget } from "../widgets/MediaWidget.tsx";
import { SystemWidget } from "../widgets/SystemWidget.tsx";
import { TimerWidget } from "../widgets/TimerWidget.tsx";
import { ReminderWidget } from "../widgets/ReminderWidget.tsx";
import { LauncherWidget } from "../widgets/LauncherWidget.tsx";
import { DropWidget } from "../widgets/DropWidget.tsx";
import { SettingsWidget } from "../widgets/SettingsWidget.tsx";
import { useSettingsState, initSettingsState } from "../../state/settingsState.ts";

interface IslandContentProps {
  state: IslandMachineState;
  mode?: IslandMode;
  activeWidgetId: string | null;
  onSelectWidget: (widgetId: string) => void;
  onCollapse: () => void;
}

export const IslandContent: React.FC<IslandContentProps> = ({
  state,
  mode: _mode,
  activeWidgetId,
  onSelectWidget,
  onCollapse,
}) => {
  // Selector subscriptions for navigation badges only in expanded mode
  const fileCount = useFileState((s) => s.entries.length);
  const clipboardCount = useClipboardState((s) => s.entries.length);
  const dropCount = useDropState((s) => s.currentBatch?.count ?? 0);
  const disabledWidgets = useSettingsState((s) => s.settings.disabled_widgets);

  useEffect(() => {
    initSettingsState();
  }, []);

  useEffect(() => {
    widgetRegistry.setDisabledWidgets(disabledWidgets);
  }, [disabledWidgets]);

  // Register widgets into widgetRegistry
  useEffect(() => {
    try {
      widgetRegistry.register({
        id: "drop",
        title: "Drop Zone",
        icon: "📥",
        priority: 90,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "files",
        title: "Files",
        icon: "📁",
        priority: 85,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "clipboard",
        title: "Clipboard",
        icon: "📋",
        priority: 80,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "media",
        title: "Media",
        icon: "🎵",
        priority: 70,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "system",
        title: "System",
        icon: "⚙️",
        priority: 50,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "launcher",
        title: "Launcher",
        icon: "🚀",
        priority: 45,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "timer",
        title: "Timer",
        icon: "⏱️",
        priority: 40,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "reminder",
        title: "Reminders",
        icon: "🔔",
        priority: 35,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }

    try {
      widgetRegistry.register({
        id: "settings",
        title: "Settings",
        icon: "⚙️",
        priority: 15,
        canActivate: () => true,
        lifecycle: "ready",
      });
    } catch {
      // Already registered
    }
  }, []);

  // Idle, Hovering, DraggingOver compact pill representations
  if (state !== "Expanded") {
    return <CompactIslandPill state={state} activeWidgetId={activeWidgetId} />;
  }

  // Expanded View with Navigation and Isolated Active Widget
  const activeWidgets = widgetRegistry.getActiveWidgets();
  const currentWidgetId =
    activeWidgetId && activeWidgets.some((w) => w.id === activeWidgetId)
      ? activeWidgetId
      : activeWidgets[0]?.id ?? null;
  const activeDef = currentWidgetId ? widgetRegistry.get(currentWidgetId) : undefined;

  return (
    <div className="bbq-island-content expanded">
      <div className="bbq-island-expanded-view">
        <IslandNavigation
          activeWidgetId={currentWidgetId}
          widgets={activeWidgets}
          fileCount={fileCount}
          clipboardCount={clipboardCount}
          dropCount={dropCount}
          onSelectWidget={onSelectWidget}
          onCollapse={onCollapse}
        />

        <div className="bbq-expanded-body">
          {currentWidgetId ? (
            <WidgetContainer
              widgetId={currentWidgetId}
              widgetTitle={activeDef?.title ?? currentWidgetId}
              lifecycle={activeDef?.lifecycle ?? "ready"}
            >
              {currentWidgetId === "drop" ? (
                <DropWidget />
              ) : currentWidgetId === "files" ? (
                <FileWorkspaceWidget />
              ) : currentWidgetId === "clipboard" ? (
                <ClipboardWidget />
              ) : currentWidgetId === "media" ? (
                <MediaWidget />
              ) : currentWidgetId === "system" ? (
                <SystemWidget />
              ) : currentWidgetId === "launcher" ? (
                <LauncherWidget onSelectWidget={onSelectWidget} onCollapse={onCollapse} />
              ) : currentWidgetId === "timer" ? (
                <TimerWidget />
              ) : currentWidgetId === "reminder" ? (
                <ReminderWidget />
              ) : currentWidgetId === "settings" ? (
                <SettingsWidget />
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>
                  Widget {currentWidgetId} content ready.
                </div>
              )}
            </WidgetContainer>
          ) : (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "var(--text-secondary)",
                fontSize: "13px",
              }}
            >
              All widgets are currently disabled in Settings.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
