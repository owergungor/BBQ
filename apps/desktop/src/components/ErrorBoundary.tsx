import { Component, type ErrorInfo, type ReactNode } from "react";

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
    console.error("Uncaught error inside BBQ UI boundary:", error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "12px 16px",
          background: "rgba(30, 0, 0, 0.9)",
          color: "#ff8080",
          borderRadius: "16px",
          border: "1px solid rgba(255, 0, 0, 0.3)",
          fontSize: "12px",
          textAlign: "center",
          maxWidth: "320px",
          margin: "0 auto",
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>BBQ Recovered Error</div>
          <div>Something went wrong in this widget.</div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: "8px",
              background: "#400",
              color: "#fff",
              border: "1px solid #700",
              borderRadius: "6px",
              padding: "2px 8px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
