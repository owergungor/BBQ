import type { TimerSession } from "@bbq/types";

export interface TimerNotificationPayload {
  id: string;
  title: string;
  body: string;
}

export class TimerNotificationCoordinator {
  private notifiedIds = new Set<string>();

  /**
   * Evaluates session and returns notification payload if and only if
   * this is a valid completion transition that has not been notified before.
   */
  public evaluate(session: TimerSession | null | undefined): TimerNotificationPayload | null {
    if (!session || session.state !== "Completed") {
      return null;
    }

    if (session.mode === "Countdown") {
      const notifId = `timer_finish_${session.id}`;
      if (this.notifiedIds.has(notifId)) {
        return null;
      }
      this.notifiedIds.add(notifId);
      return {
        id: notifId,
        title: "Countdown",
        body: "Countdown tamamlandı.",
      };
    }

    if (session.mode === "Pomodoro") {
      const phase = session.pomodoro_phase ?? "Work";
      const notifId = `pomodoro_finish_${session.id}_${session.completed_cycles}_${phase}`;
      if (this.notifiedIds.has(notifId)) {
        return null;
      }
      this.notifiedIds.add(notifId);

      if (phase === "Work") {
        return {
          id: notifId,
          title: "Pomodoro",
          body: "Çalışma süresi tamamlandı. Mola başladı.",
        };
      } else {
        return {
          id: notifId,
          title: "Pomodoro",
          body: "Mola tamamlandı. Çalışma başladı.",
        };
      }
    }

    return null;
  }

  /**
   * Evaluates session and returns whether desktop notification is eligible.
   */
  public async handleSessionUpdate(session: TimerSession | null | undefined): Promise<boolean> {
    const payload = this.evaluate(session);
    return payload !== null;
  }

  public reset(): void {
    this.notifiedIds.clear();
  }
}

export const timerNotificationCoordinator = new TimerNotificationCoordinator();
