import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./common/Icon.tsx";
import { redactSensitiveDetails } from "../state/errorState.ts";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Redacted developer diagnostics without sensitive leaks
    const sanitized = redactSensitiveDetails(error?.message || "Unknown error");
    console.warn("[BBQ ErrorBoundary] Uncaught UI exception:", sanitized, errorInfo?.componentStack ? "[componentStack]" : "");
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="bbq-error-boundary-surface"
          style={{
            padding: "16px 20px",
            background: "var(--bbq-surface-glass-expanded, rgba(18, 18, 24, 0.95))",
            color: "var(--bbq-text, #ffffff)",
            borderRadius: "var(--bbq-radius-expanded, 20px)",
            border: "1px solid var(--bbq-danger-border, rgba(239, 68, 68, 0.35))",
            fontSize: "12px",
            textAlign: "center",
            maxWidth: "340px",
            margin: "20px auto",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--bbq-danger, #ef4444)", marginBottom: "6px" }}>
            <Icon name="alert-triangle" size={24} />
          </div>
          <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "4px" }}>Interface Error</div>
          <div style={{ color: "var(--bbq-text-muted, #9ca3af)", fontSize: "11px", lineHeight: 1.4 }}>
            An unexpected error occurred while rendering this interface. You can reset the view to attempt rendering again.
          </div>
          <button
            id="bbq-error-boundary-retry-btn"
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: "12px",
              background: "rgba(239, 68, 68, 0.18)",
              color: "var(--bbq-text, #ffffff)",
              border: "1px solid var(--bbq-danger, #ef4444)",
              borderRadius: "6px",
              padding: "4px 14px",
              fontSize: "11px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 120ms ease",
            }}
          >
            Reset View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
