import { createDomainStore } from "./createStore.ts";
import type {
  DropAction,
  DropActionResult,
  DropBatch,
} from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToDropChanged } from "../ipc/events.ts";

export type DropStatus =
  | "idle"
  | "dragging"
  | "inspecting"
  | "ready"
  | "executing"
  | "completed"
  | "error";

export interface DropDomainState {
  isDraggingOver: boolean;
  isDraggingOut: boolean;
  currentBatch: DropBatch | null;
  actions: DropAction[];
  selectedActionIndex: number;
  status: DropStatus;
  error: string | null;
  resultMessage: string | null;
}

export const initialDropDomainState: DropDomainState = {
  isDraggingOver: false,
  isDraggingOut: false,
  currentBatch: null,
  actions: [],
  selectedActionIndex: 0,
  status: "idle",
  error: null,
  resultMessage: null,
};

export const dropStore = createDomainStore<DropDomainState>(
  initialDropDomainState
);

export const useDropState = dropStore.useStore;

export function setDragOver(isDraggingOver: boolean): void {
  dropStore.setState((prev) => ({
    isDraggingOver,
    status: isDraggingOver
      ? "dragging"
      : prev.currentBatch
        ? "ready"
        : "idle",
  }));
}

export function cleanupDragOut(): void {
  const current = dropStore.getState();
  if (current.isDraggingOut || current.status === "executing") {
    const isCompletedOrError = current.status === "completed" || current.status === "error";
    dropStore.setState({
      isDraggingOut: false,
      status: isCompletedOrError
        ? current.status
        : current.currentBatch
          ? "ready"
          : "idle",
    });
  }
}

export function setSelectedActionIndex(selectedActionIndex: number): void {
  dropStore.setState({ selectedActionIndex });
}

export function clearDrop(): void {
  cleanupDragOut();
  dropStore.setState(initialDropDomainState);
  bbqCommands.dropClear().catch(console.error);
}

export async function inspectDrop(paths: string[]): Promise<DropBatch | null> {
  if (!paths || paths.length === 0) return null;

  dropStore.setState({
    status: "inspecting",
    isDraggingOver: false,
    error: null,
    resultMessage: null,
  });

  try {
    const batch = await bbqCommands.dropInspect(paths);
    if (!batch) {
      dropStore.setState({
        status: "error",
        error: "Failed to inspect dropped items",
      });
      return null;
    }

    const actions = await bbqCommands.dropGetActions(batch.id);

    dropStore.setState({
      currentBatch: batch,
      actions,
      selectedActionIndex: 0,
      status: "ready",
      error: null,
    });

    return batch;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dropStore.setState({
      status: "error",
      error: msg,
    });
    return null;
  }
}

export async function executeDropAction(
  action: DropAction,
  targetId?: string
): Promise<DropActionResult | null> {
  const { currentBatch } = dropStore.getState();
  if (!currentBatch) return null;

  const isDragOut = action === "drag_out";
  dropStore.setState({
    status: "executing",
    isDraggingOut: isDragOut,
    error: null,
  });

  // Comprehensive Drag-out Lifecycle Cleanup (release, blur, escape, completion)
  let cleanedUp = false;
  const cleanupListeners = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerup", cleanupListeners);
      window.removeEventListener("mouseup", cleanupListeners);
      window.removeEventListener("blur", cleanupListeners);
      window.removeEventListener("pointercancel", cleanupListeners);
      window.removeEventListener("dragend", cleanupListeners);
      window.removeEventListener("keydown", handleDragEscape);
    }
    cleanupDragOut();
  };

  const handleDragEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cleanupListeners();
    }
  };

  if (isDragOut && typeof window !== "undefined") {
    window.addEventListener("pointerup", cleanupListeners, { once: true });
    window.addEventListener("mouseup", cleanupListeners, { once: true });
    window.addEventListener("blur", cleanupListeners, { once: true });
    window.addEventListener("pointercancel", cleanupListeners, { once: true });
    window.addEventListener("dragend", cleanupListeners, { once: true });
    window.addEventListener("keydown", handleDragEscape, { once: true });
  }

  try {
    const result = await bbqCommands.dropExecute(
      currentBatch.id,
      action,
      targetId
    );

    if (result) {
      dropStore.setState({
        status: result.failure_count === 0 ? "completed" : "error",
        resultMessage: result.message,
        error: result.failure_count > 0 ? result.message : null,
      });
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dropStore.setState({
      status: "error",
      error: msg,
    });
    return null;
  } finally {
    cleanupListeners();
  }
}

export function formatDropSize(bytes: number): string {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(1)} GB`;
  } else if (bytes >= MB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  } else if (bytes >= KB) {
    return `${(bytes / KB).toFixed(1)} KB`;
  } else {
    return `${bytes} B`;
  }
}

// Subscribe to backend drop events
if (typeof window !== "undefined") {
  subscribeToDropChanged((eventData) => {
    if (typeof eventData === "object" && eventData !== null) {
      const data = eventData as {
        type?: string;
        batch?: DropBatch;
        result?: DropActionResult;
      };

      if (data.type === "inspected" && data.batch) {
        bbqCommands.dropGetActions(data.batch.id).then((actions) => {
          dropStore.setState({
            currentBatch: data.batch ?? null,
            actions,
            selectedActionIndex: 0,
            status: "ready",
            isDraggingOver: false,
            error: null,
          });
        }).catch(console.error);
      } else if (data.type === "action_executed" && data.result) {
        dropStore.setState({
          status: data.result.failure_count === 0 ? "completed" : "error",
          resultMessage: data.result.message,
        });
      }
    }
  }).catch((err) => {
    console.error("Failed to subscribe to drop changes:", err);
  });
}
