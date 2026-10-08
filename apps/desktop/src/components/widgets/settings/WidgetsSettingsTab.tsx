import React from "react";
import { Icon, type IconName } from "../../common/Icon.tsx";
import type { WidgetsSettingsTabProps } from "./settingsTypes.ts";

export const WidgetsSettingsTab: React.FC<WidgetsSettingsTabProps> = ({
  allRegisteredWidgets,
  currentIndicatorOrder,
  disabledWidgets,
  onToggleWidget,
  onMoveIndicator,
  onResetIndicatorOrder,
}) => {
  const disabledSet = new Set(disabledWidgets);
  const moveIndicator = onMoveIndicator;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Active Island Widgets - Reorderable */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--bbq-text-muted)" }}>
            Active Island Widgets (Order):
          </span>
          <button
            id="reset-widgets-order-btn"
            type="button"
            onClick={onResetIndicatorOrder}
            style={{
              background: "none",
              border: "none",
              color: "var(--bbq-accent)",
              fontSize: "11px",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
            aria-label="Reset widget order to defaults"
          >
            Reset Order
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {currentIndicatorOrder.map((widgetId, idx) => {
            const w = allRegisteredWidgets.find((item) => item.id === widgetId);
            const title = w?.title ?? widgetId;
            const iconName = (w?.icon as IconName) || "settings";

            return (
              <div
                key={widgetId}
                id={`widget-order-item-${widgetId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  background: "var(--bbq-surface-elevated)",
                  border: "1px solid var(--bbq-border)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <span style={{ color: "var(--bbq-text-muted)", fontSize: "11px", width: "16px" }}>
                    {idx + 1}.
                  </span>
                  <span aria-hidden="true" style={{ display: "flex", alignItems: "center" }}>
                    <Icon name={iconName} size={13} />
                  </span>
                  <span style={{ fontWeight: 500 }}>{title}</span>
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ display: "flex", gap: "2px" }}>
                    <button
                      id={`widget-move-up-${widgetId}`}
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveIndicator(idx, "up")}
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--bbq-border)",
                        background: "var(--bbq-surface)",
                        color: "var(--bbq-text)",
                        cursor: idx === 0 ? "not-allowed" : "pointer",
                        opacity: idx === 0 ? 0.35 : 1,
                        fontSize: "10px",
                        display: "flex",
                        alignItems: "center",
                      }}
                      aria-label={`Move ${title} up`}
                    >
                      <Icon name="chevron-up" size={10} />
                    </button>
                    <button
                      id={`widget-move-down-${widgetId}`}
                      type="button"
                      disabled={idx === currentIndicatorOrder.length - 1}
                      onClick={() => moveIndicator(idx, "down")}
                      style={{
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--bbq-border)",
                        background: "var(--bbq-surface)",
                        color: "var(--bbq-text)",
                        cursor: idx === currentIndicatorOrder.length - 1 ? "not-allowed" : "pointer",
                        opacity: idx === currentIndicatorOrder.length - 1 ? 0.35 : 1,
                        fontSize: "10px",
                        display: "flex",
                        alignItems: "center",
                      }}
                      aria-label={`Move ${title} down`}
                    >
                      <Icon name="chevron-down" size={10} />
                    </button>
                  </div>

                  <input
                    id={`widget-toggle-${widgetId}`}
                    type="checkbox"
                    checked={true}
                    onChange={() => onToggleWidget(widgetId)}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                    aria-label={`Disable ${title} widget`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Disabled Widgets (if any) */}
      {disabledWidgets.length > 0 && (
        <div>
          <span style={{ fontSize: "12px", color: "var(--bbq-text-muted)", display: "block", marginBottom: "6px" }}>
            Disabled Widgets:
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {allRegisteredWidgets
              .filter((w) => disabledSet.has(w.id))
              .map((w) => (
                <div
                  key={w.id}
                  id={`disabled-widget-item-${w.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px dashed var(--bbq-border)",
                    opacity: 0.7,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                    <span aria-hidden="true" style={{ display: "flex", alignItems: "center" }}>
                      <Icon name={(w?.icon as IconName) || "settings"} size={13} />
                    </span>
                    <span>{w.title}</span>
                  </span>
                  <input
                    id={`widget-enable-toggle-${w.id}`}
                    type="checkbox"
                    checked={false}
                    onChange={() => onToggleWidget(w.id)}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                    aria-label={`Enable ${w.title} widget`}
                  />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
