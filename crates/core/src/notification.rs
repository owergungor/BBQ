use crate::error::{BbqError, BbqResult};
use serde::{Deserialize, Serialize};

/// Categories for BBQ notifications
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NotificationCategory {
    Timer,
    Pomodoro,
    Reminder,
    System,
    General,
}

pub const MAX_NOTIFICATION_TITLE_LENGTH: usize = 128;
pub const MAX_NOTIFICATION_BODY_LENGTH: usize = 512;

/// Strongly typed notification request payload
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NotificationRequest {
    pub id: String,
    pub category: NotificationCategory,
    pub title: String,
    pub body: String,
}

impl NotificationRequest {
    pub fn new(
        id: impl Into<String>,
        category: NotificationCategory,
        title: impl Into<String>,
        body: impl Into<String>,
    ) -> BbqResult<Self> {
        let req = Self {
            id: id.into(),
            category,
            title: title.into(),
            body: body.into(),
        };
        req.validate()?;
        Ok(req)
    }

    pub fn validate(&self) -> BbqResult<()> {
        if self.id.trim().is_empty() {
            return Err(BbqError::Validation(
                "Notification ID cannot be empty".to_string(),
            ));
        }

        let trimmed_title = self.title.trim();
        if trimmed_title.is_empty() {
            return Err(BbqError::Validation(
                "Notification title cannot be empty".to_string(),
            ));
        }

        if self.title.len() > MAX_NOTIFICATION_TITLE_LENGTH {
            return Err(BbqError::Validation(format!(
                "Notification title exceeds maximum length of {} characters",
                MAX_NOTIFICATION_TITLE_LENGTH
            )));
        }

        if self.body.len() > MAX_NOTIFICATION_BODY_LENGTH {
            return Err(BbqError::Validation(format!(
                "Notification body exceeds maximum length of {} characters",
                MAX_NOTIFICATION_BODY_LENGTH
            )));
        }

        Ok(())
    }
}

/// Notification capabilities supported by the current platform
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct NotificationCapabilities {
    pub available: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_request_validation_success() {
        let req = NotificationRequest::new(
            "notif-1",
            NotificationCategory::Timer,
            "Timer finished",
            "Your countdown is complete.",
        );
        assert!(req.is_ok());
    }

    #[test]
    fn test_notification_request_validation_empty_title() {
        let req = NotificationRequest::new(
            "notif-2",
            NotificationCategory::Reminder,
            "   ",
            "Some body text",
        );
        assert!(matches!(req, Err(BbqError::Validation(_))));
    }

    #[test]
    fn test_notification_request_validation_empty_id() {
        let req = NotificationRequest::new("   ", NotificationCategory::Reminder, "Title", "Body");
        assert!(matches!(req, Err(BbqError::Validation(_))));
    }

    #[test]
    fn test_notification_request_validation_exceeds_max_lengths() {
        let long_title = "a".repeat(MAX_NOTIFICATION_TITLE_LENGTH + 1);
        let req =
            NotificationRequest::new("notif-3", NotificationCategory::General, long_title, "Body");
        assert!(matches!(req, Err(BbqError::Validation(_))));

        let long_body = "b".repeat(MAX_NOTIFICATION_BODY_LENGTH + 1);
        let req2 = NotificationRequest::new(
            "notif-4",
            NotificationCategory::General,
            "Valid Title",
            long_body,
        );
        assert!(matches!(req2, Err(BbqError::Validation(_))));
    }

    #[test]
    fn test_notification_serde_roundtrip() {
        let req = NotificationRequest::new(
            "notif-serde",
            NotificationCategory::Pomodoro,
            "Break finished",
            "Time to focus.",
        )
        .unwrap();

        let json = serde_json::to_string(&req).unwrap();
        let deserialized: NotificationRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(req, deserialized);
    }
}
