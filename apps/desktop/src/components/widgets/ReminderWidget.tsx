import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  useReminderState,
  refreshReminders,
  setReminderError,
} from "../../state/reminderState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import { Icon } from "../common/Icon.tsx";
import {
  calculateReminderPresets,
  formatReminderDue,
  validateReminderInput,
  partitionReminders,
} from "./reminderModel.ts";

export const ReminderWidget: React.FC = () => {
  const { reminders, isLoading, error } = useReminderState();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedDueAt, setSelectedDueAt] = useState<number>(() => Date.now() + 10 * 60 * 1000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomDateTime, setShowCustomDateTime] = useState(false);

  useEffect(() => {
    refreshReminders();
  }, []);

  const presets = useMemo(() => calculateReminderPresets(), []);

  const handleSelectPreset = useCallback((dueAt: number) => {
    setSelectedDueAt(dueAt);
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
    const validation = validateReminderInput(title, selectedDueAt);
    if (!validation.valid) {
      setReminderError(validation.reason);
      return;
    }

    setIsSubmitting(true);
    setReminderError(null);
    try {
      const created = await bbqCommands.reminderCreate(
        validation.title,
        body.trim() ? body.trim() : null,
        validation.dueAt
      );

      if (created) {
        setTitle("");
        setBody("");
        // Reset to default +10m preset
        setSelectedDueAt(Date.now() + 10 * 60 * 1000);
        setShowCustomDateTime(false);
      }
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelReminder = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await bbqCommands.reminderCancel(id);
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClearFired = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await bbqCommands.reminderClearFired();
      await refreshReminders();
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err));
    }
  };

  const { scheduled: scheduledReminders, fired: firedReminders } = useMemo(() => {
    return partitionReminders(reminders);
  }, [reminders]);

  return (
    <div className="bbq-reminder-widget" onClick={(e) => e.stopPropagation()}>
      {/* Header with Title and Clear Action */}
      <div className="bbq-reminder-header">
        <div className="bbq-reminder-title-area">
          <Icon name="bell" size={16} className="bbq-reminder-header-icon" />
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
          <Icon name="close" size={12} />
          <span>{error}</span>
          <button
            type="button"
            className="bbq-reminder-error-dismiss"
            onClick={() => setReminderError(null)}
            aria-label="Dismiss error"
          >
            <Icon name="close" size={12} />
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
            maxLength={128}
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
          {presets.map((preset) => {
            const isSelected = !showCustomDateTime && Math.abs(selectedDueAt - preset.dueAt) < 2000;
            return (
              <button
                key={preset.id}
                type="button"
                className={`bbq-reminder-preset-btn ${isSelected ? "active" : ""}`}
                onClick={() => handleSelectPreset(preset.dueAt)}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            className={`bbq-reminder-preset-btn ${showCustomDateTime ? "active" : ""}`}
            onClick={() => setShowCustomDateTime(!showCustomDateTime)}
          >
            <Icon name="calendar" size={11} style={{ marginRight: "4px" }} />
            Custom...
          </button>
        </div>

        {/* Custom Datetime Input */}
        {showCustomDateTime && (
          <div className="bbq-reminder-custom-datetime">
            <label htmlFor="custom-due-at">Date & Time:</label>
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
          Target: {formatReminderDue(selectedDueAt)} (
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
            {isLoading ? "Loading..." : "No active reminders. Add one above!"}
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
                    {formatReminderDue(rem.due_at)}
                  </span>
                  <button
                    type="button"
                    className="bbq-reminder-cancel-btn"
                    onClick={(e) => handleCancelReminder(rem.id, e)}
                    title="Cancel"
                    aria-label={`Cancel reminder ${rem.title}`}
                  >
                    <Icon name="close" size={12} />
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
