import React from "react";
import { Switch } from "../../common/SettingsControls.tsx";
import type { NotificationsSettingsTabProps } from "./settingsTypes.ts";
import { useTranslation } from "../../../i18n/index.ts";

export const NotificationsSettingsTab: React.FC<NotificationsSettingsTabProps> = ({
  notificationsEnabled,
  timerSoundEnabled,
  reminderSoundEnabled,
  onToggle,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Switch
        id="notifications-enable-toggle"
        checked={notificationsEnabled}
        onChange={(checked) => onToggle("notifications_enabled", checked)}
        label={t("settings.notifications.appNotifications") || "Desktop Notifications"}
        description={
          t("settings.notifications.appNotificationsDesc") ||
          "Receive OS desktop banner alerts for timer completions and reminders."
        }
      />

      <Switch
        id="timer-sound-toggle"
        checked={timerSoundEnabled}
        onChange={(checked) => onToggle("timer_sound_enabled", checked)}
        label={t("settings.notifications.timerSound") || "Timer Sound"}
        description={
          t("settings.notifications.timerSoundDesc") ||
          "Play an auditory chime when timers and Pomodoro phases expire."
        }
      />

      <Switch
        id="reminder-sound-toggle"
        checked={reminderSoundEnabled}
        onChange={(checked) => onToggle("reminder_sound_enabled", checked)}
        label={t("settings.notifications.reminderSound") || "Reminder Sound"}
        description={
          t("settings.notifications.reminderSoundDesc") ||
          "Play an auditory notification when a scheduled reminder is due."
        }
      />
    </div>
  );
};
