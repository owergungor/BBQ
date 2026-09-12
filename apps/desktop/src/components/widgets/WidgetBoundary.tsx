import { Component, type ErrorInfo, type ReactNode } from "react";
import { handleWidgetCrash, type WidgetErrorState as WidgetCrashState } from "../../island/widgetBoundary.ts";
import { WidgetErrorState } from "./WidgetPrimitives.tsx";

interface Props {
  widgetId: string;
  widgetTitle: string;
  children: ReactNode;
}

export class WidgetBoundary extends Component<Props, WidgetCrashState> {
  public override state: WidgetCrashState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): WidgetCrashState {
    return handleWidgetCrash(error);
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[BBQ WidgetBoundary] Uncaught error in widget "${this.props.widgetTitle}" (${this.props.widgetId}):`,
      error,
      errorInfo
    );
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <WidgetErrorState
          title={`${this.props.widgetTitle} Widget Recovered`}
          message="This widget encountered an error and was safely isolated. Other BBQ widgets remain active."
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      );
    }

    return this.props.children;
  }
}
