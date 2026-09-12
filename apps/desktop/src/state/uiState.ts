import { createDomainStore } from "./createStore.ts";
import type { IslandMode } from "@bbq/types";

export interface UiState {
  mode: IslandMode;
  isHovered: boolean;
  activeWidgetId: string | null;
}

export const uiStore = createDomainStore<UiState>({
  mode: "IDLE",
  isHovered: false,
  activeWidgetId: null,
});

export const useUiState = uiStore.useStore;
