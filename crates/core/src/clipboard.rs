use serde::{Deserialize, Serialize};

/// Maximum allowed clipboard text length in bytes (64 KiB)
pub const MAX_CLIPBOARD_TEXT_SIZE: usize = 64 * 1024;

/// Maximum preview length in characters
pub const MAX_PREVIEW_LENGTH: usize = 150;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClipboardContentType {
    Text,
    Image,
    FileList,
    Unknown,
}

impl std::fmt::Display for ClipboardContentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Text => write!(f, "text"),
            Self::Image => write!(f, "image"),
            Self::FileList => write!(f, "file_list"),
            Self::Unknown => write!(f, "unknown"),
        }
    }
}

impl std::str::FromStr for ClipboardContentType {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "text" => Self::Text,
            "image" => Self::Image,
            "file_list" => Self::FileList,
            _ => Self::Unknown,
        })
    }
}

/// Normalized clipboard entry
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClipboardEntry {
    pub id: String,
    pub content_type: ClipboardContentType,
    pub preview: String,
    pub content: Option<String>,
    pub created_at: i64,
    pub size_bytes: usize,
    pub source: Option<String>,
    pub possible_sensitive: bool,
}

impl ClipboardEntry {
    /// Create a bounded new text clipboard entry
    pub fn new_text(id: String, raw_text: &str, source: Option<String>) -> Self {
        let size_bytes = raw_text.len();
        let possible_sensitive = detect_possible_sensitive(raw_text);

        // Bounded content: strictly capped at MAX_CLIPBOARD_TEXT_SIZE
        let content = if raw_text.len() > MAX_CLIPBOARD_TEXT_SIZE {
            // Find a valid UTF-8 boundary at or before MAX_CLIPBOARD_TEXT_SIZE
            let mut end = MAX_CLIPBOARD_TEXT_SIZE;
            while end > 0 && !raw_text.is_char_boundary(end) {
                end -= 1;
            }
            Some(raw_text[..end].to_string())
        } else {
            Some(raw_text.to_string())
        };

        // Bounded preview: capped at MAX_PREVIEW_LENGTH characters, single-line trimmed
        let preview = generate_preview(raw_text, MAX_PREVIEW_LENGTH);

        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        Self {
            id,
            content_type: ClipboardContentType::Text,
            preview,
            content,
            created_at,
            size_bytes,
            source,
            possible_sensitive,
        }
    }

    /// Create metadata-only representation for non-text clipboard items
    pub fn new_metadata(
        id: String,
        content_type: ClipboardContentType,
        preview: String,
        size_bytes: usize,
        source: Option<String>,
    ) -> Self {
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        Self {
            id,
            content_type,
            preview: generate_preview(&preview, MAX_PREVIEW_LENGTH),
            content: None, // No raw binary or file content stored
            created_at,
            size_bytes,
            source,
            possible_sensitive: false,
        }
    }
}

/// Bounded status for clipboard service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardStatus {
    pub enabled: bool,
    pub total_entries: usize,
    pub max_entries: usize,
}

/// Generate a single-line, character-bounded preview string
pub fn generate_preview(text: &str, max_chars: usize) -> String {
    let collapsed: String = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let char_count = collapsed.chars().count();
    if char_count > max_chars {
        let mut truncated: String = collapsed.chars().take(max_chars).collect();
        truncated.push_str("...");
        truncated
    } else {
        collapsed
    }
}

/// Lightweight heuristic detection for sensitive data like passwords, API keys, tokens, or private keys.
/// Never logs or exposes the evaluated content.
pub fn detect_possible_sensitive(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    // 1. Private keys
    if trimmed.contains("BEGIN ") && trimmed.contains("PRIVATE KEY") {
        return true;
    }

    // 2. Common API key / token prefixes
    const SENSITIVE_PREFIXES: &[&str] = &[
        "ghp_",        // GitHub personal access token
        "gho_",        // GitHub OAuth access token
        "github_pat_", // GitHub fine-grained personal access token
        "glpat-",      // GitLab personal access token
        "xoxb-",       // Slack bot token
        "xoxp-",       // Slack user token
        "sk_live_",    // Stripe live secret key
        "pk_live_",    // Stripe live publishable key
        "AKIA",        // AWS Access Key ID
        "AIza",        // Google API Key
        "Bearer ",     // OAuth bearer token
        "basic ",      // Basic auth header
    ];

    for prefix in SENSITIVE_PREFIXES {
        if trimmed.starts_with(prefix) || trimmed.to_lowercase().starts_with(&prefix.to_lowercase())
        {
            return true;
        }
    }

    // 3. Known key-value password / secret patterns
    let lower = trimmed.to_lowercase();
    const PATTERNS: &[&str] = &[
        "password=",
        "password:",
        "passwd=",
        "api_key=",
        "apikey=",
        "secret=",
        "access_token=",
        "private_key=",
    ];

    for pattern in PATTERNS {
        if lower.contains(pattern) {
            return true;
        }
    }

    // 4. JWT tokens: starts with "eyJ" and has two dots
    if trimmed.starts_with("eyJ") && trimmed.matches('.').count() == 2 {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preview_generation() {
        let text = "Hello\nWorld\n\nThis is a test";
        let preview = generate_preview(text, 100);
        assert_eq!(preview, "Hello World This is a test");

        let long_text = "a".repeat(200);
        let preview_long = generate_preview(&long_text, 50);
        assert_eq!(preview_long.chars().count(), 53); // 50 chars + "..."
        assert!(preview_long.ends_with("..."));
    }

    #[test]
    fn test_sensitive_heuristics() {
        assert!(detect_possible_sensitive("ghp_1234567890abcdefABCDEF"));
        assert!(detect_possible_sensitive("AKIAIOSFODNN7EXAMPLE"));
        assert!(detect_possible_sensitive(
            "Bearer eyJhbGciOiJIUzI1NiJ9.test.sig"
        ));
        assert!(detect_possible_sensitive(
            "-----BEGIN RSA PRIVATE KEY-----\nMIIE..."
        ));
        assert!(detect_possible_sensitive(
            "db_user=admin&password=SuperSecret123!"
        ));
        assert!(!detect_possible_sensitive(
            "https://example.com/path/to/page"
        ));
        assert!(!detect_possible_sensitive("Just a standard copied note."));
    }

    #[test]
    fn test_bounded_new_text() {
        let massive_text = "x".repeat(100_000);
        let entry = ClipboardEntry::new_text("1".to_string(), &massive_text, None);
        assert_eq!(entry.size_bytes, 100_000);
        assert!(entry.content.is_some());
        assert_eq!(entry.content.unwrap().len(), MAX_CLIPBOARD_TEXT_SIZE);
        assert!(entry.preview.len() <= MAX_PREVIEW_LENGTH + 3);
    }
}
