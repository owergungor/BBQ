import { createDomainStore } from "./createStore.ts";
import type { HotkeyDefinition, HotkeyCapabilities } from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToHotkeyTriggered, subscribeToHotkeyConflict } from "../ipc/events.ts";

export interface HotkeyDomainState {
  definition: HotkeyDefinition | null;
  capabilities: HotkeyCapabilities | null;
  lastTriggeredAt: number | null;
  conflictError: string | null;
  isLoading: boolean;
}

export const initialHotkeyDomainState: HotkeyDomainState = {
  definition: null,
  capabilities: null,
  lastTriggeredAt: null,
  conflictError: null,
  isLoading: false,
};

export const hotkeyStore = createDomainStore<HotkeyDomainState>(
  initialHotkeyDomainState
);

export const useHotkeyState = hotkeyStore.useStore;

export function setHotkeyDefinition(definition: HotkeyDefinition | null): void {
  hotkeyStore.setState({ definition, conflictError: null });
}

export function setHotkeyCapabilities(capabilities: HotkeyCapabilities | null): void {
  hotkeyStore.setState({ capabilities });
}

export function setHotkeyConflict(reason: string): void {
  hotkeyStore.setState({ conflictError: reason });
}

export function recordHotkeyTrigger(): void {
  hotkeyStore.setState({ lastTriggeredAt: Date.now() });
}

export async function initHotkeyStore(): Promise<() => void> {
  hotkeyStore.setState({ isLoading: true });

  const [definition, capabilities] = await Promise.all([
    bbqCommands.hotkeyGetDefinition(),
    bbqCommands.hotkeyGetCapabilities(),
  ]);

  hotkeyStore.setState({
    definition,
    capabilities,
    isLoading: false,
  });

  const unlistenTrigger = await subscribeToHotkeyTriggered(() => {
    recordHotkeyTrigger();
  });

  const unlistenConflict = await subscribeToHotkeyConflict((payload) => {
    setHotkeyConflict(payload.reason);
  });

  return () => {
    unlistenTrigger();
    unlistenConflict();
  };
}
