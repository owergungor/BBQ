use crate::{BbqError, BbqResult};
use serde::{Deserialize, Serialize};

pub const MAX_TITLE_LEN: usize = 128;
pub const MAX_SUBTITLE_LEN: usize = 256;
pub const MAX_RECENT_ITEMS: usize = 50;
pub const MAX_FAVORITE_ITEMS: usize = 20;
pub const MAX_DISCOVERED_APPS: usize = 100;

/// Explicit, closed set of supported operating system actions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SystemActionType {
    OpenSettings,
    ToggleMute,
    OpenDownloads,
    OpenHome,
    ShowDesktop,
    LockScreen,
}

/// Explicit, closed set of internal BBQ Quick Actions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BbqActionType {
    OpenSettings,
    OpenClipboard,
    OpenReminders,
    OpenTimer,
    OpenSystem,
    OpenMedia,
}

/// Strongly typed launcher actions. Arbitrary shell execution is forbidden.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum LauncherAction {
    OpenApplication { id: String },
    OpenFile { path: String },
    OpenFolder { path: String },
    OpenUrl { url: String },
    SystemAction(SystemActionType),
    BbqAction(BbqActionType),
}

/// Provenance of a launcher item
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LauncherItemSource {
    #[default]
    BuiltIn,
    Recent,
    Favorite,
    UserConfigured,
}

/// Capabilities exposed by the host platform launcher adapter
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct LauncherCapabilities {
    pub open_application: bool,
    pub open_file: bool,
    pub open_folder: bool,
    pub open_url: bool,
    pub system_actions: bool,
}

/// A normalized launcher item rendered in the Island launcher UI
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LauncherItem {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub icon: Option<String>,
    pub action: LauncherAction,
    pub source: LauncherItemSource,
    pub favorite: bool,
    pub last_used_at: Option<u64>,
    pub usage_count: u32,
    #[serde(default)]
    pub keywords: Vec<String>,
}

pub const MAX_URL_LEN: usize = 4096;
pub const MAX_PATH_LEN: usize = 4096;
pub const MAX_APP_ID_LEN: usize = 1024;

/// Strict URL validation helper: allows ONLY http:// or https://.
/// Explicitly rejects file:, javascript:, data:, vbscript:, and custom executable schemes.
pub fn validate_launcher_url(url: &str) -> BbqResult<()> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(BbqError::Validation("URL cannot be empty".to_string()));
    }

    if trimmed.len() > MAX_URL_LEN {
        return Err(BbqError::Validation(format!(
            "URL exceeds maximum length of {} characters",
            MAX_URL_LEN
        )));
    }

    let lower = trimmed.to_ascii_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err(BbqError::Validation(format!(
            "Forbidden URL scheme in '{}'. Only http:// and https:// are permitted.",
            url
        )));
    }

    // Reject control characters or newlines that could disrupt shell/URI parsers
    if trimmed
        .chars()
        .any(|c| c.is_control() || c == '\n' || c == '\r')
    {
        return Err(BbqError::Validation(
            "URL contains invalid control characters".to_string(),
        ));
    }

    Ok(())
}

impl LauncherItem {
    pub fn new(
        id: impl Into<String>,
        title: impl Into<String>,
        subtitle: Option<String>,
        icon: Option<String>,
        action: LauncherAction,
        source: LauncherItemSource,
        favorite: bool,
    ) -> BbqResult<Self> {
        let id = id.into();
        let title = title.into();

        if id.trim().is_empty() {
            return Err(BbqError::Validation(
                "Launcher item id cannot be empty".to_string(),
            ));
        }

        if title.trim().is_empty() {
            return Err(BbqError::Validation(
                "Launcher item title cannot be empty".to_string(),
            ));
        }

        if title.len() > MAX_TITLE_LEN {
            return Err(BbqError::Validation(format!(
                "Launcher item title exceeds maximum length of {} characters",
                MAX_TITLE_LEN
            )));
        }

        if let Some(ref sub) = subtitle {
            if sub.len() > MAX_SUBTITLE_LEN {
                return Err(BbqError::Validation(format!(
                    "Launcher item subtitle exceeds maximum length of {} characters",
                    MAX_SUBTITLE_LEN
                )));
            }
        }

        // Validate action payloads
        match &action {
            LauncherAction::OpenUrl { url } => {
                validate_launcher_url(url)?;
            }
            LauncherAction::OpenFile { path } | LauncherAction::OpenFolder { path } => {
                if path.trim().is_empty() {
                    return Err(BbqError::Validation("Path cannot be empty".to_string()));
                }
                if path.len() > MAX_PATH_LEN {
                    return Err(BbqError::Validation(format!(
                        "Path exceeds maximum length of {} characters",
                        MAX_PATH_LEN
                    )));
                }
            }
            LauncherAction::OpenApplication { id: app_id } => {
                if app_id.trim().is_empty() {
                    return Err(BbqError::Validation(
                        "Application id cannot be empty".to_string(),
                    ));
                }
                if app_id.len() > MAX_APP_ID_LEN {
                    return Err(BbqError::Validation(format!(
                        "Application id exceeds maximum length of {} characters",
                        MAX_APP_ID_LEN
                    )));
                }
            }
            LauncherAction::SystemAction(_) | LauncherAction::BbqAction(_) => {}
        }

        Ok(Self {
            id,
            title,
            subtitle,
            icon,
            action,
            source,
            favorite,
            last_used_at: None,
            usage_count: 0,
            keywords: Vec::new(),
        })
    }

    /// Sets bounded keywords on the launcher item (max 20 keywords, max 64 chars each)
    pub fn with_keywords(mut self, keywords: Vec<String>) -> Self {
        self.keywords = keywords
            .into_iter()
            .take(20)
            .map(|kw| kw.chars().take(64).collect())
            .collect();
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_validation_allows_http_and_https() {
        assert!(validate_launcher_url("https://github.com").is_ok());
        assert!(validate_launcher_url("http://localhost:3000").is_ok());
        assert!(validate_launcher_url("https://example.com/path?arg=1#frag").is_ok());
    }

    #[test]
    fn test_url_validation_rejects_dangerous_schemes() {
        assert!(validate_launcher_url("file:///etc/passwd").is_err());
        assert!(validate_launcher_url("javascript:alert(1)").is_err());
        assert!(validate_launcher_url("data:text/html,<b>hi</b>").is_err());
        assert!(validate_launcher_url("vbscript:MsgBox(1)").is_err());
        assert!(validate_launcher_url("powershell:rmdir").is_err());
        assert!(validate_launcher_url("cmd:echo").is_err());
        assert!(validate_launcher_url("").is_err());
    }

    #[test]
    fn test_launcher_item_creation_validation() {
        let item = LauncherItem::new(
            "github",
            "GitHub",
            Some("Open developer portal".to_string()),
            Some("🌐".to_string()),
            LauncherAction::OpenUrl {
                url: "https://github.com".to_string(),
            },
            LauncherItemSource::BuiltIn,
            false,
        );
        assert!(item.is_ok());

        // Empty title rejected
        assert!(LauncherItem::new(
            "id",
            "",
            None,
            None,
            LauncherAction::BbqAction(BbqActionType::OpenTimer),
            LauncherItemSource::BuiltIn,
            false,
        )
        .is_err());

        // Title exceeding length rejected
        let long_title = "a".repeat(MAX_TITLE_LEN + 1);
        assert!(LauncherItem::new(
            "id",
            long_title,
            None,
            None,
            LauncherAction::BbqAction(BbqActionType::OpenTimer),
            LauncherItemSource::BuiltIn,
            false,
        )
        .is_err());
    }

    #[test]
    fn test_launcher_serde_roundtrip() {
        let item = LauncherItem::new(
            "timer_action",
            "Open Timer",
            Some("Start or view active timer".to_string()),
            Some("⏱️".to_string()),
            LauncherAction::BbqAction(BbqActionType::OpenTimer),
            LauncherItemSource::BuiltIn,
            true,
        )
        .expect("Valid item");

        let serialized = serde_json::to_string(&item).expect("Serialize");
        let deserialized: LauncherItem = serde_json::from_str(&serialized).expect("Deserialize");
        assert_eq!(item, deserialized);
    }
}
