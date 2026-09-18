/**
 * BBQ v1.3 - Milestone 7: Reminders Pure Model
 * Pure, deterministic logic for Reminders HUD and due time calculations.
 *
 * Strict Project Invariants:
 * - NO setInterval / setTimeout loops
 * - NO requestAnimationFrame loops
 * - Native timestamp authority (due_at - now)
 * - Safe numeric handling & bounded collections
 */

import type { Reminder } from "@bbq/types";

export const MAX_REMINDERS_BOUND = 50;
export const MAX_REMINDER_TITLE_LENGTH = 128;
export const MAX_REMINDER_BODY_LENGTH = 512;

export interface ReminderPreset {
  id: string;
  label: string;
  dueAt: number;
}

/**
 * Generates quick reminder presets relative to authoritative timestamp.
 */
export function calculateReminderPresets(now: number = Date.now()): ReminderPreset[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  return [
    { id: "10m", label: "+10 dk", dueAt: now + 10 * 60 * 1000 },
    { id: "30m", label: "+30 dk", dueAt: now + 30 * 60 * 1000 },
    { id: "1h", label: "+1 saat", dueAt: now + 60 * 60 * 1000 },
    { id: "tomorrow_9am", label: "Yarın 09:00", dueAt: tomorrow.getTime() },
  ];
}

/**
 * Formats relative due time safely without drift.
 */
export function formatReminderDue(dueAt: number, now: number = Date.now()): string {
  if (typeof dueAt !== "number" || isNaN(dueAt)) {
    return "Belirtilmemiş";
  }

  const diffMs = dueAt - now;

  if (diffMs <= 0) {
    return "Süresi doldu";
  }

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) {
    return "< 1 dk içinde";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} dk içinde`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    const remainMin = diffMin % 60;
    return remainMin > 0 ? `${diffHours} sa ${remainMin} dk` : `${diffHours} saat içinde`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} gün içinde`;
}

/**
 * Validates reminder creation input with strict safety constraints.
 */
export function validateReminderInput(
  title: string | null | undefined,
  dueAt: number | null | undefined,
  now: number = Date.now()
): { valid: true; title: string; dueAt: number } | { valid: false; reason: string } {
  if (!title || typeof title !== "string") {
    return { valid: false, reason: "Lütfen bir hatırlatıcı başlığı girin" };
  }

  const cleanTitle = title.trim();
  if (cleanTitle.length === 0) {
    return { valid: false, reason: "Lütfen bir hatırlatıcı başlığı girin" };
  }

  if (cleanTitle.length > MAX_REMINDER_TITLE_LENGTH) {
    return {
      valid: false,
      reason: `Başlık en fazla ${MAX_REMINDER_TITLE_LENGTH} karakter olabilir`,
    };
  }

  if (typeof dueAt !== "number" || isNaN(dueAt) || !Number.isFinite(dueAt)) {
    return { valid: false, reason: "Geçerli bir tarih ve saat seçin" };
  }

  if (dueAt <= now) {
    return { valid: false, reason: "Hatırlatıcı gelecekteki bir zamana ayarlanmalıdır" };
  }

  return { valid: true, title: cleanTitle, dueAt };
}

export interface PartitionedReminders {
  scheduled: Reminder[];
  fired: Reminder[];
}

/**
 * Partitions reminders into Scheduled and Fired lists, sorted by time.
 */
export function partitionReminders(
  reminders: Reminder[] | null | undefined,
  maxItems: number = MAX_REMINDERS_BOUND
): PartitionedReminders {
  if (!reminders || !Array.isArray(reminders)) {
    return { scheduled: [], fired: [] };
  }

  const scheduled: Reminder[] = [];
  const fired: Reminder[] = [];

  for (const r of reminders) {
    if (r.state === "Scheduled") {
      scheduled.push(r);
    } else {
      fired.push(r);
    }
  }

  // Sort scheduled ascending (soonest due first)
  scheduled.sort((a, b) => a.due_at - b.due_at);

  // Sort fired descending (most recently fired first)
  fired.sort((a, b) => b.due_at - a.due_at);

  return {
    scheduled: scheduled.slice(0, maxItems),
    fired: fired.slice(0, maxItems),
  };
}
