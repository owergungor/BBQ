import React, { useState, useEffect, useCallback } from "react";
import type { TimerMode, PomodoroPhase, TimerSession } from "@bbq/types";
import {
  useTimerState,
  formatTimeDisplay,
  setTimerSession,
  initializeTimerStore,
} from "../../state/timerState.ts";
import { bbqCommands } from "../../ipc/commands.ts";

export { formatTimeDisplay };

const COUNTDOWN_PRESETS = [
  { label: "1 dk", ms: 1 * 60 * 1000 },
  { label: "5 dk", ms: 5 * 60 * 1000 },
  { label: "10 dk", ms: 10 * 60 * 1000 },
  { label: "15 dk", ms: 15 * 60 * 1000 },
  { label: "30 dk", ms: 30 * 60 * 1000 },
  { label: "45 dk", ms: 45 * 60 * 1000 },
  { label: "60 dk", ms: 60 * 60 * 1000 },
];

export const TimerWidget: React.FC = () => {
  const { session, isLoading } = useTimerState();
  const [selectedDurationMs, setSelectedDurationMs] = useState<number>(5 * 60 * 1000);
  const [customMinutes, setCustomMinutes] = useState<string>("");

  // Initialize store and listen on mount
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await initializeTimerStore();
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

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

  // Handlers for mode switching - always opens in Idle/Paused state without auto-starting
  const handleSelectMode = useCallback(async (mode: TimerMode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (mode === session.mode) return;
    const res = await bbqCommands.timerSetMode(mode, selectedDurationMs);
    if (res) {
      setTimerSession(res);
    } else {
      // Fallback for browser / simulated test environment
      const duration =
        mode === "Stopwatch" ? null : mode === "Pomodoro" ? 25 * 60 * 1000 : selectedDurationMs;
      setTimerSession({
        id: `timer_${Date.now()}`,
        mode,
        state: "Idle",
        started_at: null,
        paused_at: null,
        target_at: null,
        duration_ms: duration,
        remaining_ms: mode === "Stopwatch" ? 0 : duration,
        pomodoro_phase: mode === "Pomodoro" ? "Work" : null,
        completed_cycles: session.completed_cycles,
      });
    }
  }, [session.mode, session.completed_cycles, selectedDurationMs]);

  // Controls
  const handleStart = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let res: TimerSession | null = null;
    if (session.mode === "Countdown") {
      res = await bbqCommands.timerStartCountdown(selectedDurationMs);
    } else if (session.mode === "Stopwatch") {
      res = await bbqCommands.timerStartStopwatch();
    } else if (session.mode === "Pomodoro") {
      res = await bbqCommands.timerStartPomodoro();
    }
    if (res) setTimerSession(res);
  }, [session.mode, selectedDurationMs]);

  const handlePause = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await bbqCommands.timerPause();
    if (res) setTimerSession(res);
  }, []);

  const handleResume = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await bbqCommands.timerResume();
    if (res) setTimerSession(res);
  }, []);

  const handleReset = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await bbqCommands.timerReset();
    if (res) setTimerSession(res);
  }, []);

  const handleCancel = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await bbqCommands.timerCancel();
    if (res) setTimerSession(res);
  }, []);

  const handlePresetSelect = useCallback(async (ms: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedDurationMs(ms);
    const res = await bbqCommands.timerStartCountdown(ms);
    if (res) setTimerSession(res);
  }, []);

  const handleCustomSubmit = useCallback(async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const mins = parseFloat(customMinutes);
    if (!isNaN(mins) && mins > 0) {
      const ms = Math.round(mins * 60 * 1000);
      setSelectedDurationMs(ms);
      const res = await bbqCommands.timerStartCountdown(ms);
      if (res) setTimerSession(res);
      setCustomMinutes("");
    }
  }, [customMinutes]);

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
    <div
      id="bbq-timer-widget"
      className="bbq-timer-widget"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Mode Selector */}
      <div className="bbq-timer-mode-bar" role="tablist" aria-label="Timer modes">
        <button
          id="timer-mode-countdown"
          type="button"
          role="tab"
          aria-selected={session.mode === "Countdown"}
          className={`bbq-timer-mode-btn ${session.mode === "Countdown" ? "active" : ""}`}
          onClick={(e) => handleSelectMode("Countdown", e)}
        >
          ⏱ Countdown
        </button>
        <button
          id="timer-mode-stopwatch"
          type="button"
          role="tab"
          aria-selected={session.mode === "Stopwatch"}
          className={`bbq-timer-mode-btn ${session.mode === "Stopwatch" ? "active" : ""}`}
          onClick={(e) => handleSelectMode("Stopwatch", e)}
        >
          ⏱ Stopwatch
        </button>
        <button
          id="timer-mode-pomodoro"
          type="button"
          role="tab"
          aria-selected={session.mode === "Pomodoro"}
          className={`bbq-timer-mode-btn ${session.mode === "Pomodoro" ? "active" : ""}`}
          onClick={(e) => handleSelectMode("Pomodoro", e)}
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

      {/* Countdown Presets & Custom Manual Time (Countdown mode) */}
      {session.mode === "Countdown" && (
        <div className="bbq-timer-presets-section">
          <div className="bbq-timer-presets" role="group" aria-label="Quick timer presets">
            {COUNTDOWN_PRESETS.map((preset) => (
              <button
                key={preset.ms}
                id={`timer-preset-${preset.label.replace(/\s+/g, "")}`}
                type="button"
                className={`bbq-timer-preset-btn ${selectedDurationMs === preset.ms ? "active" : ""}`}
                onClick={(e) => handlePresetSelect(preset.ms, e)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <form
            className="bbq-timer-custom-form"
            onSubmit={handleCustomSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              id="timer-custom-minutes-input"
              type="number"
              min="0.5"
              max="1440"
              step="any"
              placeholder="Özel dk"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="bbq-timer-custom-input"
              aria-label="Custom duration in minutes"
            />
            <button
              id="timer-custom-start-btn"
              type="submit"
              className="bbq-timer-custom-btn"
              disabled={!customMinutes.trim()}
              onClick={(e) => handleCustomSubmit(e)}
            >
              Kur
            </button>
          </form>
        </div>
      )}

      {/* Action Controls */}
      <div className="bbq-timer-controls" onClick={(e) => e.stopPropagation()}>
        {session.state === "Idle" && (
          <button
            id="timer-btn-start"
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
              id="timer-btn-pause"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-warning"
              onClick={handlePause}
              disabled={isLoading}
            >
              ⏸ Pause
            </button>
            <button
              id="timer-btn-reset"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
            >
              ↺ Reset
            </button>
            {session.mode === "Countdown" && (
              <button
                id="timer-btn-cancel"
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
              id="timer-btn-resume"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-primary"
              onClick={handleResume}
              disabled={isLoading}
            >
              ▶ Resume
            </button>
            <button
              id="timer-btn-reset"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
            >
              ↺ Reset
            </button>
            {session.mode === "Countdown" && (
              <button
                id="timer-btn-cancel"
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
              id="timer-btn-restart"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-primary"
              onClick={handleStart}
              disabled={isLoading}
            >
              ▶ Start New
            </button>
            <button
              id="timer-btn-reset"
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
