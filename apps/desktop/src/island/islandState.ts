import { createDomainStore } from "../state/createStore.ts";
import type { IslandMode } from "@bbq/types";

export type IslandMachineState =
  | "Idle"
  | "Hovering"
  | "Expanded"
  | "DraggingOver"
  | "Transitioning";

export type InteractionSource =
  | "mouse"
  | "keyboard"
  | "drag"
  | "event"
  | "none";

export interface IslandState {
  state: IslandMachineState;
  mode: IslandMode;
  activeWidgetId: string | null;
  previousWidgetId: string | null;
  userLockedWidget: boolean;
  interaction: InteractionSource;
  expanded: boolean;
  isHovered: boolean;
  isDragOver: boolean;
  recentWidgets: string[];
  eventHistory: string[];
}

export const MAX_RECENT_WIDGETS = 10;
export const MAX_EVENT_HISTORY = 50;

export const initialIslandState: IslandState = {
  state: "Idle",
  mode: "IDLE",
  activeWidgetId: "files",
  previousWidgetId: null,
  userLockedWidget: false,
  interaction: "none",
  expanded: false,
  isHovered: false,
  isDragOver: false,
  recentWidgets: ["files"],
  eventHistory: [],
};

export const islandStore = createDomainStore<IslandState>(initialIslandState);

export const useIslandState = islandStore.useStore;

/**
 * Record an event in bounded event history (max 50)
 */
export function recordIslandEvent(eventName: string): void {
  islandStore.setState((prev) => {
    const nextHistory = [
      `${new Date().toISOString().slice(11, 19)} - ${eventName}`,
      ...prev.eventHistory,
    ].slice(0, MAX_EVENT_HISTORY);
    return { eventHistory: nextHistory };
  });
}

/**
 * Select active widget with bounded recent widget tracking (max 10)
 */
export function setActiveWidget(widgetId: string, isUserAction: boolean = false): void {
  islandStore.setState((prev) => {
    if (prev.activeWidgetId === widgetId) {
      return { userLockedWidget: isUserAction ? true : prev.userLockedWidget };
    }
    const filteredRecents = prev.recentWidgets.filter((id) => id !== widgetId);
    const nextRecents = [widgetId, ...filteredRecents].slice(0, MAX_RECENT_WIDGETS);

    return {
      activeWidgetId: widgetId,
      previousWidgetId: prev.activeWidgetId,
      userLockedWidget: isUserAction ? true : prev.userLockedWidget,
      recentWidgets: nextRecents,
    };
  });
}
