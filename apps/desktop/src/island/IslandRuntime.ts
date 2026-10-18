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
  private focusRestoreTimeout: ReturnType<typeof setTimeout> | null = null;
  private boundFocusOutListener: (() => void) | null = null;

  /**
   * Checks whether an interactive control has focus or a modal/menu overlay is open.
   * Auto-collapse must be suppressed whenever user interaction is in progress.
   */
  public isFocusOrOverlayActive(): boolean {
    if (typeof document === "undefined") return false;

    const activeEl = document.activeElement;
    if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
      const tagName = activeEl.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return true;
      }
      const role = activeEl.getAttribute?.("role");
      if (
        role === "textbox" ||
        role === "searchbox" ||
        role === "combobox" ||
        role === "spinbutton"
      ) {
        return true;
      }
      if (
        (activeEl as HTMLElement).isContentEditable ||
        activeEl.getAttribute?.("contenteditable") === "true" ||
        activeEl.getAttribute?.("data-hotkey-recording") === "true"
      ) {
        return true;
      }
    }

    const openOverlay = document.querySelector?.(
      '.bbq-context-menu, .bbq-dropdown-menu:not([hidden]), [role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"], .bbq-modal-backdrop, .bbq-confirmation-dialog, [data-menu-open="true"]'
    );
    if (openOverlay) {
      return true;
    }

    return false;
  }

  public async init(): Promise<void> {
    try {
      const initialMode = await bbqCommands.getIslandState();
      this.syncFromBackendMode(initialMode);
    } catch {
      // Running in headless or non-tauri test environment
    }

    if (typeof document !== "undefined" && !this.boundFocusOutListener) {
      this.boundFocusOutListener = () => this.handleFocusOut();
      document.addEventListener("focusout", this.boundFocusOutListener);
    }
  }

  public destroy(): void {
    this.clearAllTimers();
    if (typeof document !== "undefined" && this.boundFocusOutListener) {
      document.removeEventListener("focusout", this.boundFocusOutListener);
      this.boundFocusOutListener = null;
    }
  }

  public clearAllTimers(): void {
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
    if (this.focusRestoreTimeout) {
      clearTimeout(this.focusRestoreTimeout);
      this.focusRestoreTimeout = null;
    }
  }

  public scheduleAutoCollapse(delay = 6000): void {
    if (this.autoCollapseTimeout) {
      clearTimeout(this.autoCollapseTimeout);
    }
    this.autoCollapseTimeout = setTimeout(async () => {
      this.autoCollapseTimeout = null;
      const freshState = islandStore.getState();
      if (
        freshState.state === "Expanded" &&
        !freshState.isHovered &&
        !this.isFocusOrOverlayActive()
      ) {
        await this.transitionTo("Idle", "mouse");
      }
    }, delay);
  }

  public handleFocusOut(): void {
    if (this.focusRestoreTimeout) {
      clearTimeout(this.focusRestoreTimeout);
    }
    this.focusRestoreTimeout = setTimeout(() => {
      this.focusRestoreTimeout = null;
      const fresh = islandStore.getState();
      if (fresh.state === "Expanded" && !fresh.isHovered && !this.isFocusOrOverlayActive()) {
        this.scheduleAutoCollapse(6000);
      }
    }, 50);
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
    if (prev.state === nextState) {
      return;
    }

    if (nextState !== "Expanded") {
      this.clearAllTimers();
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

    // Synchronize window bounds/mode with backend only if not triggered by an incoming backend event
    if (interaction !== "event") {
      await this.notifyBackendMode(nextMode);
    }
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
        if (this.focusRestoreTimeout) {
          clearTimeout(this.focusRestoreTimeout);
          this.focusRestoreTimeout = null;
        }

        if (current.state === "Idle") {
          await this.transitionTo("Hovering", "mouse");
        }
        break;
      }

      case "USER_UNHOVER": {
        if (current.state === "Hovering") {
          this.hoverDebounceTimeout = setTimeout(async () => {
            const freshState = islandStore.getState();
            if (freshState.state === "Hovering") {
              await this.transitionTo("Idle", "mouse");
            }
          }, 150);
        } else if (current.state === "Expanded") {
          this.scheduleAutoCollapse(6000);
        }
        break;
      }

      case "USER_CLICK": {
        this.clearAllTimers();

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
        this.clearAllTimers();
        islandStore.setState({ isDragOver: false });
        setActiveWidget("drop", true);
        await this.transitionTo("Expanded", "drag");
        break;
      }

      case "WIDGET_SELECT": {
        this.clearAllTimers();
        setActiveWidget(event.widgetId, true);
        if (!current.isHovered) {
          this.scheduleAutoCollapse(6000);
        }
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
      if (!current.isHovered) {
        this.scheduleAutoCollapse(6000);
      }
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
