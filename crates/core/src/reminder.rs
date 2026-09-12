use crate::error::{BbqError, BbqResult};
use serde::{Deserialize, Serialize};

/// State of a scheduled reminder
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReminderState {
    Scheduled,
    Fired,
    Cancelled,
}

pub const MAX_REMINDER_TITLE_LENGTH: usize = 256;
pub const MAX_REMINDER_BODY_LENGTH: usize = 2048;

/// Normalized reminder representation
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub title: String,
    pub body: Option<String>,
    pub due_at: u64,
    pub state: ReminderState,
    pub created_at: u64,
}

impl Reminder {
    pub fn new(
        id: impl Into<String>,
        title: impl Into<String>,
        body: Option<String>,
        due_at: u64,
        created_at: u64,
    ) -> BbqResult<Self> {
        let reminder = Self {
            id: id.into(),
            title: title.into(),
            body,
            due_at,
            state: ReminderState::Scheduled,
            created_at,
        };
        reminder.validate_creation(created_at)?;
        Ok(reminder)
    }

    pub fn validate_creation(&self, current_time: u64) -> BbqResult<()> {
        self.validate_base()?;

        if self.due_at <= current_time {
            return Err(BbqError::Validation(format!(
                "Reminder due_at ({}) must be strictly in the future (current time: {})",
                self.due_at, current_time
            )));
        }

        Ok(())
    }

    pub fn validate_base(&self) -> BbqResult<()> {
        if self.id.trim().is_empty() {
            return Err(BbqError::Validation(
                "Reminder ID cannot be empty".to_string(),
            ));
        }

        let trimmed_title = self.title.trim();
        if trimmed_title.is_empty() {
            return Err(BbqError::Validation(
                "Reminder title cannot be empty".to_string(),
            ));
        }

        if self.title.len() > MAX_REMINDER_TITLE_LENGTH {
            return Err(BbqError::Validation(format!(
                "Reminder title exceeds maximum length of {} characters",
                MAX_REMINDER_TITLE_LENGTH
            )));
        }

        if let Some(ref body) = self.body {
            if body.len() > MAX_REMINDER_BODY_LENGTH {
                return Err(BbqError::Validation(format!(
                    "Reminder body exceeds maximum length of {} characters",
                    MAX_REMINDER_BODY_LENGTH
                )));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reminder_creation_validation_success() {
        let now = 10000;
        let due_at = now + 60000;
        let reminder = Reminder::new(
            "rem-1",
            "Review PR",
            Some("Check edge cases".to_string()),
            due_at,
            now,
        );
        assert!(reminder.is_ok());
        let r = reminder.unwrap();
        assert_eq!(r.state, ReminderState::Scheduled);
        assert_eq!(r.title, "Review PR");
        assert_eq!(r.due_at, due_at);
    }

    #[test]
    fn test_reminder_past_due_date_rejected() {
        let now = 50000;
        let due_at = 40000;
        let reminder = Reminder::new("rem-2", "Old event", None, due_at, now);
        assert!(matches!(reminder, Err(BbqError::Validation(_))));
    }

    #[test]
    fn test_reminder_empty_title_rejected() {
        let now = 10000;
        let due_at = now + 5000;
        let reminder = Reminder::new("rem-3", "   ", None, due_at, now);
        assert!(matches!(reminder, Err(BbqError::Validation(_))));
    }

    #[test]
    fn test_reminder_length_limits() {
        let now = 10000;
        let due_at = now + 5000;
        let long_title = "x".repeat(MAX_REMINDER_TITLE_LENGTH + 1);
        let res = Reminder::new("rem-4", long_title, None, due_at, now);
        assert!(matches!(res, Err(BbqError::Validation(_))));

        let long_body = "y".repeat(MAX_REMINDER_BODY_LENGTH + 1);
        let res2 = Reminder::new("rem-5", "Valid", Some(long_body), due_at, now);
        assert!(matches!(res2, Err(BbqError::Validation(_))));
    }

    #[test]
    fn test_reminder_serde_roundtrip() {
        let r = Reminder {
            id: "rem-serde".to_string(),
            title: "Meeting".to_string(),
            body: Some("Sync with team".to_string()),
            due_at: 123456789,
            state: ReminderState::Fired,
            created_at: 123450000,
        };

        let json = serde_json::to_string(&r).unwrap();
        let deserialized: Reminder = serde_json::from_str(&json).unwrap();
        assert_eq!(r, deserialized);
    }
}
