import React, { useEffect, useCallback } from "react";
import { useErrorState, dismissAppError, reportAppError, type ErrorStoreState } from "../../state/errorState.ts";
import { Icon } from "./Icon.tsx";
import { escapeManager, EscapePriority } from "../../island/escapeManager.ts";

export interface AppErrorBannerProps {
  className?: string;
  style?: React.CSSProperties;
}

export const AppErrorBanner: React.FC<AppErrorBannerProps> = ({
  className = "",
  style,
}) => {
  const activeError = useErrorState((s: ErrorStoreState) => s.activeError);

  const handleDismiss = useCallback(() => {
    if (activeError) {
      dismissAppError(activeError.id);
    }
  }, [activeError]);

  // Register with escapeManager at high priority so Escape dismisses the error first
  useEffect(() => {
    if (!activeError) return;

    const unregister = escapeManager.register(() => {
      handleDismiss();
      return true; // Consumed: prevent parent island collapse
    }, EscapePriority.DROPDOWN);

    return unregister;
  }, [activeError, handleDismiss]);

  if (!activeError) {
    return null;
  }

  const [isRecovering, setIsRecovering] = React.useState(false);

  const handleRecovery = async () => {
    if (typeof activeError.onRecover === "function" && !isRecovering) {
      setIsRecovering(true);
      try {
        await activeError.onRecover();
      } catch (recErr) {
        reportAppError(recErr, { category: activeError.category });
      } finally {
        setIsRecovering(false);
        handleDismiss();
      }
    }
  };

  return (
    <div
      id="bbq-app-error-banner"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`bbq-app-error-banner ${className}`.trim()}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "10px",
        padding: "8px 12px",
        margin: "0 12px 8px 12px",
        borderRadius: "8px",
        background: "var(--bbq-danger-bg, rgba(239, 68, 68, 0.12))",
        border: "1px solid var(--bbq-danger-border, rgba(239, 68, 68, 0.35))",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
        zIndex: 50,
        flexShrink: 0,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flex: 1, minWidth: 0 }}>
        <span
          className="bbq-error-icon"
          aria-hidden="true"
          style={{ color: "var(--bbq-danger, #ef4444)", marginTop: "2px", flexShrink: 0 }}
        >
          <Icon name="alert-triangle" size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="bbq-error-title"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--bbq-text, #ffffff)",
              lineHeight: 1.3,
            }}
          >
            {activeError.title}
          </div>
          <div
            className="bbq-error-message"
            style={{
              fontSize: "11px",
              color: "var(--bbq-text-muted, #9ca3af)",
              marginTop: "2px",
              lineHeight: 1.4,
              wordBreak: "break-word",
            }}
          >
            {activeError.message}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginTop: "1px" }}>
        {typeof activeError.onRecover === "function" && (
          <button
            id="bbq-error-recovery-btn"
            type="button"
            disabled={isRecovering}
            onClick={handleRecovery}
            className="bbq-btn-retry"
            style={{
              padding: "3px 8px",
              fontSize: "11px",
              fontWeight: 500,
              borderRadius: "4px",
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid var(--bbq-danger, #ef4444)",
              color: "var(--bbq-text, #ffffff)",
              cursor: isRecovering ? "not-allowed" : "pointer",
              opacity: isRecovering ? 0.6 : 1,
              transition: "all 120ms ease",
            }}
          >
            {activeError.recoveryLabel || "Retry"}
          </button>
        )}
        <button
          id="bbq-error-dismiss-btn"
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss error notification"
          className="bbq-btn-dismiss"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--bbq-text-muted, #9ca3af)",
            cursor: "pointer",
            padding: "2px 4px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
            transition: "color 120ms ease",
          }}
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
};
