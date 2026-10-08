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

let activeUnlisten: (() => void) | null = null;
let subscriberCount = 0;

/**
 * Initializes timer store with on-demand initial read and event subscription.
 * Idempotent: registers backend event listeners exactly once while active.
 * Returns an unlisten function that decrements the subscriber count and safely
 * tears down the listener when all consumers have unsubscribed.
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

  subscriberCount++;
  if (!activeUnlisten) {
    const unlisten = await subscribeToTimerChanged((updatedSession) => {
      timerStore.setState({ session: updatedSession, isLoading: false, error: null });
    });
    activeUnlisten = unlisten;
  }

  let cleanedUp = false;
  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && activeUnlisten) {
      const teardown = activeUnlisten;
      activeUnlisten = null;
      teardown();
    }
  };
}

export function isTimerStoreInitialized(): boolean {
  return activeUnlisten !== null;
}
