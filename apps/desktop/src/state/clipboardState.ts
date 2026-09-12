import { createDomainStore } from "./createStore.ts";
import type { ClipboardEntry, ClipboardStatus } from "@bbq/types";

export interface ClipboardState {
  enabled: boolean;
  entries: ClipboardEntry[];
  status: ClipboardStatus | null;
  activeWidget: boolean;
}

export const clipboardStore = createDomainStore<ClipboardState>({
  enabled: false,
  entries: [],
  status: null,
  activeWidget: false,
});

export const useClipboardState = clipboardStore.useStore;

import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToClipboardChanged } from "../ipc/events.ts";

export async function initializeClipboardStore(): Promise<() => void> {
  const status = await bbqCommands.clipboardGetStatus();
  if (status) {
    clipboardStore.setState({
      enabled: status.enabled,
      status,
    });
    if (status.enabled) {
      const entries = await bbqCommands.clipboardGetHistory();
      clipboardStore.setState({ entries });
    }
  }

  const unlisten = await subscribeToClipboardChanged((entry) => {
    clipboardStore.setState((prev) => {
      const filtered = prev.entries.filter((e) => e.id !== entry.id);
      return {
        entries: [entry, ...filtered],
        status: prev.status
          ? {
              ...prev.status,
              total_entries: Math.min(
                prev.status.total_entries + 1,
                prev.status.max_entries
              ),
            }
          : null,
      };
    });
  });

  return unlisten;
}
