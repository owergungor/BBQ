import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { TimerMode, TimerSession } from "@bbq/types";
import {
  useTimerState,
  formatTimeDisplay,
  setTimerSession,
  initializeTimerStore,
} from "../../state/timerState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import { Icon } from "../common/Icon.tsx";
import {
  calculateRemainingMs,
  calculateTimerProgressPct,
  calculateTimerDashOffset,
  getPomodoroPhaseInfo,
  parseAndValidateCustomMinutes,
} from "./productivityModel.ts";

export { formatTimeDisplay };

const COUNTDOWN_PRESETS = [
  { label: "1m", ms: 1 * 60 * 1000 },
  { label: "5m", ms: 5 * 60 * 1000 },
  { label: "10m", ms: 10 * 60 * 1000 },
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "30m", ms: 30 * 60 * 1000 },
  { label: "45m", ms: 45 * 60 * 1000 },
  { label: "60m", ms: 60 * 60 * 1000 },
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

  // Derive display time strictly from timestamps via pure productivity model
  const getDisplayMs = useCallback((): number => {
    return calculateRemainingMs(session, Date.now());
  }, [session]);

  const [displayMs, setDisplayMs] = useState<number>(getDisplayMs);

  // Synchronize display when session state updates
  useEffect(() => {
    setDisplayMs(getDisplayMs());
  }, [session, getDisplayMs]);

  // Bounded, cancelable one-shot timeout scheduling strictly targeting the next second boundary
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

  // Mode switching - preserves Idle state without auto-starting
  const handleSelectMode = useCallback(async (mode: TimerMode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (mode === session.mode) return;
    const res = await bbqCommands.timerSetMode(mode, selectedDurationMs);
    if (res) {
      setTimerSession(res);
    } else {
      const duration =
        mode === "Stopwatch" ? null : mode === "Pomodoro" ? 25 * 60 * 1000 : selectedDurationMs;
      setTimerSession({
        id: "timer_" + Date.now(),
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
    const validated = parseAndValidateCustomMinutes(customMinutes);
    if (validated.valid) {
      setSelectedDurationMs(validated.durationMs);
      const res = await bbqCommands.timerStartCountdown(validated.durationMs);
      if (res) setTimerSession(res);
      setCustomMinutes("");
    }
  }, [customMinutes]);

  const pomodoroInfo = useMemo(() => {
    return getPomodoroPhaseInfo(session.pomodoro_phase);
  }, [session.pomodoro_phase]);

  // Circular gauge calculations
  const progressPct = useMemo(() => {
    if (session.mode === "Stopwatch") {
      return session.state === "Running" ? 100 : 0;
    }
    const totalDuration = session.duration_ms ?? selectedDurationMs;
    return calculateTimerProgressPct(displayMs, totalDuration);
  }, [session.mode, session.state, session.duration_ms, selectedDurationMs, displayMs]);

  const radius = 54;
  const { circumference, dashOffset } = useMemo(() => {
    return calculateTimerDashOffset(progressPct, radius);
  }, [progressPct, radius]);

  const isPomodoro = session.mode === "Pomodoro";
  const accentColor = isPomodoro
    ? pomodoroInfo.color
    : session.mode === "Stopwatch"
    ? "#3b82f6"
    : "var(--bbq-accent, #0A84FF)";

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
          className={"bbq-timer-mode-btn" + (session.mode === "Countdown" ? " active" : "")}
          onClick={(e) => handleSelectMode("Countdown", e)}
        >
          <Icon name="timer" size={13} aria-hidden="true" />
          <span>Countdown</span>
        </button>
        <button
          id="timer-mode-stopwatch"
          type="button"
          role="tab"
          aria-selected={session.mode === "Stopwatch"}
          className={"bbq-timer-mode-btn" + (session.mode === "Stopwatch" ? " active" : "")}
          onClick={(e) => handleSelectMode("Stopwatch", e)}
        >
          <Icon name="stopwatch" size={13} aria-hidden="true" />
          <span>Stopwatch</span>
        </button>
        <button
          id="timer-mode-pomodoro"
          type="button"
          role="tab"
          aria-selected={session.mode === "Pomodoro"}
          className={"bbq-timer-mode-btn" + (session.mode === "Pomodoro" ? " active" : "")}
          onClick={(e) => handleSelectMode("Pomodoro", e)}
        >
          <Icon name="sparkles" size={13} aria-hidden="true" />
          <span>Pomodoro</span>
        </button>
      </div>

      {/* Pomodoro Phase & Cycle Badge */}
      {session.mode === "Pomodoro" && (
        <div className="bbq-pomodoro-status">
          <span
            className="bbq-pomodoro-phase-badge"
            style={{ backgroundColor: pomodoroInfo.color + "1e", color: pomodoroInfo.color }}
          >
            <Icon name={pomodoroInfo.iconName} size={12} aria-hidden="true" />
            <span>{pomodoroInfo.label}</span>
          </span>
          <div className="bbq-pomodoro-cycles" title={"Completed cycles: " + session.completed_cycles}>
            <span className="bbq-cycles-label">Cycles: {session.completed_cycles}</span>
          </div>
        </div>
      )}

      {/* Circular Progress Ring + Digital Readout Centerpiece */}
      <div className="bbq-timer-centerpiece" aria-live="polite" aria-atomic="true">
        <div className="bbq-timer-ring-container">
          <svg
            className="bbq-timer-ring-svg"
            width="128"
            height="128"
            viewBox="0 0 128 128"
            aria-hidden="true"
          >
            {/* Background Track */}
            <circle
              className="bbq-timer-ring-bg"
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="5"
            />
            {/* Active Progress Ring */}
            <circle
              className="bbq-timer-ring-fill"
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke={accentColor}
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 64 64)"
              style={{
                transition: session.state === "Running" ? "stroke-dashoffset 0.5s ease" : "none",
              }}
            />
          </svg>

          {/* Centered Digital Display */}
          <div className="bbq-timer-center-content">
            <span className="bbq-timer-digits">{formatTimeDisplay(displayMs)}</span>
            <span className={"bbq-timer-state-indicator " + session.state.toLowerCase()}>
              {session.state}
            </span>
          </div>
        </div>
      </div>

      {/* Countdown Presets & Custom Manual Time (Countdown mode) */}
      {session.mode === "Countdown" && (
        <div className="bbq-timer-presets-section">
          <div className="bbq-timer-presets" role="group" aria-label="Quick timer presets">
            {COUNTDOWN_PRESETS.map((preset) => (
              <button
                key={preset.ms}
                id={"timer-preset-" + preset.label.replace(/\s+/g, "")}
                type="button"
                className={"bbq-timer-preset-btn" + (selectedDurationMs === preset.ms ? " active" : "")}
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
              placeholder="Custom min"
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
              Set
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
            aria-label="Start timer"
          >
            <Icon name="play" size={13} aria-hidden="true" />
            <span>Start</span>
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
              aria-label="Pause timer"
            >
              <Icon name="pause" size={13} aria-hidden="true" />
              <span>Pause</span>
            </button>
            <button
              id="timer-btn-reset"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
              aria-label="Reset timer"
            >
              <Icon name="refresh" size={13} aria-hidden="true" />
              <span>Reset</span>
            </button>
            {session.mode === "Countdown" && (
              <button
                id="timer-btn-cancel"
                type="button"
                className="bbq-timer-btn bbq-timer-btn-ghost"
                onClick={handleCancel}
                disabled={isLoading}
                aria-label="Cancel timer"
              >
                <Icon name="close" size={13} aria-hidden="true" />
                <span>Cancel</span>
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
              aria-label="Resume timer"
            >
              <Icon name="play" size={13} aria-hidden="true" />
              <span>Resume</span>
            </button>
            <button
              id="timer-btn-reset"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
              aria-label="Reset timer"
            >
              <Icon name="refresh" size={13} aria-hidden="true" />
              <span>Reset</span>
            </button>
            {session.mode === "Countdown" && (
              <button
                id="timer-btn-cancel"
                type="button"
                className="bbq-timer-btn bbq-timer-btn-ghost"
                onClick={handleCancel}
                disabled={isLoading}
                aria-label="Cancel timer"
              >
                <Icon name="close" size={13} aria-hidden="true" />
                <span>Cancel</span>
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
              aria-label="Start new timer"
            >
              <Icon name="play" size={13} aria-hidden="true" />
              <span>Start New</span>
            </button>
            <button
              id="timer-btn-reset"
              type="button"
              className="bbq-timer-btn bbq-timer-btn-secondary"
              onClick={handleReset}
              disabled={isLoading}
              aria-label="Reset timer"
            >
              <Icon name="refresh" size={13} aria-hidden="true" />
              <span>Reset</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
