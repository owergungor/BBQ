import React, { useState, useEffect, useCallback } from "react";
import type { TimerMode, PomodoroPhase } from "@bbq/types";
import { useTimerState, formatTimeDisplay } from "../../state/timerState.ts";
import { bbqCommands } from "../../ipc/commands.ts";

export { formatTimeDisplay };

const COUNTDOWN_PRESETS = [
  { label: "1m", ms: 1 * 60 * 1000 },
  { label: "5m", ms: 5 * 60 * 1000 },
  { label: "10m", ms: 10 * 60 * 1000 },
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "25m", ms: 25 * 60 * 1000 },
  { label: "60m", ms: 60 * 60 * 1000 },
];

export const TimerWidget: React.FC = () => {
  const { session, isLoading } = useTimerState();
  const [selectedDurationMs, setSelectedDurationMs] = useState<number>(5 * 60 * 1000);

  // Derive display time from authoritative timestamps
  const getDisplayMs = useCallback((): number => {
    const now = Date.now();
    if (session.mode === "Countdown" || session.mode === "Pomodoro") {
      if (session.state === "Running" && session.target_at) {
        return Math.max(0, session.target_at - now);
      }
      return session.remaining_ms ?? session.duration_ms ?? 0;
    } else {
      // Stopwatch
      if (session.state === "Running" && session.started_at) {
        const active = Math.max(0, now - session.started_at);
        const accumulated = session.remaining_ms ?? 0;
        return accumulated + active;
      }
      return session.remaining_ms ?? 0;
    }
  }, [session]);

  const [displayMs, setDisplayMs] = useState<number>(getDisplayMs);

  // Synchronize display when session state updates
  useEffect(() => {
    setDisplayMs(getDisplayMs());
  }, [session, getDisplayMs]);

  // Bounded, cancelable one-shot timeout scheduling for smooth countdown
  useEffect(() => {
    if (session.state !== "Running") {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const scheduleNextTick = () => {
      if (isCancelled) return;
      const now = Date.now();
      setDisplayMs(getDisplayMs());

      // Target the next whole second boundary
      const delay = Math.max(50, 1000 - (now % 1000));
      timeoutId = setTimeout(scheduleNextTick, delay);
    };

    scheduleNextTick();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }, [session.state, session.started_at, session.target_at, getDisplayMs]);

  // Handlers for mode switching
  const handleSelectMode = useCallback(async (mode: TimerMode) => {
    if (mode === session.mode) return;
    if (mode === "Countdown") {
      await bbqCommands.timerStartCountdown(selectedDurationMs);
    } else if (mode === "Stopwatch") {
      await bbqCommands.timerStartStopwatch();
    } else if (mode === "Pomodoro") {
      await bbqCommands.timerStartPomodoro();
    }
  }, [session.mode, selectedDurationMs]);

  // Controls
  const handleStart = useCallback(async () => {
    if (session.mode === "Countdown") {
      await bbqCommands.timerStartCountdown(selectedDurationMs);
    } else if (session.mode === "Stopwatch") {
      await bbqCommands.timerStartStopwatch();
    } else if (session.mode === "Pomodoro") {
      await bbqCommands.timerStartPomodoro();
    }
  }, [session.mode, selectedDurationMs]);

  const handlePause = useCallback(async () => {
    await bbqCommands.timerPause();
  }, []);

  const handleResume = useCallback(async () => {
    await bbqCommands.timerResume();
  }, []);

  const handleReset = useCallback(async () => {
    await bbqCommands.timerReset();
  }, []);

  const handleCancel = useCallback(async () => {
    await bbqCommands.timerCancel();
  }, []);

  const handlePresetSelect = useCallback(async (ms: number) => {
    setSelectedDurationMs(ms);
    if (session.state === "Idle" || session.state === "Completed") {
      await bbqCommands.timerStartCountdown(ms);
    }
  }, [session.state]);

  const getPhaseBadge = (phase: PomodoroPhase | null) => {
    switch (phase) {
      case "ShortBreak":
        return { label: "Short Break", color: "#10b981", icon: "☕" };
      case "LongBreak":
        return { label: "Long Break", color: "#3b82f6", icon: "🌴" };
      case "Work":
      default:
        return { label: "Work", color: "#ef4444", icon: "🍅" };
    }
  };

  const pomodoroBadge = getPhaseBadge(session.pomodoro_phase);

  return (
    <div id="bbq-timer-widget" className="bbq-timer-widget">
      {/* Mode Selector */}
      <div className="bbq-timer-mode-bar" role="tablist" aria-label="Timer modes">
        <button
          type="button"
          role="tab"
          aria-selected={session.mode === "Countdown"}
          className={`bbq-timer-mode-btn ${session.mode === "Countdown" ? "active" : ""}`}
          onClick={() => handleSelectMode("Countdown")}
        >
          ⏱ Countdown
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={session.mode === "Stopwatch"}
          className={`bbq-timer-mode-btn ${session.mode === "Stopwatch" ? "active" : ""}`}
          onClick={() => handleSelectMode("Stopwatch")}
        >
          ⏱ Stopwatch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={session.mode === "Pomodoro"}
          className={`bbq-timer-mode-btn ${session.mode === "Pomodoro" ? "active" : ""}`}
          onClick={() => handleSelectMode("Pomodoro")}
        >
          🍅 Pomodoro
        </button>
      </div>

      {/* Pomodoro Phase & Cycle Badge */}
      {session.mode === "Pomodoro" && (
        <div className="bbq-pomodoro-status">
          <span
            className="bbq-pomodoro-phase-badge"
            style={{ backgroundColor: `${pomodoroBadge.color}22`, color: pomodoroBadge.color }}
          >
            <span aria-hidden="true">{pomodoroBadge.icon}</span> {pomodoroBadge.label}
          </span>
          <div className="bbq-pomodoro-cycles" title={`Completed cycles: ${session.completed_cycles}`}>
            <span className="bbq-cycles-label">Cycles: {session.completed_cycles}</span>
          </div>
        </div>
      )}

      {/* Digital Readout */}
      <div className="bbq-timer-display" aria-live="polite" aria-atomic="true">
        <span className="bbq-timer-digits">{formatTimeDisplay(displayMs)}</span>
        <span className={`bbq-timer-state-indicator ${session.state.toLowerCase()}`}>
          {session.state}
        </span>
      </div>

      {/* Countdown Presets (only when in Countdown mode) */}
      {session.mode === "Countdown" && (
        <div className="bbq-timer-presets">
          {COUNTDOWN_PRESETS.map((preset) => (
            <button
              key={preset.ms}
              type="button"
              className={`bbq-timer-preset-btn ${selectedDurationMs === preset.ms ? "active" : ""}`}
              onClick={() => handlePresetSelect(preset.ms)}
              disabled={session.state === "Running"}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Action Controls */}
      <div className="bbq-timer-controls">
        {session.state === "Idle" && (
          <button
            type="button"
            className="bbq-timer-btn bbq-timer-btn-primary"
            onClick={handleStart}
            disabled={isLoading}
          >
            ▶ Start
          </button>
        )}

        {session.state === "Running" && (
          <>
            <button
              type="button"
              className="bbq-timer-btn bbq-timer-btn-warning"
              onClick={handlePause}
              disabled={isLoading}
            >
              ⏸ Pause
            </button>
            <button
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
            >
              ↺ Reset
            </button>
            {session.mode === "Countdown" && (
              <button
                type="button"
                className="bbq-timer-btn bbq-timer-btn-ghost"
                onClick={handleCancel}
                disabled={isLoading}
              >
                ✕ Cancel
              </button>
            )}
          </>
        )}

        {session.state === "Paused" && (
          <>
            <button
              type="button"
              className="bbq-timer-btn bbq-timer-btn-primary"
              onClick={handleResume}
              disabled={isLoading}
            >
              ▶ Resume
            </button>
            <button
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
            >
              ↺ Reset
            </button>
            {session.mode === "Countdown" && (
              <button
                type="button"
                className="bbq-timer-btn bbq-timer-btn-ghost"
                onClick={handleCancel}
                disabled={isLoading}
              >
                ✕ Cancel
              </button>
            )}
          </>
        )}

        {session.state === "Completed" && (
          <>
            <button
              type="button"
              className="bbq-timer-btn bbq-timer-btn-primary"
              onClick={handleStart}
              disabled={isLoading}
            >
              ▶ Start New
            </button>
            <button
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
            >
              ↺ Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
};
