import React from "react";
import { Switch } from "../../common/SettingsControls.tsx";
import type { NotificationsSettingsTabProps } from "./settingsTypes.ts";

export const NotificationsSettingsTab: React.FC<NotificationsSettingsTabProps> = ({
  notificationsEnabled,
  timerSoundEnabled,
  reminderSoundEnabled,
  onToggle,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Switch
        id="notifications-enable-toggle"
        checked={notificationsEnabled}
        onChange={(checked) => onToggle("notifications_enabled", checked)}
        label="Desktop Notifications"
        description="Receive OS desktop banner alerts for timer completions and reminders."
      />

      <Switch
        id="timer-sound-toggle"
        checked={timerSoundEnabled}
        onChange={(checked) => onToggle("timer_sound_enabled", checked)}
        label="Timer Sound"
        description="Play an auditory chime when timers and Pomodoro phases expire."
      />

      <Switch
        id="reminder-sound-toggle"
        checked={reminderSoundEnabled}
        onChange={(checked) => onToggle("reminder_sound_enabled", checked)}
        label="Reminder Sound"
        description="Play an auditory notification when a scheduled reminder is due."
      />
    </div>
  );
};
