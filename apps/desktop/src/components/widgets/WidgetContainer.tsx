import React from "react";
import { WidgetBoundary } from "./WidgetBoundary.tsx";
import type { WidgetLifecycle } from "../../island/widgetRegistry.ts";

interface WidgetContainerProps {
  widgetId: string;
  widgetTitle: string;
  lifecycle?: WidgetLifecycle;
  children: React.ReactNode;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  widgetId,
  widgetTitle,
  lifecycle = "ready",
  children,
}) => {
  if (lifecycle === "loading") {
    return (
      <div className="bbq-widget-container loading">
        <div className="bbq-widget-loading-indicator">
          <span className="bbq-status-dot pulse" />
          <span>Loading {widgetTitle}...</span>
        </div>
      </div>
    );
  }

  if (lifecycle === "unavailable") {
    return (
      <div className="bbq-widget-container unavailable">
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px 0", fontSize: "12px" }}>
          {widgetTitle} is not yet available in this build.
        </div>
      </div>
    );
  }

  return (
    <div id={`widget-container-${widgetId}`} className="bbq-widget-container">
      <WidgetBoundary widgetId={widgetId} widgetTitle={widgetTitle}>
        {children}
      </WidgetBoundary>
    </div>
  );
};
