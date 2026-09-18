import { createDomainStore } from "./createStore.ts";
import type { SystemState, SystemCapabilities } from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToSystemChanged } from "../ipc/events.ts";

export interface SystemDomainState {
  system: SystemState;
  capabilities: SystemCapabilities | null;
  isLoading: boolean;
  error: string | null;
}

export const defaultSystemState: SystemState = {
  battery: {
    available: false,
    percentage: null,
    charging: false,
    plugged_in: false,
    power_source: null,
  },
  network: {
    connected: false,
    interface_name: null,
    connection_type: null,
    signal_strength: null,
  },
  cpu: null,
  memory: null,
  muted: false,
  volume: 1.0,
  uptime_seconds: null,
  hostname: null,
  operating_system: "Unknown",
  platform: "unknown",
};

export const initialSystemDomainState: SystemDomainState = {
  system: defaultSystemState,
  capabilities: null,
  isLoading: false,
  error: null,
};

export const systemStore = createDomainStore<SystemDomainState>(initialSystemDomainState);

export const useSystemState = systemStore.useStore;

/**
 * On-demand manual or event-driven refresh of system telemetry (zero continuous polling)
 */
export async function refreshSystemState(): Promise<void> {
  try {
    const state = await bbqCommands.systemGetState();
    if (state) {
      systemStore.setState({ system: state });
    }
  } catch (err) {
    console.error("Failed to refresh system state:", err);
  }
}

export function setSystemState(system: SystemState): void {
  systemStore.setState({ system, isLoading: false, error: null });
}

export function setSystemCapabilities(capabilities: SystemCapabilities): void {
  systemStore.setState({ capabilities });
}

export function setSystemLoading(isLoading: boolean): void {
  systemStore.setState({ isLoading });
}

export function setSystemError(error: string | null): void {
  systemStore.setState({ error, isLoading: false });
}

/**
 * Initializes system store with on-demand initial read and event subscription
 */
export async function initializeSystemStore(): Promise<() => void> {
  systemStore.setState({ isLoading: true });

  try {
    const [state, capabilities] = await Promise.all([
      bbqCommands.systemGetState(),
      bbqCommands.systemGetCapabilities(),
    ]);

    if (state) {
      systemStore.setState({ system: state });
    }
    if (capabilities) {
      systemStore.setState({ capabilities });
    }
  } catch (err) {
    console.error("Failed to initialize system state:", err);
  } finally {
    systemStore.setState({ isLoading: false });
  }

  const unlisten = await subscribeToSystemChanged((updatedState) => {
    systemStore.setState({ system: updatedState });
  });

  return unlisten;
}
