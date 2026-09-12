import React, { useEffect, useCallback } from "react";
import type { IslandMachineState } from "../../island/islandState.ts";
import { useMediaState } from "../../state/mediaState.ts";
import { useSystemState } from "../../state/systemState.ts";
import { useClipboardState } from "../../state/clipboardState.ts";
import { useFileState } from "../../state/fileState.ts";
import { useTimerState } from "../../state/timerState.ts";
import { useReminderState } from "../../state/reminderState.ts";
import { useDropState } from "../../state/dropState.ts";
import { useSettingsState } from "../../state/settingsState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import { formatTimeDisplay } from "../widgets/TimerWidget.tsx";

export function useBatteryDisplay(): string {
  return useSystemState((s) => {
    return s.system.battery.available && s.system.battery.percentage !== null
      ? `${s.system.battery.percentage}%`
      : "100%";
  });
}

export const CompactDropIndicator: React.FC = () => {
  const isDraggingOver = useDropState((s) => s.isDraggingOver);
  const currentBatch = useDropState((s) => s.currentBatch);

  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" style={{ background: "var(--accent, #3b82f6)" }} />
        <span style={{ fontWeight: 600 }}>📥 Drop Zone</span>
        <span className="bbq-media-separator">—</span>
        <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
          {isDraggingOver
            ? "Release to inspect"
            : currentBatch
            ? `${currentBatch.count} items`
            : "Drop files here"}
        </span>
      </div>
    </div>
  );
};

export const CompactFilesIndicator: React.FC = () => {
  const fileEntries = useFileState((s) => s.entries);
  return (
    <div className="bbq-island-file-pill">
      <span className="bbq-file-pill-icon" aria-hidden="true">📄</span>
      <span className="bbq-file-pill-title">
        {fileEntries.length} {fileEntries.length === 1 ? "file" : "files"}
      </span>
      <span className="bbq-media-separator">—</span>
      <span className="bbq-file-name" style={{ maxWidth: "160px" }}>
        {fileEntries[0]?.name}
      </span>
    </div>
  );
};

export const CompactClipboardIndicator: React.FC = () => {
  const clipboardEntries = useClipboardState((s) => s.entries);
  return (
    <div className="bbq-island-clipboard-pill">
      <span className="bbq-clipboard-pill-icon" aria-hidden="true">📋</span>
      <span className="bbq-clipboard-pill-title">Clipboard</span>
      <span className="bbq-media-separator">—</span>
      <span className="bbq-clipboard-pill-preview">
        {clipboardEntries[0]?.preview ?? "Latest item"}
      </span>
    </div>
  );
};

export const CompactMediaIndicator: React.FC = () => {
  const currentSession = useMediaState((s) => s.currentSession);
  if (!currentSession) return null;

  const isPlaying = currentSession.state === "playing";
  const caps = currentSession.capabilities;

  const handleTogglePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaTogglePlayPause();
  };

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaNext();
  };

  const handlePrevious = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaPrevious();
  };

  return (
    <div className="bbq-island-media-pill">
      <div className="bbq-media-art">
        {currentSession.albumArt ? (
          <img
            src={currentSession.albumArt}
            alt="Artwork"
            className="bbq-media-art-img"
          />
        ) : (
          <span className="bbq-media-icon" aria-hidden="true">🎵</span>
        )}
      </div>

      <div
        className="bbq-media-info"
        title={`${currentSession.artist ?? "Unknown Artist"} — ${
          currentSession.title ?? "Unknown Track"
        }`}
      >
        <span className="bbq-media-artist">
          {currentSession.artist ?? "Unknown Artist"}
        </span>
        <span className="bbq-media-separator">—</span>
        <span className="bbq-media-title">
          {currentSession.title ?? "Unknown Track"}
        </span>
      </div>

      <div className="bbq-media-controls">
        {caps.canGoPrevious && (
          <button
            type="button"
            className="bbq-media-ctrl-btn"
            onClick={handlePrevious}
            title="Previous Track"
            aria-label="Previous track"
          >
            ⏮
          </button>
        )}
        {(caps.canPlay || caps.canPause) && (
          <button
            type="button"
            className="bbq-media-ctrl-btn bbq-media-ctrl-primary"
            onClick={handleTogglePlayPause}
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
        )}
        {caps.canGoNext && (
          <button
            type="button"
            className="bbq-media-ctrl-btn"
            onClick={handleNext}
            title="Next Track"
            aria-label="Next track"
          >
            ⏭
          </button>
        )}
      </div>
    </div>
  );
};

export const CompactSystemIndicator: React.FC = () => {
  const system = useSystemState((s) => s.system);
  const batteryText =
    system.battery.available && system.battery.percentage !== null
      ? `${system.battery.percentage}%`
      : "System";
  const netText = system.network.connected
    ? system.network.interface_name ?? "Connected"
    : "Offline";

  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          className="bbq-status-dot"
          style={{
            background: system.network.connected ? "#10b981" : "#f59e0b",
          }}
        />
        <span>{system.battery.available ? `🔋 ${batteryText}` : "⚙️ System"}</span>
        <span className="bbq-media-separator">—</span>
        <span style={{ color: "var(--text-secondary)" }}>{netText}</span>
      </div>
    </div>
  );
};

export const CompactLauncherIndicator: React.FC = () => {
  const batteryDisplay = useBatteryDisplay();
  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" style={{ background: "var(--accent, #3b82f6)" }} />
        <span style={{ fontWeight: 600 }}>⌕ Search</span>
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
        {batteryDisplay}
      </div>
    </div>
  );
};

export const CompactTimerIndicator: React.FC = () => {
  const timerSession = useTimerState((s) => s.session);
  const batteryDisplay = useBatteryDisplay();

  const isTimerRunning = timerSession.state === "Running";
  const getCompactTimerMs = useCallback((): number => {
    const now = Date.now();
    if (timerSession.mode === "Countdown" || timerSession.mode === "Pomodoro") {
      if (timerSession.state === "Running" && timerSession.target_at) {
        return Math.max(0, timerSession.target_at - now);
      }
      return timerSession.remaining_ms ?? timerSession.duration_ms ?? 0;
    } else {
      if (timerSession.state === "Running" && timerSession.started_at) {
        const active = Math.max(0, now - timerSession.started_at);
        return (timerSession.remaining_ms ?? 0) + active;
      }
      return timerSession.remaining_ms ?? 0;
    }
  }, [timerSession]);

  const [compactDisplayMs, setCompactDisplayMs] = React.useState<number>(getCompactTimerMs);

  useEffect(() => {
    setCompactDisplayMs(getCompactTimerMs());
  }, [timerSession, getCompactTimerMs]);

  useEffect(() => {
    if (!isTimerRunning) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const tick = () => {
      if (isCancelled) return;
      setCompactDisplayMs(getCompactTimerMs());
      const now = Date.now();
      const delay = Math.max(50, 1000 - (now % 1000));
      timeoutId = setTimeout(tick, delay);
    };

    tick();
    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isTimerRunning, getCompactTimerMs]);

  const isPomodoro = timerSession.mode === "Pomodoro";
  const timerIcon = isPomodoro ? "🍅" : "⏱";
  const timerText = `${timerIcon} ${formatTimeDisplay(compactDisplayMs)}`;

  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          className="bbq-status-dot"
          style={{
            background: isPomodoro
              ? "#ef4444"
              : isTimerRunning
              ? "#10b981"
              : "var(--accent, #3b82f6)",
          }}
        />
        <span style={{ fontWeight: 600 }}>{timerText}</span>
        <span className="bbq-media-separator">—</span>
        <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
          {isPomodoro
            ? timerSession.pomodoro_phase ?? "Work"
            : timerSession.state}
        </span>
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
        {batteryDisplay}
      </div>
    </div>
  );
};

export const CompactReminderIndicator: React.FC = () => {
  const reminders = useReminderState((s) => s.reminders);
  const batteryDisplay = useBatteryDisplay();
  const activeReminders = reminders.filter((r) => r.state === "Scheduled");
  const nearest = activeReminders[0];
  const diffMs = nearest ? nearest.due_at - Date.now() : 0;
  const isImminent = nearest && diffMs > 0 && diffMs < 10 * 60 * 1000;
  const displayPill = isImminent
    ? formatTimeDisplay(diffMs)
    : `${activeReminders.length} ${activeReminders.length === 1 ? "reminder" : "reminders"}`;

  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" style={{ background: "#f59e0b" }} />
        <span style={{ fontWeight: 600 }}>🔔 {displayPill}</span>
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
        {batteryDisplay}
      </div>
    </div>
  );
};

export const CompactIdleIndicator: React.FC = () => {
  const batteryDisplay = useBatteryDisplay();
  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="bbq-status-dot" />
        <span>BBQ</span>
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
        {batteryDisplay}
      </div>
    </div>
  );
};

export {
  DEFAULT_COMPACT_INDICATOR_ORDER,
  resolveEffectiveIndicatorOrder,
} from "../../island/compactOrder.ts";
import { resolveEffectiveIndicatorOrder } from "../../island/compactOrder.ts";

export interface CompactIslandPillProps {
  state: IslandMachineState;
  activeWidgetId: string | null;
}

export const CompactIslandPill: React.FC<CompactIslandPillProps> = ({ state, activeWidgetId }) => {
  const isDraggingOver = useDropState((s) => s.isDraggingOver);
  const fileCount = useFileState((s) => s.entries.length);
  const clipboardEnabled = useClipboardState((s) => s.enabled);
  const clipboardCount = useClipboardState((s) => s.entries.length);
  const hasMedia = useMediaState((s) =>
    Boolean(
      s.currentSession &&
        s.currentSession.state !== "stopped" &&
        (s.currentSession.title || s.currentSession.artist)
    )
  );
  const isTimerRunning = useTimerState((s) => s.session.state === "Running");
  const scheduledReminderCount = useReminderState(
    (s) => s.reminders.filter((r) => r.state === "Scheduled").length
  );
  const disabledWidgets = useSettingsState((s) => s.settings.disabled_widgets);
  const persistedOrder = useSettingsState((s) => s.settings.compact_indicator_order);
  const isEnabled = (id: string) => !disabledWidgets.includes(id);

  // Highest priority: active drag over operation
  if (state === "DraggingOver" || isDraggingOver) {
    return (
      <div className="bbq-island-content">
        <CompactDropIndicator />
      </div>
    );
  }

  // Constraint 11: User-locked active widget must NOT be hijacked by background events
  if (activeWidgetId && isEnabled(activeWidgetId)) {
    let lockedContent: React.ReactNode = null;
    switch (activeWidgetId) {
      case "drop":
        lockedContent = <CompactDropIndicator />;
        break;
      case "files":
        lockedContent = <CompactFilesIndicator />;
        break;
      case "clipboard":
        lockedContent = <CompactClipboardIndicator />;
        break;
      case "media":
        lockedContent = <CompactMediaIndicator />;
        break;
      case "system":
        lockedContent = <CompactSystemIndicator />;
        break;
      case "launcher":
        lockedContent = <CompactLauncherIndicator />;
        break;
      case "timer":
        lockedContent = <CompactTimerIndicator />;
        break;
      case "reminder":
        lockedContent = <CompactReminderIndicator />;
        break;
      default:
        break;
    }
    if (lockedContent) {
      return <div className="bbq-island-content">{lockedContent}</div>;
    }
  }

  // Deterministic order evaluation
  const effectiveOrder = resolveEffectiveIndicatorOrder(persistedOrder, disabledWidgets);

  for (const widgetId of effectiveOrder) {
    if (widgetId === "drop" && isDraggingOver) {
      return (
        <div className="bbq-island-content">
          <CompactDropIndicator />
        </div>
      );
    }
    if (widgetId === "media" && hasMedia) {
      return (
        <div className="bbq-island-content">
          <CompactMediaIndicator />
        </div>
      );
    }
    if (widgetId === "timer" && isTimerRunning) {
      return (
        <div className="bbq-island-content">
          <CompactTimerIndicator />
        </div>
      );
    }
    if (widgetId === "reminder" && scheduledReminderCount > 0) {
      return (
        <div className="bbq-island-content">
          <CompactReminderIndicator />
        </div>
      );
    }
    if (widgetId === "files" && fileCount > 0) {
      return (
        <div className="bbq-island-content">
          <CompactFilesIndicator />
        </div>
      );
    }
    if (widgetId === "clipboard" && clipboardEnabled && clipboardCount > 0) {
      return (
        <div className="bbq-island-content">
          <CompactClipboardIndicator />
        </div>
      );
    }
  }

  return (
    <div className="bbq-island-content">
      <CompactIdleIndicator />
    </div>
  );
};
