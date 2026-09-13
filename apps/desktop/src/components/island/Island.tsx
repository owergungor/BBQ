import React, { useEffect, useCallback, useRef } from "react";
import { useIslandState } from "../../island/islandState.ts";
import { islandRuntime } from "../../island/IslandRuntime.ts";
import { useMediaState, initializeMediaStore } from "../../state/mediaState.ts";
import { initializeClipboardStore } from "../../state/clipboardState.ts";
import { initializeFileStore } from "../../state/fileState.ts";
import { initializeSystemStore } from "../../state/systemState.ts";
import { initHotkeyStore } from "../../state/hotkeyState.ts";
import { setDragOver, inspectDrop } from "../../state/dropState.ts";
import { subscribeToIslandMode, subscribeToHotkeyTriggered } from "../../ipc/events.ts";
import { IslandShell } from "./IslandShell.tsx";
import { IslandContent } from "./IslandContent.tsx";

export const Island: React.FC = () => {
  const { state, mode, activeWidgetId, isDragOver } = useIslandState();
  const { currentSession } = useMediaState();
  const containerRef = useRef<HTMLDivElement>(null);

  const hasMedia = Boolean(
    currentSession &&
      currentSession.state !== "stopped" &&
      (currentSession.title || currentSession.artist)
  );

  useEffect(() => {
    let unlistenIsland: (() => void) | undefined;
    let unlistenMedia: (() => void) | undefined;
    let unlistenClipboard: (() => void) | undefined;
    let unlistenFiles: (() => void) | undefined;
    let unlistenSystem: (() => void) | undefined;
    let unlistenHotkey: (() => void) | undefined;
    let unlistenHotkeyTrigger: (() => void) | undefined;

    (async () => {
      await islandRuntime.init();

      unlistenIsland = await subscribeToIslandMode((newMode) => {
        if (newMode === "EXPANDED") {
          islandRuntime.transitionTo("Expanded", "event");
        } else if (newMode === "ACTIVE") {
          islandRuntime.transitionTo("Hovering", "event");
        } else if (newMode === "IDLE") {
          islandRuntime.transitionTo("Idle", "event");
        }
      });

      unlistenMedia = await initializeMediaStore();
      unlistenClipboard = await initializeClipboardStore();
      unlistenFiles = await initializeFileStore();
      unlistenSystem = await initializeSystemStore();
      unlistenHotkey = await initHotkeyStore();
      unlistenHotkeyTrigger = await subscribeToHotkeyTriggered(async () => {
        await islandRuntime.handleHotkeyTriggered();
      });
    })();

    return () => {
      islandRuntime.destroy();
      if (unlistenIsland) unlistenIsland();
      if (unlistenMedia) unlistenMedia();
      if (unlistenClipboard) unlistenClipboard();
      if (unlistenFiles) unlistenFiles();
      if (unlistenSystem) unlistenSystem();
      if (unlistenHotkey) unlistenHotkey();
      if (unlistenHotkeyTrigger) unlistenHotkeyTrigger();
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

  // Click outside detection: collapses when expanded
  useEffect(() => {
    if (state !== "Expanded") return;

    const handleDocumentClick = (e: MouseEvent) => {
      const shell = document.getElementById("bbq-island-shell");
      if (shell && !shell.contains(e.target as Node)) {
        islandRuntime.handleEvent({ type: "CLICK_OUTSIDE" });
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [state]);

  const handleToggle = useCallback(async () => {
    await islandRuntime.handleEvent({ type: "USER_CLICK" });
  }, []);

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

  return (
    <div
      id="bbq-island-container"
      ref={containerRef}
      className="bbq-island-container"
    >
      <IslandShell
        state={state}
        mode={mode}
        hasMedia={hasMedia}
        isDragOver={isDragOver}
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
    </div>
  );
};
