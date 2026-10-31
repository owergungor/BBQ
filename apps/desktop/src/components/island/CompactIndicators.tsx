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
import { Icon } from "../common/Icon.tsx";
import { formatTimeDisplay, formatStopwatchDisplay } from "../widgets/TimerWidget.tsx";
import { resolveArtworkUrl } from "../widgets/mediaModel.ts";
import { MarqueeTitle } from "../common/MarqueeTitle.tsx";
import { useTranslation } from "../../i18n/index.ts";

export function useBatteryDisplay(): string {
  return useSystemState((s) => {
    return s.system.battery.available && s.system.battery.percentage !== null
      ? `${s.system.battery.percentage}%`
      : "";
  });
}

export const CompactDropIndicator: React.FC = () => {
  const { t } = useTranslation();
  const isDraggingOver = useDropState((s) => s.isDraggingOver);
  const currentBatch = useDropState((s) => s.currentBatch);

  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" style={{ background: "var(--bbq-accent, #0A84FF)" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
          <Icon name="drop" size={13} aria-hidden="true" />
          <span>{t("compact.dropShelf") || "Drop Shelf"}</span>
        </span>
        <span className="bbq-media-separator">—</span>
        <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
          {isDraggingOver
            ? (t("compact.releaseToStage") || "Release to stage")
            : currentBatch
            ? `${currentBatch.count} ${t("compact.staged") || "staged"}`
            : (t("compact.dragFilesHere") || "Drag files here")}
        </span>
      </div>
    </div>
  );
};

export const CompactFilesIndicator: React.FC = () => {
  const { t } = useTranslation();
  const fileEntries = useFileState((s) => s.entries);
  return (
    <div className="bbq-island-file-pill">
      <span className="bbq-file-pill-icon" aria-hidden="true">
        <Icon name="files" size={13} />
      </span>
      <span className="bbq-file-pill-title">
        {fileEntries.length} {fileEntries.length === 1 ? (t("compact.file") || "file") : (t("compact.files") || "files")}
      </span>
      <span className="bbq-media-separator">—</span>
      <span className="bbq-file-name" style={{ maxWidth: "160px" }}>
        {fileEntries[0]?.name}
      </span>
    </div>
  );
};

export const CompactClipboardIndicator: React.FC = () => {
  const { t } = useTranslation();
  const clipboardEntries = useClipboardState((s) => s.entries);
  return (
    <div className="bbq-island-clipboard-pill">
      <span className="bbq-clipboard-pill-icon" aria-hidden="true">
        <Icon name="clipboard" size={13} />
      </span>
      <span className="bbq-clipboard-pill-title">{t("compact.clipboard") || "Clipboard"}</span>
      <span className="bbq-media-separator">—</span>
      <span className="bbq-clipboard-pill-preview">
        {clipboardEntries[0]?.preview ?? (t("compact.latestItem") || "Latest item")}
      </span>
    </div>
  );
};

export const CompactMediaIndicator: React.FC = () => {
  const { t } = useTranslation();
  const currentSession = useMediaState((s) => s.currentSession);
  const [artFailed, setArtFailed] = React.useState(false);
  const resolvedArt = React.useMemo(
    () => resolveArtworkUrl(currentSession?.albumArt),
    [currentSession?.albumArt]
  );

  React.useEffect(() => {
    setArtFailed(false);
  }, [resolvedArt, currentSession?.id, currentSession?.title]);

  if (!currentSession || currentSession.state === "stopped") return null;

  const isPlaying = currentSession.state === "playing";
  const caps = currentSession.capabilities;
  const unknownArtist = t("compact.unknownArtist") || "Unknown Artist";
  const unknownTrack = t("compact.unknownTrack") || "Unknown Track";
  const artistText = currentSession.artist ?? unknownArtist;
  const trackText = currentSession.title ?? unknownTrack;
  const prevTrackLabel = t("compact.previousTrack") || "Previous track";
  const nextTrackLabel = t("compact.nextTrack") || "Next track";
  const playLabel = t("compact.play") || "Play";
  const pauseLabel = t("compact.pause") || "Pause";
  const toggleLabel = isPlaying ? pauseLabel : playLabel;

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
        {resolvedArt && !artFailed ? (
          <img
            key={`${currentSession.id}-${currentSession.title ?? ""}-${resolvedArt}`}
            src={resolvedArt}
            alt=""
            aria-hidden="true"
            decoding="async"
            className="bbq-media-art-img"
            onError={() => setArtFailed(true)}
          />
        ) : (
          <span className="bbq-media-icon" aria-hidden="true">
            <Icon name="media" size={14} />
          </span>
        )}
      </div>

      <div className="bbq-media-info">
        <span className="bbq-media-title">
          <MarqueeTitle text={trackText} title={`${trackText} — ${artistText}`} />
        </span>
        <span className="bbq-media-artist">
          {artistText}
        </span>
      </div>

      <div className="bbq-media-controls">
        {caps.canGoPrevious && (
          <button
            type="button"
            className="bbq-media-ctrl-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handlePrevious}
            title={prevTrackLabel}
            aria-label={prevTrackLabel}
          >
            <Icon name="skip-back" size={12} />
          </button>
        )}
        {(caps.canPlay || caps.canPause) && (
          <button
            type="button"
            className="bbq-media-ctrl-btn bbq-media-ctrl-primary"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleTogglePlayPause}
            title={toggleLabel}
            aria-label={toggleLabel}
          >
            <Icon name={isPlaying ? "pause" : "play"} size={13} />
          </button>
        )}
        {caps.canGoNext && (
          <button
            type="button"
            className="bbq-media-ctrl-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleNext}
            title={nextTrackLabel}
            aria-label={nextTrackLabel}
          >
            <Icon name="skip-next" size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

export const CompactSystemIndicator: React.FC = () => {
  const { t } = useTranslation();
  const system = useSystemState((s) => s.system);
  const cpuPct = system.cpu?.usage_percent !== undefined ? Math.round(system.cpu.usage_percent) : null;
  const memPct = system.memory?.usage_percent !== undefined ? Math.round(system.memory.usage_percent) : null;

  return (
    <div className="bbq-island-idle-pill bbq-island-stats-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {cpuPct !== null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Icon name="cpu" size={12} aria-hidden="true" />
            <span style={{ fontWeight: 600 }}>{cpuPct}%</span>
          </span>
        ) : null}

        {memPct !== null ? (
          <>
            <span className="bbq-media-separator" aria-hidden="true">/</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Icon name="ram" size={12} aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>{memPct}%</span>
            </span>
          </>
        ) : null}

        {cpuPct === null && memPct === null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <Icon name="stats" size={13} aria-hidden="true" />
            <span style={{ fontWeight: 600 }}>{t("compact.system") || "System"}</span>
            <span className="bbq-media-separator">—</span>
            <span style={{ color: "var(--text-secondary)" }}>
              {system.network.connected ? (t("compact.online") || "Online") : (t("compact.offline") || "Offline")}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

export const CompactLauncherIndicator: React.FC = () => {
  const { t } = useTranslation();
  const batteryDisplay = useBatteryDisplay();
  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" style={{ background: "var(--accent, #3b82f6)" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
          <Icon name="launcher" size={12} aria-hidden="true" />
          <span>{t("compact.search") || "Search"}</span>
        </span>
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
        {batteryDisplay}
      </div>
    </div>
  );
};

export const CompactTimerIndicator: React.FC = () => {
  const { t } = useTranslation();
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
      const delay =
        timerSession.mode === "Stopwatch"
          ? Math.max(10, 50 - (now % 50))
          : Math.max(50, 1000 - (now % 1000));
      timeoutId = setTimeout(tick, delay);
    };

    tick();
    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isTimerRunning, timerSession.mode, getCompactTimerMs]);

  const isPomodoro = timerSession.mode === "Pomodoro";
  const isStopwatch = timerSession.mode === "Stopwatch";

  const displayFormattedTime = isStopwatch
    ? formatStopwatchDisplay(compactDisplayMs)
    : formatTimeDisplay(compactDisplayMs);

  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          className="bbq-status-dot"
          style={{
            background: isPomodoro
              ? "#ef4444"
              : isStopwatch
              ? "#3b82f6"
              : isTimerRunning
              ? "#10b981"
              : "var(--accent, #3b82f6)",
          }}
        />
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
          <Icon
            name={isPomodoro ? "sparkles" : isStopwatch ? "stopwatch" : "timer"}
            size={13}
            aria-hidden="true"
          />
          <span>{displayFormattedTime}</span>
        </span>
        <span className="bbq-media-separator">—</span>
        <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
          {isPomodoro
            ? (timerSession.pomodoro_phase ?? (t("widgets.timer.work") || "Work"))
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
  const { t } = useTranslation();
  const reminders = useReminderState((s) => s.reminders);
  const batteryDisplay = useBatteryDisplay();
  const activeReminders = reminders.filter((r) => r.state === "Scheduled");
  const nearest = activeReminders[0];
  const diffMs = nearest ? nearest.due_at - Date.now() : 0;
  const isImminent = nearest && diffMs > 0 && diffMs < 10 * 60 * 1000;
  const reminderLabel =
    activeReminders.length === 1
      ? t("compact.reminder") || "reminder"
      : t("compact.reminders") || "reminders";
  const displayPill = isImminent
    ? formatTimeDisplay(diffMs)
    : `${activeReminders.length} ${reminderLabel}`;

  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" style={{ background: "#f59e0b" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
          <Icon name="reminders" size={13} aria-hidden="true" />
          <span>{displayPill}</span>
        </span>
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
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" />
        <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>BBQ</span>
      </div>
      {batteryDisplay ? (
        <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
          {batteryDisplay}
        </div>
      ) : null}
    </div>
  );
};

export const CompactSettingsIndicator: React.FC = () => {
  const { t } = useTranslation();
  const batteryDisplay = useBatteryDisplay();
  return (
    <div className="bbq-island-idle-pill">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span className="bbq-status-dot" style={{ background: "var(--bbq-accent, #0a84ff)" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
          <Icon name="settings" size={12} aria-hidden="true" />
          <span>{t("settings.title") || "Settings"}</span>
        </span>
      </div>
      {batteryDisplay ? (
        <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
          {batteryDisplay}
        </div>
      ) : null}
    </div>
  );
};

import {
  DEFAULT_COMPACT_INDICATOR_ORDER,
  resolveEffectiveIndicatorOrder,
} from "../../island/compactOrder.ts";

export { DEFAULT_COMPACT_INDICATOR_ORDER, resolveEffectiveIndicatorOrder };

import { useIslandState } from "../../island/islandState.ts";

export interface CompactIslandPillProps {
  state: IslandMachineState;
  activeWidgetId: string | null;
}

export const CompactIslandPill: React.FC<CompactIslandPillProps> = ({ state, activeWidgetId }) => {
  const userLockedWidget = useIslandState((s) => s.userLockedWidget);
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
  const islandMode = useSettingsState((s) => s.settings.island_mode);
  const isEnabled = (id: string) => !disabledWidgets.includes(id);

  // Dot mode compact circular rendering
  if (islandMode === "dot" && state === "Idle") {
    let iconName: any = null;
    if (userLockedWidget && activeWidgetId && isEnabled(activeWidgetId)) {
      switch (activeWidgetId) {
        case "drop": iconName = "drop"; break;
        case "files": iconName = "files"; break;
        case "clipboard": iconName = "clipboard"; break;
        case "media": iconName = "music"; break;
        case "system": iconName = "activity"; break;
        case "launcher": iconName = "search"; break;
        case "timer": iconName = "timer"; break;
        case "reminder": iconName = "bell"; break;
        case "settings": iconName = "settings"; break;
      }
    } else if (isDraggingOver) {
      iconName = "drop";
    } else {
      const effectiveOrder = resolveEffectiveIndicatorOrder(persistedOrder, disabledWidgets);
      for (const widgetId of effectiveOrder) {
        if (widgetId === "drop" && isDraggingOver) { iconName = "drop"; break; }
        if (widgetId === "media" && hasMedia) { iconName = "music"; break; }
        if (widgetId === "timer" && isTimerRunning) { iconName = "timer"; break; }
        if (widgetId === "reminder" && scheduledReminderCount > 0) { iconName = "bell"; break; }
        if (widgetId === "files" && fileCount > 0) { iconName = "files"; break; }
        if (widgetId === "clipboard" && clipboardEnabled && clipboardCount > 0) { iconName = "clipboard"; break; }
      }
    }

    return (
      <div
        className="bbq-island-content bbq-dot-content"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {iconName ? (
          <Icon name={iconName} size={15} />
        ) : (
          <span
            className="bbq-status-dot"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--bbq-accent, #0a84ff)",
              boxShadow: "0 0 6px var(--bbq-accent, #0a84ff)",
            }}
          />
        )}
      </div>
    );
  }

  // Highest priority: active drag over operation
  if (state === "DraggingOver" || isDraggingOver) {
    return (
      <div className="bbq-island-content">
        <CompactDropIndicator />
      </div>
    );
  }

  // Constraint 11: User-locked active widget must NOT be hijacked by background events
  if (userLockedWidget && activeWidgetId && isEnabled(activeWidgetId)) {
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
      case "settings":
        lockedContent = <CompactSettingsIndicator />;
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
