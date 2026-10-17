import React, { useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useIslandState, islandStore } from "../../island/islandState.ts";
import { islandRuntime } from "../../island/IslandRuntime.ts";
import { useMediaState, initializeMediaStore } from "../../state/mediaState.ts";
import { initializeClipboardStore } from "../../state/clipboardState.ts";
import { initializeFileStore } from "../../state/fileState.ts";
import { initializeSystemStore } from "../../state/systemState.ts";
import { initializeTimerStore } from "../../state/timerState.ts";
import { initializeLauncherStore } from "../../state/launcherState.ts";
import { initializeDropStore } from "../../state/dropState.ts";
import { initializeReminderStore } from "../../state/reminderState.ts";
import { initHotkeyStore } from "../../state/hotkeyState.ts";
import { setDragOver, inspectDrop } from "../../state/dropState.ts";
import { settingsStore, useSettingsState, updateSetting } from "../../state/settingsState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import {
  subscribeToIslandMode,
  subscribeToHotkeyTriggered,
  subscribeToOpenSettings,
  subscribeToWindowBlur,
  subscribeToShowIsland,
} from "../../ipc/events.ts";
import { setActiveWidget } from "../../island/islandState.ts";
import { widgetRegistry } from "../../island/widgetRegistry.ts";
import { escapeManager, EscapePriority } from "../../island/escapeManager.ts";
import { getOrderedActiveWidgets } from "../../island/compactOrder.ts";
import { handleHudKeyboardNavigation } from "../../island/keyboardNavigation.ts";
import { IslandShell } from "./IslandShell.tsx";
import { IslandContent } from "./IslandContent.tsx";
import { ContextMenu } from "../common/ContextMenu.tsx";

export const Island: React.FC = () => {
  const { state, mode, activeWidgetId, isDragOver } = useIslandState();
  const { currentSession } = useMediaState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenuPos, setContextMenuPos] = React.useState<{ x: number; y: number } | null>(null);

  const disabledWidgets = useSettingsState((s) => s.settings.disabled_widgets);
  const compactIndicatorOrder = useSettingsState((s) => s.settings.compact_indicator_order);
  const islandPosition = useSettingsState((s) => s.settings.island_position || "top-center");
  const moveHud = useSettingsState((s) => s.settings.move_hud ?? false);

  const activeWidgets = React.useMemo(() => {
    return getOrderedActiveWidgets(
      widgetRegistry.getActiveWidgets(),
      compactIndicatorOrder,
      disabledWidgets
    );
  }, [compactIndicatorOrder, disabledWidgets]);

  const activeWidget = activeWidgetId ? widgetRegistry.get(activeWidgetId) : undefined;
  const sizing = activeWidget?.sizing;

  const hasMedia = Boolean(
    currentSession &&
      currentSession.state !== "stopped" &&
      (currentSession.title || currentSession.artist)
  );

  useEffect(() => {
    let isMounted = true;
    const cleanupFns: Array<() => void> = [];

    const registerCleanup = (fn: () => void) => {
      if (!isMounted) {
        fn();
      } else {
        cleanupFns.push(fn);
      }
    };

    (async () => {
      await islandRuntime.init();
      if (!isMounted) return;

      const unlistenIsland = await subscribeToIslandMode((newMode) => {
        if (newMode === "EXPANDED") {
          islandRuntime.transitionTo("Expanded", "event");
        } else if (newMode === "ACTIVE") {
          islandRuntime.transitionTo("Hovering", "event");
        } else if (newMode === "IDLE") {
          islandRuntime.transitionTo("Idle", "event");
        }
      });
      registerCleanup(unlistenIsland);

      registerCleanup(await initializeMediaStore());
      registerCleanup(await initializeClipboardStore());
      registerCleanup(await initializeFileStore());
      registerCleanup(await initializeSystemStore());
      registerCleanup(await initializeTimerStore());
      registerCleanup(await initializeLauncherStore());
      registerCleanup(await initializeDropStore());
      registerCleanup(await initializeReminderStore());
      registerCleanup(await initHotkeyStore());

      registerCleanup(
        await subscribeToHotkeyTriggered(async () => {
          await islandRuntime.handleHotkeyTriggered();
        })
      );
      registerCleanup(
        await subscribeToOpenSettings(async () => {
          setActiveWidget("settings");
          await islandRuntime.transitionTo("Expanded", "none");
        })
      );
      registerCleanup(
        await subscribeToWindowBlur(async () => {
          if (islandStore.getState().state === "Expanded") {
            await islandRuntime.handleEvent({ type: "CLICK_OUTSIDE" });
          }
        })
      );
      registerCleanup(
        await subscribeToShowIsland(async () => {
          await islandRuntime.transitionTo("Expanded", "none");
        })
      );
    })();

    return () => {
      isMounted = false;
      islandRuntime.destroy();
      while (cleanupFns.length > 0) {
        const fn = cleanupFns.pop();
        if (fn) fn();
      }
    };
  }, []);

  // Keyboard navigation: Escape collapses via centralized escapeManager (lowest priority fallback)
  useEffect(() => {
    const unregister = escapeManager.register(() => {
      if (state === "Expanded") {
        islandRuntime.handleEvent({ type: "USER_ESCAPE" });
        return true;
      }
      return false;
    }, EscapePriority.ISLAND_FALLBACK);

    return unregister;
  }, [state]);

  // Window blur detection: collapses when expanded and user clicks outside the OS window
  useEffect(() => {
    if (state !== "Expanded") return;

    const handleWindowBlur = () => {
      islandRuntime.handleEvent({ type: "CLICK_OUTSIDE" });
    };

    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [state]);

  // Click outside detection: collapses when expanded and user clicks transparent margin
  useEffect(() => {
    if (state !== "Expanded") return;

    const handleDocumentClick = (e: MouseEvent) => {
      const shell = document.getElementById("bbq-island-shell");
      if (!shell) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest?.(
          ".bbq-dropdown-menu, .bbq-context-menu, [role='listbox'], #bbq-context-menu"
        )
      ) {
        return;
      }
      const path = e.composedPath ? e.composedPath() : [];
      const isInside = shell.contains(e.target as Node) || path.includes(shell);
      if (!isInside) {
        islandRuntime.handleEvent({ type: "CLICK_OUTSIDE" });
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [state]);

  const isPlacementDraggingRef = useRef(false);
  const justDisarmedMoveHudRef = useRef(false);
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending disarm timer on unmount
  useEffect(() => {
    return () => {
      if (disarmTimerRef.current) {
        clearTimeout(disarmTimerRef.current);
      }
    };
  }, []);

  // One-shot Move HUD pointerup listener to finish placement drag
  useEffect(() => {
    if (!moveHud) return;
    const handlePointerUp = () => {
      if (isPlacementDraggingRef.current) {
        isPlacementDraggingRef.current = false;
        justDisarmedMoveHudRef.current = true;
        void updateSetting("move_hud", "false");
        if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current);
        disarmTimerRef.current = setTimeout(() => {
          justDisarmedMoveHudRef.current = false;
          disarmTimerRef.current = null;
        }, 300);
      }
    };
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [moveHud]);

  // One-shot Move HUD escape coordinator
  useEffect(() => {
    if (!moveHud) return;
    const unregister = escapeManager.register(() => {
      isPlacementDraggingRef.current = false;
      justDisarmedMoveHudRef.current = true;
      void updateSetting("move_hud", "false");
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current);
      disarmTimerRef.current = setTimeout(() => {
        justDisarmedMoveHudRef.current = false;
        disarmTimerRef.current = null;
      }, 250);
      return true;
    }, EscapePriority.CHILD_INTERACTION);
    return unregister;
  }, [moveHud]);

  const handleToggle = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Suppress immediate click resulting from drag release
    if (justDisarmedMoveHudRef.current) {
      return;
    }
    if (moveHud) {
      await updateSetting("move_hud", "false");
      return;
    }
    if (state !== "Expanded") {
      await islandRuntime.handleEvent({ type: "USER_CLICK" });
    }
  }, [state, moveHud]);

  const handleShellKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      if (justDisarmedMoveHudRef.current) {
        e.preventDefault();
        return;
      }
      if (moveHud) {
        e.preventDefault();
        await updateSetting("move_hud", "false");
        return;
      }
      if (state !== "Expanded") {
        e.preventDefault();
        await islandRuntime.handleEvent({ type: "USER_CLICK" });
      }
    }
  }, [state, moveHud]);

  const handlePointerDown = useCallback(async (e: React.PointerEvent) => {
    // If Move HUD is active and user right-clicks: return island to original position
    if (moveHud && e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      await bbqCommands.resetIslandPosition();
      await updateSetting("move_hud", "false");
      return;
    }

    // Only primary mouse button (left click)
    if (e.button !== 0) return;
    // Only if Move HUD is enabled
    if (!moveHud) return;

    // Guard: ignore clicks on interactive elements (buttons, inputs, tabs, dropdowns)
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest(
        "button, input, select, textarea, a, [role='button'], [role='menuitem'], [role='tab'], [role='checkbox'], [contenteditable='true'], .bbq-interactive, .bbq-tab, .bbq-btn, .bbq-context-menu"
      )
    ) {
      return;
    }

    isPlacementDraggingRef.current = true;

    try {
      await bbqCommands.setCustomDragPosition(true);
      getCurrentWindow().startDragging();
    } catch {
      // Non-Tauri fallback
    }
  }, [moveHud]);

  const handleMouseEnter = useCallback(async () => {
    await islandRuntime.handleEvent({ type: "USER_HOVER" });
  }, []);

  const handleMouseLeave = useCallback(async () => {
    await islandRuntime.handleEvent({ type: "USER_UNHOVER" });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
    await islandRuntime.handleEvent({ type: "DRAG_ENTER" });
  }, []);

  const handleDragLeave = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
      await islandRuntime.handleEvent({ type: "DRAG_LEAVE" });
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const paths: string[] = [];
    if (e.dataTransfer && e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        const filePath = (file as unknown as { path?: string }).path;
        if (filePath) {
          paths.push(filePath);
        }
      }
    }

    if (paths.length > 0) {
      await inspectDrop(paths);
    }

    await islandRuntime.handleEvent({ type: "DROP", paths });
  }, []);

  const handleSelectWidget = useCallback(async (widgetId: string) => {
    await islandRuntime.handleEvent({ type: "WIDGET_SELECT", widgetId });
  }, []);

  const handleCollapse = useCallback(async () => {
    await islandRuntime.handleEvent({ type: "USER_ESCAPE" });
  }, []);

  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (moveHud || justDisarmedMoveHudRef.current) {
      await bbqCommands.resetIslandPosition();
      if (moveHud) {
        await updateSetting("move_hud", "false");
      }
      return;
    }

    setContextMenuPos({ x: e.clientX, y: e.clientY });

    const liveState = islandStore.getState().state;
    if (liveState !== "Expanded") {
      const currentSettings = settingsStore.getState().settings;
      const targetW = Math.max(currentSettings.island_width, 380);
      const targetH = Math.max(currentSettings.island_height, 44) + 340;
      await bbqCommands.resizeIsland("hovering", {
        compactWidth: targetW,
        compactHeight: targetH,
        preferredWidth: targetW,
        preferredHeight: targetH,
      });
    }
  }, []);

  const handleContextMenuClose = useCallback(async () => {
    setContextMenuPos(null);
    const liveState = islandStore.getState().state;
    if (liveState !== "Expanded") {
      const currentSettings = settingsStore.getState().settings;
      await bbqCommands.resizeIsland(
        liveState === "Hovering" ? "hovering" : "idle",
        {
          compactWidth: currentSettings.island_width,
          compactHeight: currentSettings.island_height,
          preferredWidth: currentSettings.island_width,
          preferredHeight: currentSettings.island_height,
        }
      );
    }
  }, []);

  // Fast keyboard navigation between HUD tabs while expanded
  useEffect(() => {
    if (state !== "Expanded") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      handleHudKeyboardNavigation({
        event: e,
        currentWidgetId: activeWidgetId,
        activeWidgets,
        onSelectWidget: (widgetId: string) => {
          handleSelectWidget(widgetId);
        },
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, activeWidgetId, activeWidgets, handleSelectWidget]);

  return (
    <div
      id="bbq-island-container"
      ref={containerRef}
      data-anchor={islandPosition}
      className="bbq-island-container"
      onContextMenu={handleContextMenu}
    >
      <IslandShell
        state={state}
        mode={mode}
        hasMedia={hasMedia}
        isDragOver={isDragOver}
        sizing={sizing}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleToggle}
        onKeyDown={handleShellKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        moveHud={moveHud}
        onPointerDown={handlePointerDown}
      >
        <IslandContent
          state={state}
          mode={mode}
          activeWidgetId={activeWidgetId}
          onSelectWidget={handleSelectWidget}
          onCollapse={handleCollapse}
        />
      </IslandShell>
      {contextMenuPos && (
        <ContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  );
};
