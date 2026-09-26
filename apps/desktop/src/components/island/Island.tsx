import React, { useEffect, useCallback, useRef } from "react";
import { useIslandState, islandStore } from "../../island/islandState.ts";
import { islandRuntime } from "../../island/IslandRuntime.ts";
import { useMediaState, initializeMediaStore } from "../../state/mediaState.ts";
import { initializeClipboardStore } from "../../state/clipboardState.ts";
import { initializeFileStore } from "../../state/fileState.ts";
import { initializeSystemStore } from "../../state/systemState.ts";
import { initializeTimerStore } from "../../state/timerState.ts";
import { initHotkeyStore } from "../../state/hotkeyState.ts";
import { setDragOver, inspectDrop } from "../../state/dropState.ts";
import {
  subscribeToIslandMode,
  subscribeToHotkeyTriggered,
  subscribeToOpenSettings,
  subscribeToWindowBlur,
  subscribeToShowIsland,
} from "../../ipc/events.ts";
import { setActiveWidget } from "../../island/islandState.ts";
import { widgetRegistry } from "../../island/widgetRegistry.ts";
import { IslandShell } from "./IslandShell.tsx";
import { IslandContent } from "./IslandContent.tsx";
import { ContextMenu } from "../common/ContextMenu.tsx";

export const Island: React.FC = () => {
  const { state, mode, activeWidgetId, isDragOver } = useIslandState();
  const { currentSession } = useMediaState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenuPos, setContextMenuPos] = React.useState<{ x: number; y: number } | null>(null);

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

  // Keyboard navigation: Escape collapses, Tab navigates
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        islandRuntime.handleEvent({ type: "USER_ESCAPE" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      const path = e.composedPath ? e.composedPath() : [];
      const isInside = shell.contains(e.target as Node) || path.includes(shell);
      if (!isInside) {
        islandRuntime.handleEvent({ type: "CLICK_OUTSIDE" });
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [state]);

  const handleToggle = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (state !== "Expanded") {
      await islandRuntime.handleEvent({ type: "USER_CLICK" });
    }
  }, [state]);

  const handleShellKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      if (state !== "Expanded") {
        e.preventDefault();
        await islandRuntime.handleEvent({ type: "USER_CLICK" });
      }
    }
  }, [state]);

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      id="bbq-island-container"
      ref={containerRef}
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
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </div>
  );
};
