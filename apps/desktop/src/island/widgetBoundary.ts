export interface WidgetErrorState {
  hasError: boolean;
  error: Error | null;
}

export function handleWidgetCrash(error: Error): WidgetErrorState {
  return {
    hasError: true,
    error,
  };
}
