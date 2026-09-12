import type { IslandMode } from "@bbq/types";
import {
  islandStore,
  recordIslandEvent,
  setActiveWidget,
  type IslandMachineState,
  type InteractionSource,
} from "./islandState.ts";
import { type IslandEvent } from "./islandEvents.ts";
import { bbqCommands } from "../ipc/commands.ts";

export class IslandRuntime {
  private autoCollapseTimeout: ReturnType<typeof setTimeout> | null = null;
  private hoverDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;

  private isBackendSyncing = false;

  public async init(): Promise<void> {
    try {
      const initialMode = await bbqCommands.getIslandState();
      this.syncFromBackendMode(initialMode);
    } catch {
      // Running in headless or non-tauri test environment
    }
  }

  public destroy(): void {
    this.clearAllTimers();
  }

  private clearAllTimers(): void {
    if (this.autoCollapseTimeout) {
      clearTimeout(this.autoCollapseTimeout);
      this.autoCollapseTimeout = null;
    }
    if (this.hoverDebounceTimeout) {
      clearTimeout(this.hoverDebounceTimeout);
      this.hoverDebounceTimeout = null;
    }
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
      this.transitionTimeout = null;
    }
  }

  private syncFromBackendMode(mode: IslandMode): void {
    let nextMachineState: IslandMachineState = "Idle";
    let isExpanded = false;

    switch (mode) {
      case "EXPANDED":
      case "EXPANDING":
      case "INTERACTING":
        nextMachineState = "Expanded";
        isExpanded = true;
        break;
      case "ACTIVE":
        nextMachineState = "Hovering";
        break;
      case "IDLE":
      case "COLLAPSING":
      default:
        nextMachineState = "Idle";
        break;
    }

    islandStore.setState({
      mode,
      state: nextMachineState,
      expanded: isExpanded,
    });
  }

  private async notifyBackendMode(mode: IslandMode): Promise<void> {
    if (this.isBackendSyncing) return;
    if (
      typeof window === "undefined" ||
      !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ) {
      return;
    }
    this.isBackendSyncing = true;
    try {
      await bbqCommands.setIslandMode(mode);
    } catch {
      // Non-tauri or mock environment
    } finally {
      this.isBackendSyncing = false;
    }
  }

  public async transitionTo(
    nextState: IslandMachineState,
    interaction: InteractionSource = "none"
  ): Promise<void> {
    const prev = islandStore.getState();
    if (prev.state === nextState && prev.interaction === interaction) {
      return;
    }

    let nextMode: IslandMode = "IDLE";
    let isExpanded = false;
    let isHovered = prev.isHovered;
    let isDragOver = prev.isDragOver;

    switch (nextState) {
      case "Idle":
        nextMode = "IDLE";
        isExpanded = false;
        isHovered = false;
        isDragOver = false;
        break;
      case "Hovering":
        nextMode = "ACTIVE";
        isExpanded = false;
        isHovered = true;
        isDragOver = false;
        break;
      case "Expanded":
        nextMode = "EXPANDED";
        isExpanded = true;
        isDragOver = false;
        break;
      case "DraggingOver":
        nextMode = "ACTIVE";
        isExpanded = false;
        isDragOver = true;
        break;
      case "Transitioning":
        nextMode = prev.mode;
        isExpanded = prev.expanded;
        break;
    }

    islandStore.setState({
      state: nextState,
      mode: nextMode,
      expanded: isExpanded,
      isHovered,
      isDragOver,
      interaction,
    });

    recordIslandEvent(`Transition: ${prev.state} -> ${nextState} (${interaction})`);

    // Synchronize window bounds/mode with backend
    await this.notifyBackendMode(nextMode);
  }

  public async handleEvent(event: IslandEvent): Promise<void> {
    const current = islandStore.getState();

    switch (event.type) {
      case "USER_HOVER": {
        if (this.hoverDebounceTimeout) {
          clearTimeout(this.hoverDebounceTimeout);
          this.hoverDebounceTimeout = null;
        }
        if (this.autoCollapseTimeout) {
          clearTimeout(this.autoCollapseTimeout);
          this.autoCollapseTimeout = null;
        }

        if (current.state === "Idle") {
          await this.transitionTo("Hovering", "mouse");
        }
        break;
      }

      case "USER_UNHOVER": {
        if (current.state === "Hovering") {
          this.hoverDebounceTimeout = setTimeout(async () => {
            await this.transitionTo("Idle", "mouse");
          }, 150);
        } else if (current.state === "Expanded") {
          // Discrete auto-collapse timeout after 6 seconds of mouse absence
          if (this.autoCollapseTimeout) {
            clearTimeout(this.autoCollapseTimeout);
          }
          this.autoCollapseTimeout = setTimeout(async () => {
            const freshState = islandStore.getState();
            if (freshState.state === "Expanded" && !freshState.isHovered) {
              await this.transitionTo("Idle", "mouse");
            }
          }, 6000);
        }
        break;
      }

      case "USER_CLICK": {
        if (this.autoCollapseTimeout) {
          clearTimeout(this.autoCollapseTimeout);
          this.autoCollapseTimeout = null;
        }

        if (current.state === "Expanded") {
          await this.transitionTo("Hovering", "mouse");
        } else {
          await this.transitionTo("Expanded", "mouse");
        }
        break;
      }

      case "USER_ESCAPE": {
        this.clearAllTimers();
        if (current.state === "Expanded") {
          await this.transitionTo("Hovering", "keyboard");
        } else if (current.state === "Hovering" || current.state === "DraggingOver") {
          await this.transitionTo("Idle", "keyboard");
        }
        break;
      }

      case "CLICK_OUTSIDE": {
        if (current.state === "Expanded") {
          this.clearAllTimers();
          await this.transitionTo("Idle", "mouse");
        }
        break;
      }

      case "DRAG_ENTER": {
        this.clearAllTimers();
        if (current.state !== "Expanded") {
          await this.transitionTo("DraggingOver", "drag");
        } else {
          islandStore.setState({ isDragOver: true, interaction: "drag" });
        }
        break;
      }

      case "DRAG_LEAVE": {
        islandStore.setState({ isDragOver: false });
        if (current.state === "DraggingOver") {
          await this.transitionTo("Idle", "drag");
        }
        break;
      }

      case "DROP": {
        islandStore.setState({ isDragOver: false });
        setActiveWidget("drop", true);
        await this.transitionTo("Expanded", "drag");
        break;
      }

      case "WIDGET_SELECT": {
        if (this.autoCollapseTimeout) {
          clearTimeout(this.autoCollapseTimeout);
          this.autoCollapseTimeout = null;
        }
        setActiveWidget(event.widgetId, true);
        break;
      }

      case "MEDIA_EVENT": {
        // Only wake media widget if user hasn't explicitly locked another tab
        if (!current.userLockedWidget && event.isPlaying) {
          setActiveWidget("media", false);
        }
        break;
      }

      case "CLIPBOARD_EVENT": {
        // If idle, make clipboard available
        if (!current.userLockedWidget && current.state === "Idle") {
          setActiveWidget("clipboard", false);
        }
        break;
      }

      case "FILE_EVENT": {
        if (!current.userLockedWidget && event.fileCount > 0 && current.state === "Idle") {
          setActiveWidget("files", false);
        }
        break;
      }

      case "HOTKEY_TRIGGER": {
        await this.handleHotkeyTriggered();
        break;
      }
    }
  }

  public async handleHotkeyTriggered(): Promise<void> {
    const current = islandStore.getState();
    this.clearAllTimers();

    // Toggle behavior: if already expanded with launcher active, collapse to Idle
    if (current.state === "Expanded" && current.activeWidgetId === "launcher") {
      await this.transitionTo("Idle", "keyboard");
    } else {
      setActiveWidget("launcher", true);
      await this.transitionTo("Expanded", "keyboard");
    }
  }

  public handleReminderUpdated(reminder: import("@bbq/types").Reminder): void {
    const current = islandStore.getState();
    if (!current.userLockedWidget && reminder.state === "Scheduled" && current.state === "Idle") {
      setActiveWidget("reminder", false);
    }
  }
}

export const islandRuntime = new IslandRuntime();
