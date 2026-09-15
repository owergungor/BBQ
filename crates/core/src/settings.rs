use crate::error::{BbqError, BbqResult};
use serde::{Deserialize, Serialize};

pub const MIN_ISLAND_WIDTH: u32 = 180;
pub const MAX_ISLAND_WIDTH: u32 = 640;
pub const MIN_ISLAND_HEIGHT: u32 = 36;
pub const MAX_ISLAND_HEIGHT: u32 = 520;

pub const MIN_CLIPBOARD_MAX_ENTRIES: usize = 10;
pub const MAX_CLIPBOARD_MAX_ENTRIES: usize = 100;
pub const MIN_CLIPBOARD_RETENTION_DAYS: u32 = 1;
pub const MAX_CLIPBOARD_RETENTION_DAYS: u32 = 90;

pub const MAX_DISABLED_WIDGETS: usize = 20;
pub const MAX_HOTKEY_LEN: usize = 32;
pub const MAX_TARGET_DISPLAY_LEN: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    #[default]
    System,
    Dark,
    Light,
}

impl std::fmt::Display for ThemePreference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::System => write!(f, "system"),
            Self::Dark => write!(f, "dark"),
            Self::Light => write!(f, "light"),
        }
    }
}

impl std::str::FromStr for ThemePreference {
    type Err = BbqError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "system" => Ok(Self::System),
            "dark" => Ok(Self::Dark),
            "light" => Ok(Self::Light),
            other => Err(BbqError::Validation(format!(
                "Invalid theme '{}', must be system, dark, or light",
                other
            ))),
        }
    }
}

fn default_accent_color() -> String {
    "orange".to_string()
}

/// Strongly typed, persistent user preferences for BBQ
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BbqSettings {
    pub theme: ThemePreference,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    pub reduced_motion: bool,
    pub island_width: u32,
    pub island_height: u32,
    pub target_display_id: Option<String>,
    pub auto_expand_on_event: bool,
    pub start_at_login: bool,
    pub global_hotkey: String,
    pub hotkey_enabled: bool,
    pub clipboard_history_enabled: bool,
    pub clipboard_retention_days: u32,
    pub clipboard_max_entries: usize,
    pub notifications_enabled: bool,
    pub timer_sound_enabled: bool,
    pub reminder_sound_enabled: bool,
    pub disabled_widgets: Vec<String>,
    pub compact_indicator_order: Vec<String>,
    pub first_run_completed: bool,
    pub onboarding_completed: bool,
}

impl Default for BbqSettings {
    fn default() -> Self {
        #[cfg(target_os = "macos")]
        let default_hotkey = "Cmd+Space".to_string();
        #[cfg(not(target_os = "macos"))]
        let default_hotkey = "Ctrl+Space".to_string();

        Self {
            theme: ThemePreference::System,
            accent_color: "orange".to_string(),
            reduced_motion: false,
            island_width: 240,
            island_height: 38,
            target_display_id: None,
            auto_expand_on_event: true,
            start_at_login: false,
            global_hotkey: default_hotkey,
            hotkey_enabled: true,
            clipboard_history_enabled: false,
            clipboard_retention_days: 30,
            clipboard_max_entries: 100,
            notifications_enabled: true,
            timer_sound_enabled: true,
            reminder_sound_enabled: true,
            disabled_widgets: Vec::new(),
            compact_indicator_order: Vec::new(),
            first_run_completed: false,
            onboarding_completed: false,
        }
    }
}

impl BbqSettings {
    /// Validates all fields against domain boundary limits
    pub fn validate(&self) -> BbqResult<()> {
        let accent_lower = self.accent_color.trim().to_lowercase();
        match accent_lower.as_str() {
            "orange" | "blue" | "purple" | "green" | "red" | "pink" | "cyan" => {}
            _ => {
                return Err(BbqError::Validation(format!(
                    "Invalid accent_color '{}'. Supported: orange, blue, purple, green, red, pink, cyan",
                    self.accent_color
                )))
            }
        }

        if !(MIN_ISLAND_WIDTH..=MAX_ISLAND_WIDTH).contains(&self.island_width) {
            return Err(BbqError::Validation(format!(
                "island_width {} out of bounds [{}, {}]",
                self.island_width, MIN_ISLAND_WIDTH, MAX_ISLAND_WIDTH
            )));
        }

        if !(MIN_ISLAND_HEIGHT..=MAX_ISLAND_HEIGHT).contains(&self.island_height) {
            return Err(BbqError::Validation(format!(
                "island_height {} out of bounds [{}, {}]",
                self.island_height, MIN_ISLAND_HEIGHT, MAX_ISLAND_HEIGHT
            )));
        }

        let hotkey_trimmed = self.global_hotkey.trim();
        if hotkey_trimmed.is_empty() || hotkey_trimmed.len() > MAX_HOTKEY_LEN {
            return Err(BbqError::Validation(format!(
                "global_hotkey length must be between 1 and {} characters",
                MAX_HOTKEY_LEN
            )));
        }

        if let Some(ref disp_id) = self.target_display_id {
            if disp_id.trim().len() > MAX_TARGET_DISPLAY_LEN {
                return Err(BbqError::Validation(format!(
                    "target_display_id length exceeds maximum of {}",
                    MAX_TARGET_DISPLAY_LEN
                )));
            }
        }

        if !(MIN_CLIPBOARD_MAX_ENTRIES..=MAX_CLIPBOARD_MAX_ENTRIES)
            .contains(&self.clipboard_max_entries)
        {
            return Err(BbqError::Validation(format!(
                "clipboard_max_entries {} out of bounds [{}, {}]",
                self.clipboard_max_entries, MIN_CLIPBOARD_MAX_ENTRIES, MAX_CLIPBOARD_MAX_ENTRIES
            )));
        }

        if !(MIN_CLIPBOARD_RETENTION_DAYS..=MAX_CLIPBOARD_RETENTION_DAYS)
            .contains(&self.clipboard_retention_days)
        {
            return Err(BbqError::Validation(format!(
                "clipboard_retention_days {} out of bounds [{}, {}]",
                self.clipboard_retention_days,
                MIN_CLIPBOARD_RETENTION_DAYS,
                MAX_CLIPBOARD_RETENTION_DAYS
            )));
        }

        if self.disabled_widgets.len() > MAX_DISABLED_WIDGETS {
            return Err(BbqError::Validation(format!(
                "disabled_widgets list size {} exceeds limit of {}",
                self.disabled_widgets.len(),
                MAX_DISABLED_WIDGETS
            )));
        }

        Ok(())
    }
}

/// Validates an individual key-value setting update from IPC or storage
pub fn validate_setting_entry(key: &str, value: &str) -> BbqResult<()> {
    match key {
        "theme" => {
            let _: ThemePreference = value.parse()?;
        }
        "accent_color" => {
            let lower = value.trim().to_lowercase();
            match lower.as_str() {
                "orange" | "blue" | "purple" | "green" | "red" | "pink" | "cyan" => {}
                _ => {
                    return Err(BbqError::Validation(format!(
                        "Invalid accent_color '{}'. Supported: orange, blue, purple, green, red, pink, cyan",
                        value
                    )));
                }
            }
        }
        "reduced_motion"
        | "auto_expand_on_event"
        | "start_at_login"
        | "hotkey_enabled"
        | "clipboard_history_enabled"
        | "notifications_enabled"
        | "timer_sound_enabled"
        | "reminder_sound_enabled"
        | "first_run_completed"
        | "onboarding_completed" => {
            if value != "true" && value != "false" {
                return Err(BbqError::Validation(format!(
                    "Boolean setting '{}' must be 'true' or 'false', got '{}'",
                    key, value
                )));
            }
        }
        "island_width" => {
            let num: u32 = value.parse().map_err(|_| {
                BbqError::Validation(format!("Invalid integer for island_width: '{}'", value))
            })?;
            if !(MIN_ISLAND_WIDTH..=MAX_ISLAND_WIDTH).contains(&num) {
                return Err(BbqError::Validation(format!(
                    "island_width {} out of bounds [{}, {}]",
                    num, MIN_ISLAND_WIDTH, MAX_ISLAND_WIDTH
                )));
            }
        }
        "island_height" => {
            let num: u32 = value.parse().map_err(|_| {
                BbqError::Validation(format!("Invalid integer for island_height: '{}'", value))
            })?;
            if !(MIN_ISLAND_HEIGHT..=MAX_ISLAND_HEIGHT).contains(&num) {
                return Err(BbqError::Validation(format!(
                    "island_height {} out of bounds [{}, {}]",
                    num, MIN_ISLAND_HEIGHT, MAX_ISLAND_HEIGHT
                )));
            }
        }
        "global_hotkey" => {
            let trimmed = value.trim();
            if trimmed.is_empty() || trimmed.len() > MAX_HOTKEY_LEN {
                return Err(BbqError::Validation(format!(
                    "global_hotkey length must be between 1 and {} characters",
                    MAX_HOTKEY_LEN
                )));
            }
        }
        "target_display_id" => {
            if value.trim().len() > MAX_TARGET_DISPLAY_LEN {
                return Err(BbqError::Validation(format!(
                    "target_display_id length exceeds maximum of {}",
                    MAX_TARGET_DISPLAY_LEN
                )));
            }
        }
        "clipboard_max_entries" => {
            let num: usize = value.parse().map_err(|_| {
                BbqError::Validation(format!(
                    "Invalid integer for clipboard_max_entries: '{}'",
                    value
                ))
            })?;
            if !(MIN_CLIPBOARD_MAX_ENTRIES..=MAX_CLIPBOARD_MAX_ENTRIES).contains(&num) {
                return Err(BbqError::Validation(format!(
                    "clipboard_max_entries {} out of bounds [{}, {}]",
                    num, MIN_CLIPBOARD_MAX_ENTRIES, MAX_CLIPBOARD_MAX_ENTRIES
                )));
            }
        }
        "clipboard_retention_days" => {
            let num: u32 = value.parse().map_err(|_| {
                BbqError::Validation(format!(
                    "Invalid integer for clipboard_retention_days: '{}'",
                    value
                ))
            })?;
            if !(MIN_CLIPBOARD_RETENTION_DAYS..=MAX_CLIPBOARD_RETENTION_DAYS).contains(&num) {
                return Err(BbqError::Validation(format!(
                    "clipboard_retention_days {} out of bounds [{}, {}]",
                    num, MIN_CLIPBOARD_RETENTION_DAYS, MAX_CLIPBOARD_RETENTION_DAYS
                )));
            }
        }
        "disabled_widgets" | "compact_indicator_order" => {
            // Must be valid JSON array of strings
            let list: Vec<String> = serde_json::from_str(value).map_err(|e| {
                BbqError::Validation(format!("Invalid JSON array for '{}': {}", key, e))
            })?;
            if list.len() > MAX_DISABLED_WIDGETS {
                return Err(BbqError::Validation(format!(
                    "List '{}' length {} exceeds limit of {}",
                    key,
                    list.len(),
                    MAX_DISABLED_WIDGETS
                )));
            }
        }
        unknown => {
            return Err(BbqError::Validation(format!(
                "Unknown setting key '{}'",
                unknown
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_defaults_and_validation() {
        let settings = BbqSettings::default();
        assert!(settings.validate().is_ok());
        assert_eq!(settings.theme, ThemePreference::System);
        assert_eq!(settings.island_width, 240);
        assert_eq!(settings.island_height, 38);
        assert_eq!(settings.clipboard_max_entries, 100);
        assert!(!settings.clipboard_history_enabled);
    }

    #[test]
    fn test_validation_bounds_rejection() {
        let invalid = BbqSettings {
            island_width: 100, // Below MIN_ISLAND_WIDTH (180)
            ..Default::default()
        };
        assert!(invalid.validate().is_err());

        let invalid2 = BbqSettings {
            clipboard_max_entries: 500, // Above MAX (100)
            ..Default::default()
        };
        assert!(invalid2.validate().is_err());

        let invalid3 = BbqSettings {
            global_hotkey: "a".repeat(40), // Exceeds MAX_HOTKEY_LEN (32)
            ..Default::default()
        };
        assert!(invalid3.validate().is_err());
    }

    #[test]
    fn test_single_setting_validation() {
        assert!(validate_setting_entry("theme", "dark").is_ok());
        assert!(validate_setting_entry("theme", "light").is_ok());
        assert!(validate_setting_entry("theme", "system").is_ok());
        assert!(validate_setting_entry("theme", "invalid_theme").is_err());

        assert!(validate_setting_entry("island_width", "250").is_ok());
        assert!(validate_setting_entry("island_width", "100").is_err());
        assert!(validate_setting_entry("island_width", "not_a_number").is_err());

        assert!(validate_setting_entry("reduced_motion", "true").is_ok());
        assert!(validate_setting_entry("reduced_motion", "false").is_ok());
        assert!(validate_setting_entry("reduced_motion", "yes").is_err());

        assert!(validate_setting_entry("disabled_widgets", "[\"notes\", \"network\"]").is_ok());
        assert!(validate_setting_entry("disabled_widgets", "not_json").is_err());

        assert!(validate_setting_entry("unknown_key", "value").is_err());
    }
}
