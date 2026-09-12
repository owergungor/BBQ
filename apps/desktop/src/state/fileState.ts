import type { FileEntry } from "@bbq/types";
import { createDomainStore } from "./createStore.ts";
import { bbqCommands } from "../ipc/commands.ts";
import {
  subscribeToFileAdded,
  subscribeToFileRemoved,
  subscribeToFileWorkspaceChanged,
} from "../ipc/events.ts";

export interface FileWorkspaceState {
  entries: FileEntry[];
  isDragOver: boolean;
  activeWidget: boolean;
  isLoading: boolean;
}

export const fileStore = createDomainStore<FileWorkspaceState>({
  entries: [],
  isDragOver: false,
  activeWidget: false,
  isLoading: false,
});

export const useFileState = fileStore.useStore;

export async function initializeFileStore(): Promise<() => void> {
  fileStore.setState({ isLoading: true });
  const entries = await bbqCommands.fileGetWorkspace();
  fileStore.setState({ entries, isLoading: false });

  const unlistenAdded = await subscribeToFileAdded((newEntry) => {
    const current = fileStore.getState().entries;
    const filtered = current.filter((e) => e.id !== newEntry.id && e.path !== newEntry.path);
    fileStore.setState({ entries: [newEntry, ...filtered] });
  });

  const unlistenRemoved = await subscribeToFileRemoved((removedId) => {
    const current = fileStore.getState().entries;
    fileStore.setState({
      entries: current.filter((e) => e.id !== removedId),
    });
  });

  const unlistenChanged = await subscribeToFileWorkspaceChanged((allEntries) => {
    fileStore.setState({ entries: allEntries });
  });

  return () => {
    unlistenAdded();
    unlistenRemoved();
    unlistenChanged();
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}
