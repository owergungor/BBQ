import { createDomainStore } from "./createStore.ts";
import type { TimerSession } from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToTimerChanged } from "../ipc/events.ts";

export interface TimerDomainState {
  session: TimerSession;
  isLoading: boolean;
  error: string | null;
}

export function formatTimeDisplay(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (hours > 0) {
    const hh = String(hours).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export const defaultTimerSession: TimerSession = {
  id: "timer_session_default",
  mode: "Countdown",
  state: "Idle",
  started_at: null,
  paused_at: null,
  target_at: null,
  duration_ms: 5 * 60 * 1000,
  remaining_ms: 5 * 60 * 1000,
  pomodoro_phase: null,
  completed_cycles: 0,
};

export const initialTimerDomainState: TimerDomainState = {
  session: defaultTimerSession,
  isLoading: false,
  error: null,
};

export const timerStore = createDomainStore<TimerDomainState>(initialTimerDomainState);

export const useTimerState = timerStore.useStore;

export function setTimerSession(session: TimerSession): void {
  timerStore.setState({ session, isLoading: false, error: null });
}

export function setTimerLoading(isLoading: boolean): void {
  timerStore.setState({ isLoading });
}

export function setTimerError(error: string | null): void {
  timerStore.setState({ error, isLoading: false });
}

let isSubscribed = false;

/**
 * Initializes timer store with on-demand initial read and event subscription
 */
export async function initializeTimerStore(): Promise<() => void> {
  timerStore.setState({ isLoading: true });

  try {
    const session = await bbqCommands.timerGetState();
    if (session) {
      timerStore.setState({ session, error: null });
    }
  } catch (err) {
    console.error("Failed to initialize timer state:", err);
  } finally {
    timerStore.setState({ isLoading: false });
  }

  if (isSubscribed) {
    return () => {};
  }
  isSubscribed = true;

  const unlisten = await subscribeToTimerChanged((updatedSession) => {
    timerStore.setState({ session: updatedSession, isLoading: false, error: null });
  });

  return () => {
    isSubscribed = false;
    unlisten();
  };
}

// Auto-subscribe to backend events in browser/Tauri environment
if (typeof window !== "undefined") {
  subscribeToTimerChanged((updatedSession) => {
    timerStore.setState({ session: updatedSession, isLoading: false, error: null });
  }).catch((err) => {
    console.error("Failed to auto-subscribe to timer changes:", err);
  });
}
