import type { WidgetDefinition } from "../../island/widgetRegistry.ts";
import type { IconName } from "../common/Icon.tsx";

/**
 * Centrally and type-safely maps widget IDs to BBQ native SVG IconName.
 * Guarantees zero emoji fallback.
 */
export function getWidgetIconName(widgetId: string): IconName {
  switch (widgetId) {
    case "media":
      return "media";
    case "system":
    case "stats":
      return "stats";
    case "timer":
      return "timer";
    case "clipboard":
      return "clipboard";
    case "files":
      return "files";
    case "launcher":
      return "launcher";
    case "reminder":
    case "reminders":
      return "reminders";
    case "settings":
      return "settings";
    case "drop":
      return "drop";
    case "network":
      return "network";
    case "notes":
      return "files";
    case "bookmarks":
      return "pin";
    default:
      return "sparkles";
  }
}

/**
 * Validates whether a tab is enabled and safe for selection.
 */
export function isTabSelectable(widget: WidgetDefinition | undefined): boolean {
  if (!widget) return false;
  if (widget.lifecycle === "unavailable") return false;
  if (typeof widget.canActivate === "function" && !widget.canActivate()) return false;
  return true;
}

export function getNextSelectableIndex(
  currentIndex: number,
  widgets: WidgetDefinition[],
  direction: 1 | -1
): number {
  if (widgets.length === 0) return -1;
  for (let step = 1; step <= widgets.length; step++) {
    const candidateIndex = (currentIndex + direction * step + widgets.length) % widgets.length;
    if (isTabSelectable(widgets[candidateIndex])) {
      return candidateIndex;
    }
  }
  return currentIndex;
}

export function getFirstSelectableIndex(widgets: WidgetDefinition[]): number {
  return widgets.findIndex((w) => isTabSelectable(w));
}

export function getLastSelectableIndex(widgets: WidgetDefinition[]): number {
  for (let i = widgets.length - 1; i >= 0; i--) {
    if (isTabSelectable(widgets[i])) return i;
  }
  return -1;
}

export function getClampedWheelIndex(
  currentIndex: number,
  widgets: WidgetDefinition[],
  direction: 1 | -1
): number {
  if (widgets.length === 0) return -1;
  let next = currentIndex + direction;
  while (next >= 0 && next < widgets.length) {
    if (isTabSelectable(widgets[next])) {
      return next;
    }
    next += direction;
  }
  return currentIndex;
}
