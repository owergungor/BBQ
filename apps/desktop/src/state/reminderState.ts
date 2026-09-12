import { createDomainStore } from "./createStore.ts";
import type { Reminder } from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToReminderChanged } from "../ipc/events.ts";

export interface ReminderDomainState {
  reminders: Reminder[];
  isLoading: boolean;
  error: string | null;
}

export const initialReminderDomainState: ReminderDomainState = {
  reminders: [],
  isLoading: false,
  error: null,
};

export const reminderStore = createDomainStore<ReminderDomainState>(initialReminderDomainState);

export const useReminderState = reminderStore.useStore;

export function setReminders(reminders: Reminder[]): void {
  reminderStore.setState({ reminders, isLoading: false, error: null });
}

export function updateOrAddReminder(reminder: Reminder): void {
  const current = reminderStore.getState().reminders;
  const existingIdx = current.findIndex((r) => r.id === reminder.id);
  let updated: Reminder[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = reminder;
  } else {
    updated = [...current, reminder];
  }
  updated.sort((a, b) => a.due_at - b.due_at);
  reminderStore.setState({ reminders: updated, isLoading: false, error: null });
}

export function removeReminder(id: string): void {
  const current = reminderStore.getState().reminders;
  const updated = current.filter((r) => r.id !== id);
  reminderStore.setState({ reminders: updated });
}

export function setReminderLoading(isLoading: boolean): void {
  reminderStore.setState({ isLoading });
}

export function setReminderError(error: string | null): void {
  reminderStore.setState({ error, isLoading: false });
}

export function formatDueTime(dueAt: number, now = Date.now()): string {
  const diffMs = dueAt - now;
  if (diffMs <= 0) {
    return "Due now";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `in ${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `in ${minutes}m`;
  }
  return `in ${totalSeconds}s`;
}

export async function refreshReminders(): Promise<void> {
  setReminderLoading(true);
  try {
    const list = await bbqCommands.reminderList();
    setReminders(list);
  } catch (err) {
    setReminderError(err instanceof Error ? err.message : String(err));
  }
}

// Auto-subscribe to backend events in browser/Tauri environment
if (typeof window !== "undefined") {
  subscribeToReminderChanged((reminder) => {
    updateOrAddReminder(reminder);
  }).catch((err) => {
    console.error("Failed to subscribe to reminder changes:", err);
  });
}
