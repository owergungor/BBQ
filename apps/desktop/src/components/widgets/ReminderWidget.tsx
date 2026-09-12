import React, { useState, useCallback, useEffect } from "react";
import {
  useReminderState,
  formatDueTime,
  refreshReminders,
  setReminderError,
} from "../../state/reminderState.ts";
import { bbqCommands } from "../../ipc/commands.ts";

interface PresetOption {
  label: string;
  calcMs: () => number;
}

const PRESETS: PresetOption[] = [
  { label: "+10m", calcMs: () => Date.now() + 10 * 60 * 1000 },
  { label: "+30m", calcMs: () => Date.now() + 30 * 60 * 1000 },
  { label: "+1h", calcMs: () => Date.now() + 60 * 60 * 1000 },
  {
    label: "Tomorrow 9am",
    calcMs: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    },
  },
];

export const ReminderWidget: React.FC = () => {
  const { reminders, isLoading, error } = useReminderState();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedDueAt, setSelectedDueAt] = useState<number>(Date.now() + 10 * 60 * 1000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomDateTime, setShowCustomDateTime] = useState(false);

  useEffect(() => {
    refreshReminders();
  }, []);

  const handleSelectPreset = useCallback((calcMs: () => number) => {
    setSelectedDueAt(calcMs());
    setShowCustomDateTime(false);
  }, []);

  const handleCustomDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const parsed = new Date(val).getTime();
      if (!isNaN(parsed)) {
        setSelectedDueAt(parsed);
      }
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setReminderError("Please enter a reminder title");
      return;
    }

    if (selectedDueAt <= Date.now()) {
      setReminderError("Reminder must be set to a future time");
      return;
    }

    setIsSubmitting(true);
    setReminderError(null);
    try {
      const created = await bbqCommands.reminderCreate(
        trimmedTitle,
        body.trim() ? body.trim() : null,
        selectedDueAt
      );

      if (created) {
        setTitle("");
        setBody("");
        // Reset to default +10m preset
        setSelectedDueAt(Date.now() + 10 * 60 * 1000);
      }
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelReminder = async (id: string) => {
    try {
      await bbqCommands.reminderCancel(id);
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClearFired = async () => {
    try {
      await bbqCommands.reminderClearFired();
      await refreshReminders();
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err));
    }
  };

  const scheduledReminders = reminders.filter((r) => r.state === "Scheduled");
  const firedReminders = reminders.filter((r) => r.state === "Fired");

  return (
    <div className="bbq-reminder-widget">
      {/* Header with Title and Clear Action */}
      <div className="bbq-reminder-header">
        <div className="bbq-reminder-title-area">
          <span className="bbq-reminder-icon" aria-hidden="true">🔔</span>
          <span className="bbq-reminder-heading">Reminders</span>
          <span className="bbq-reminder-badge">
            {scheduledReminders.length}
          </span>
        </div>
        {firedReminders.length > 0 && (
          <button
            type="button"
            className="bbq-reminder-clear-btn"
            onClick={handleClearFired}
            title="Clear completed reminders"
          >
            Clear Past ({firedReminders.length})
          </button>
        )}
      </div>

      {error && (
        <div className="bbq-reminder-error-banner" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="bbq-reminder-error-dismiss"
            onClick={() => setReminderError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Creation Form */}
      <form className="bbq-reminder-form" onSubmit={handleCreateReminder}>
        <div className="bbq-reminder-input-row">
          <input
            type="text"
            className="bbq-reminder-text-input"
            placeholder="What should BBQ remind you about?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={256}
            disabled={isSubmitting}
            aria-label="Reminder title"
          />
          <button
            type="submit"
            className="bbq-reminder-submit-btn"
            disabled={isSubmitting || !title.trim()}
          >
            {isSubmitting ? "..." : "Add"}
          </button>
        </div>

        {/* Preset Chips */}
        <div className="bbq-reminder-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="bbq-reminder-preset-btn"
              onClick={() => handleSelectPreset(preset.calcMs)}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className={`bbq-reminder-preset-btn ${showCustomDateTime ? "active" : ""}`}
            onClick={() => setShowCustomDateTime(!showCustomDateTime)}
          >
            Custom...
          </button>
        </div>

        {/* Custom Datetime Input */}
        {showCustomDateTime && (
          <div className="bbq-reminder-custom-datetime">
            <label htmlFor="custom-due-at">Custom Time:</label>
            <input
              id="custom-due-at"
              type="datetime-local"
              className="bbq-reminder-datetime-input"
              onChange={handleCustomDateTimeChange}
            />
          </div>
        )}

        {/* Due Target Indicator */}
        <div className="bbq-reminder-due-preview">
          Due: {formatDueTime(selectedDueAt)} (
          {new Date(selectedDueAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          )
        </div>
      </form>

      {/* Active Reminders List */}
      <div className="bbq-reminder-list-container">
        <div className="bbq-reminder-section-title">Upcoming</div>
        {scheduledReminders.length === 0 ? (
          <div className="bbq-reminder-empty">
            {isLoading ? "Loading reminders..." : "No active reminders. Schedule one above!"}
          </div>
        ) : (
          <ul className="bbq-reminder-list">
            {scheduledReminders.map((rem) => (
              <li key={rem.id} className="bbq-reminder-item">
                <div className="bbq-reminder-item-main">
                  <div className="bbq-reminder-item-title">{rem.title}</div>
                  {rem.body && (
                    <div className="bbq-reminder-item-body">{rem.body}</div>
                  )}
                </div>
                <div className="bbq-reminder-item-meta">
                  <span className="bbq-reminder-time-tag">
                    {formatDueTime(rem.due_at)}
                  </span>
                  <button
                    type="button"
                    className="bbq-reminder-cancel-btn"
                    onClick={() => handleCancelReminder(rem.id)}
                    title="Cancel reminder"
                    aria-label={`Cancel reminder ${rem.title}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
