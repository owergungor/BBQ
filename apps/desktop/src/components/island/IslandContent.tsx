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
import { resolveEffectiveIndicatorOrder } from "../../island/compactOrder.ts";
import { subscribeToDatabaseRecovered } from "../../ipc/events.ts";
import { Icon } from "../common/Icon.tsx";

export interface WidgetRendererProps {
  onSelectWidget: (widgetId: string) => void;
  onCollapse: () => void;
}

export type WidgetRenderer = React.FC<WidgetRendererProps>;

export const WIDGET_RENDERERS: Record<string, WidgetRenderer> = {
  drop: () => <DropWidget />,
  files: () => <FileWorkspaceWidget />,
  clipboard: () => <ClipboardWidget />,
  media: () => <MediaWidget />,
  system: () => <SystemWidget />,
  launcher: ({ onSelectWidget, onCollapse }) => (
    <LauncherWidget onSelectWidget={onSelectWidget} onCollapse={onCollapse} />
  ),
  timer: () => <TimerWidget />,
  reminder: () => <ReminderWidget />,
  settings: () => <SettingsWidget />,
};

export function renderWidgetComponent(
  widgetId: string,
  props: WidgetRendererProps
): React.ReactNode {
  const Renderer = WIDGET_RENDERERS[widgetId];
  if (Renderer) {
    return <Renderer {...props} />;
  }
  return (
    <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>
      Widget {widgetId} content ready.
    </div>
  );
}

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
  const [dbRecoveryWarning, setDbRecoveryWarning] = React.useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    subscribeToDatabaseRecovered((payload) => {
      if (payload.recovered) {
        setDbRecoveryWarning("Database was safely recovered from quarantine.");
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);
  // Selector subscriptions for navigation badges only in expanded mode
  const fileCount = useFileState((s) => s.entries.length);
  const clipboardCount = useClipboardState((s) => s.entries.length);
  const dropCount = useDropState((s) => s.currentBatch?.count ?? 0);
  const disabledWidgets = useSettingsState((s) => s.settings.disabled_widgets);
  const compactIndicatorOrder = useSettingsState((s) => s.settings.compact_indicator_order);

  useEffect(() => {
    initSettingsState();
  }, []);

  useEffect(() => {
    widgetRegistry.setDisabledWidgets(disabledWidgets);
  }, [disabledWidgets]);

  // Idle, Hovering, DraggingOver compact pill representations
  if (state !== "Expanded") {
    return <CompactIslandPill state={state} activeWidgetId={activeWidgetId} />;
  }

  // Expanded View with Navigation and Isolated Active Widget
  const effectiveOrder = resolveEffectiveIndicatorOrder(
    compactIndicatorOrder,
    disabledWidgets
  );
  const rawActiveWidgets = widgetRegistry.getActiveWidgets();
  const orderMap = new Map(effectiveOrder.map((id, index) => [id, index]));
  const activeWidgets = [...rawActiveWidgets].sort((a, b) => {
    const orderA = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : 999;
    const orderB = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : 999;
    return orderA - orderB;
  });

  const currentWidgetId =
    activeWidgetId && activeWidgets.some((w) => w.id === activeWidgetId)
      ? activeWidgetId
      : activeWidgets[0]?.id ?? null;
  const activeDef = currentWidgetId ? widgetRegistry.get(currentWidgetId) : undefined;

  return (
    <div
      className="bbq-island-content expanded"
      onClick={(e) => e.stopPropagation()}
    >
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
          {dbRecoveryWarning && (
            <div
              role="status"
              aria-live="polite"
              className="bbq-recovery-banner"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                margin: "0 12px 8px 12px",
                borderRadius: "6px",
                backgroundColor: "var(--surface-sunken, rgba(255, 200, 0, 0.1))",
                border: "1px solid var(--accent-amber, #e5a50a)",
                color: "var(--text-primary, #ffffff)",
                fontSize: "12px",
                lineHeight: "1.3",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon name="refresh" size={14} />
                <span>{dbRecoveryWarning}</span>
              </div>
              <button
                type="button"
                onClick={() => setDbRecoveryWarning(null)}
                aria-label="Dismiss recovery notice"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary, #a0a0a0)",
                  cursor: "pointer",
                  padding: "2px 6px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )}
          {currentWidgetId ? (
            <WidgetContainer
              widgetId={currentWidgetId}
              widgetTitle={activeDef?.title ?? currentWidgetId}
              lifecycle={activeDef?.lifecycle ?? "ready"}
            >
              {renderWidgetComponent(currentWidgetId, { onSelectWidget, onCollapse })}
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
