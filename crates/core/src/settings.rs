use crate::error::{BbqError, BbqResult};
use serde::{Deserialize, Serialize};

pub const MIN_ISLAND_WIDTH: u32 = 64;
pub const MAX_ISLAND_WIDTH: u32 = 480;
pub const MIN_ISLAND_HEIGHT: u32 = 32;
pub const MAX_ISLAND_HEIGHT: u32 = 520;

pub const MIN_DOT_SIZE: u32 = 32;
pub const MAX_DOT_SIZE: u32 = 64;
pub const DEFAULT_DOT_SIZE: u32 = 38;

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
    "blue".to_string()
}

fn default_island_position() -> String {
    "top-center".to_string()
}

fn default_island_transparency() -> u32 {
    0
}

fn default_island_blur() -> u32 {
    20
}

fn default_island_blur_enabled() -> bool {
    true
}

fn default_always_on_top() -> bool {
    true
}

fn default_move_hud() -> bool {
    false
}

fn default_language() -> String {
    "en".to_string()
}

fn default_island_mode() -> String {
    "island".to_string()
}

fn default_island_vertical_position() -> String {
    "top".to_string()
}

fn default_dot_size() -> u32 {
    DEFAULT_DOT_SIZE
}

/// Strongly typed, persistent user preferences for BBQ
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BbqSettings {
    pub theme: ThemePreference,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default)]
    pub custom_accent_color: Option<String>,
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
    #[serde(default = "default_island_position")]
    pub island_position: String,
    #[serde(default = "default_island_transparency")]
    pub island_transparency: u32,
    #[serde(default = "default_island_blur")]
    pub island_blur: u32,
    #[serde(default = "default_island_blur_enabled")]
    pub island_blur_enabled: bool,
    #[serde(default = "default_always_on_top")]
    pub always_on_top: bool,
    #[serde(default = "default_move_hud")]
    pub move_hud: bool,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_island_mode")]
    pub island_mode: String,
    #[serde(default = "default_island_vertical_position")]
    pub island_vertical_position: String,
    #[serde(default = "default_dot_size")]
    pub dot_size: u32,
}

pub fn is_valid_hex_color(s: &str) -> bool {
    let s = s.trim();
    if !s.starts_with('#') {
        return false;
    }
    let hex = &s[1..];
    (hex.len() == 6 || hex.len() == 3) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

impl Default for BbqSettings {
    fn default() -> Self {
        #[cfg(target_os = "macos")]
        let default_hotkey = "Cmd+Space".to_string();
        #[cfg(not(target_os = "macos"))]
        let default_hotkey = "Ctrl+Space".to_string();

        Self {
            theme: ThemePreference::System,
            accent_color: "blue".to_string(),
            custom_accent_color: None,
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
            island_position: "top-center".to_string(),
            island_transparency: 0,
            island_blur: 20,
            island_blur_enabled: true,
            always_on_top: true,
            move_hud: false,
            language: "en".to_string(),
            island_mode: "island".to_string(),
            island_vertical_position: "top".to_string(),
            dot_size: DEFAULT_DOT_SIZE,
        }
    }
}

impl BbqSettings {
    /// Validates all fields against domain boundary limits
    pub fn validate(&self) -> BbqResult<()> {
        let accent_lower = self.accent_color.trim().to_lowercase();
        match accent_lower.as_str() {
            "blue" | "red" | "green" | "orange" | "yellow" | "pink" | "purple" | "indigo"
            | "teal" | "mint" | "cyan" | "custom" => {}
            _ => {
                if !is_valid_hex_color(&accent_lower) {
                    return Err(BbqError::Validation(format!(
                        "Invalid accent_color '{}'. Supported: blue, red, green, orange, yellow, pink, purple, indigo, teal, mint, cyan, custom, or #RRGGBB",
                        self.accent_color
                    )));
                }
            }
        }

        if let Some(ref custom) = self.custom_accent_color {
            if !custom.trim().is_empty() && !is_valid_hex_color(custom) {
                return Err(BbqError::Validation(format!(
                    "Invalid custom_accent_color '{}'. Expected format #RRGGBB",
                    custom
                )));
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

        let pos_lower = self.island_position.trim().to_lowercase();
        match pos_lower.as_str() {
            "top-center" | "top-left" | "top-right" | "center" | "center-center"
            | "center-left" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right" => {
            }
            _ => {
                return Err(BbqError::Validation(format!(
                    "Invalid island_position '{}'. Must be one of: top-center, top-left, top-right, center, center-left, center-right, bottom-left, bottom-center, bottom-right",
                    self.island_position
                )));
            }
        }

        let mode_lower = self.island_mode.trim().to_lowercase();
        match mode_lower.as_str() {
            "island" | "notch" | "dot" => {}
            _ => {
                return Err(BbqError::Validation(format!(
                    "Invalid island_mode '{}'. Must be one of: island, notch, dot",
                    self.island_mode
                )));
            }
        }

        let vert_lower = self.island_vertical_position.trim().to_lowercase();
        match vert_lower.as_str() {
            "top" | "center" | "bottom" => {}
            _ => {
                return Err(BbqError::Validation(format!(
                    "Invalid island_vertical_position '{}'. Must be one of: top, center, bottom",
                    self.island_vertical_position
                )));
            }
        }

        if !(MIN_DOT_SIZE..=MAX_DOT_SIZE).contains(&self.dot_size) {
            return Err(BbqError::Validation(format!(
                "dot_size {} out of bounds [32, 64]",
                self.dot_size
            )));
        }

        if self.island_transparency > 100 {
            return Err(BbqError::Validation(format!(
                "island_transparency {} out of bounds [0, 100]",
                self.island_transparency
            )));
        }

        if self.island_blur > 50 {
            return Err(BbqError::Validation(format!(
                "island_blur {} out of bounds [0, 50]",
                self.island_blur
            )));
        }

        let lang_lower = self.language.trim().to_lowercase();
        match lang_lower.as_str() {
            "en" | "es" | "fr" | "de" | "tr" => {}
            _ => {
                return Err(BbqError::Validation(format!(
                    "Invalid language '{}'. Must be one of: en, es, fr, de, tr",
                    self.language
                )));
            }
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
                "blue" | "red" | "green" | "orange" | "yellow" | "pink" | "purple" | "indigo"
                | "teal" | "mint" | "cyan" | "custom" => {}
                _ => {
                    if !is_valid_hex_color(&lower) {
                        return Err(BbqError::Validation(format!(
                            "Invalid accent_color '{}'. Supported: blue, red, green, orange, yellow, pink, purple, indigo, teal, mint, cyan, custom, or #RRGGBB",
                            value
                        )));
                    }
                }
            }
        }
        "custom_accent_color" => {
            let trimmed = value.trim();
            if !trimmed.is_empty() && trimmed != "null" && !is_valid_hex_color(trimmed) {
                return Err(BbqError::Validation(format!(
                    "Invalid custom_accent_color '{}'. Expected format #RRGGBB",
                    value
                )));
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
        | "onboarding_completed"
        | "island_blur_enabled" => {
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
        "island_position" => {
            let lower = value.trim().to_lowercase();
            match lower.as_str() {
                "top-center" | "top-left" | "top-right" | "center" | "center-center"
                | "center-left" | "center-right" | "bottom-left" | "bottom-center"
                | "bottom-right" => {}
                _ => {
                    return Err(BbqError::Validation(format!(
                        "Invalid island_position '{}'",
                        value
                    )));
                }
            }
        }
        "island_mode" => {
            let lower = value.trim().to_lowercase();
            match lower.as_str() {
                "island" | "notch" | "dot" => {}
                _ => {
                    return Err(BbqError::Validation(format!(
                        "Invalid island_mode '{}'. Must be one of: island, notch, dot",
                        value
                    )));
                }
            }
        }
        "island_vertical_position" => {
            let lower = value.trim().to_lowercase();
            match lower.as_str() {
                "top" | "center" | "bottom" => {}
                _ => {
                    return Err(BbqError::Validation(format!(
                        "Invalid island_vertical_position '{}'. Must be one of: top, center, bottom",
                        value
                    )));
                }
            }
        }
        "dot_size" => {
            let size: u32 = value.parse().map_err(|_| {
                BbqError::Validation(format!("Invalid integer for dot_size: '{}'", value))
            })?;
            if !(MIN_DOT_SIZE..=MAX_DOT_SIZE).contains(&size) {
                return Err(BbqError::Validation(format!(
                    "dot_size {} out of bounds [{}, {}]",
                    size, MIN_DOT_SIZE, MAX_DOT_SIZE
                )));
            }
        }
        "island_transparency" => {
            let tr: u32 = value.parse().map_err(|_| {
                BbqError::Validation(format!(
                    "Invalid integer for island_transparency: '{}'",
                    value
                ))
            })?;
            if tr > 100 {
                return Err(BbqError::Validation(format!(
                    "island_transparency {} out of bounds [0, 100]",
                    tr
                )));
            }
        }
        "island_blur" => {
            let blur: u32 = value.parse().map_err(|_| {
                BbqError::Validation(format!("Invalid integer for island_blur: '{}'", value))
            })?;
            if blur > 50 {
                return Err(BbqError::Validation(format!(
                    "island_blur {} out of bounds [0, 50]",
                    blur
                )));
            }
        }
        "always_on_top" => {
            let lower = value.trim().to_lowercase();
            if lower != "true" && lower != "false" {
                return Err(BbqError::Validation(format!(
                    "Invalid boolean for always_on_top: '{}'",
                    value
                )));
            }
        }
        "move_hud" => {
            let lower = value.trim().to_lowercase();
            if lower != "true" && lower != "false" {
                return Err(BbqError::Validation(format!(
                    "Invalid boolean for move_hud: '{}'",
                    value
                )));
            }
        }
        "language" => {
            let lower = value.trim().to_lowercase();
            match lower.as_str() {
                "en" | "es" | "fr" | "de" | "tr" => {}
                _ => {
                    return Err(BbqError::Validation(format!(
                        "Invalid language '{}'. Must be one of: en, es, fr, de, tr",
                        value
                    )));
                }
            }
        }
        "auto_update_schedule" | "last_update_check_at" => {
            // Obsolete settings keys accepted safely for backward compatibility with older persisted state
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
        let valid_min_width = BbqSettings {
            island_width: 64, // MIN_ISLAND_WIDTH (64)
            ..Default::default()
        };
        assert!(valid_min_width.validate().is_ok());

        let invalid = BbqSettings {
            island_width: 50, // Below MIN_ISLAND_WIDTH (64)
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
        assert!(validate_setting_entry("island_width", "64").is_ok());
        assert!(validate_setting_entry("island_width", "50").is_err());
        assert!(validate_setting_entry("island_width", "not_a_number").is_err());

        assert!(validate_setting_entry("reduced_motion", "true").is_ok());
        assert!(validate_setting_entry("reduced_motion", "false").is_ok());
        assert!(validate_setting_entry("reduced_motion", "yes").is_err());

        assert!(validate_setting_entry("disabled_widgets", "[\"notes\", \"network\"]").is_ok());
        assert!(validate_setting_entry("disabled_widgets", "not_json").is_err());

        // Accent color tests
        let valid_accents = [
            "blue", "red", "green", "orange", "yellow", "pink", "purple", "indigo", "teal", "mint",
            "cyan", "custom", "#007AFF", "#0A84FF", "#123",
        ];
        for accent in valid_accents {
            assert!(
                validate_setting_entry("accent_color", accent).is_ok(),
                "Expected '{}' to be valid",
                accent
            );
        }
        assert!(validate_setting_entry("accent_color", "invalid_color").is_err());
        assert!(validate_setting_entry("accent_color", "123456").is_err());

        assert!(validate_setting_entry("unknown_key", "value").is_err());
    }

    #[test]
    fn test_settings_default_accent_is_blue() {
        let settings = BbqSettings::default();
        assert_eq!(settings.accent_color, "blue");
    }

    #[test]
    fn test_v23_settings_defaults_and_validation() {
        let settings = BbqSettings::default();
        assert_eq!(settings.island_position, "top-center");
        assert_eq!(settings.island_transparency, 0);
        assert!(settings.always_on_top);

        // Position validation
        for pos in &[
            "top-center",
            "top-left",
            "top-right",
            "center",
            "center-center",
            "center-left",
            "center-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
        ] {
            assert!(validate_setting_entry("island_position", pos).is_ok());
        }
        assert!(validate_setting_entry("island_position", "invalid-position").is_err());
        assert!(validate_setting_entry("island_position", "").is_err());

        // Transparency validation (0..=100)
        assert!(validate_setting_entry("island_transparency", "0").is_ok());
        assert!(validate_setting_entry("island_transparency", "50").is_ok());
        assert!(validate_setting_entry("island_transparency", "100").is_ok());
        assert!(validate_setting_entry("island_transparency", "101").is_err());
        assert!(validate_setting_entry("island_transparency", "-1").is_err());

        // Blur validation (0..=50)
        assert_eq!(settings.island_blur, 20);
        assert!(settings.island_blur_enabled);
        assert!(validate_setting_entry("island_blur", "0").is_ok());
        assert!(validate_setting_entry("island_blur", "20").is_ok());
        assert!(validate_setting_entry("island_blur", "50").is_ok());
        assert!(validate_setting_entry("island_blur", "51").is_err());
        assert!(validate_setting_entry("island_blur", "-1").is_err());

        // Blur enabled switch validation
        assert!(validate_setting_entry("island_blur_enabled", "true").is_ok());
        assert!(validate_setting_entry("island_blur_enabled", "false").is_ok());
        assert!(validate_setting_entry("island_blur_enabled", "invalid").is_err());

        // Always on top validation
        assert!(validate_setting_entry("always_on_top", "true").is_ok());
        assert!(validate_setting_entry("always_on_top", "false").is_ok());
        assert!(validate_setting_entry("always_on_top", "invalid").is_err());

        // Move HUD validation
        assert!(!settings.move_hud);
        assert!(validate_setting_entry("move_hud", "true").is_ok());
        assert!(validate_setting_entry("move_hud", "false").is_ok());
        assert!(validate_setting_entry("move_hud", "invalid").is_err());

        // Obsolete auto-update keys are accepted safely for backward compatibility
        assert!(validate_setting_entry("auto_update_schedule", "startup").is_ok());
        assert!(validate_setting_entry("last_update_check_at", "1728000000").is_ok());

        // BBQ v4.0: island_mode, island_vertical_position, dot_size
        assert_eq!(settings.island_mode, "island");
        assert_eq!(settings.island_vertical_position, "top");
        assert_eq!(settings.dot_size, 38);

        assert!(validate_setting_entry("island_mode", "island").is_ok());
        assert!(validate_setting_entry("island_mode", "notch").is_ok());
        assert!(validate_setting_entry("island_mode", "dot").is_ok());
        assert!(validate_setting_entry("island_mode", "pill").is_err());

        assert!(validate_setting_entry("island_vertical_position", "top").is_ok());
        assert!(validate_setting_entry("island_vertical_position", "center").is_ok());
        assert!(validate_setting_entry("island_vertical_position", "bottom").is_ok());
        assert!(validate_setting_entry("island_vertical_position", "middle").is_err());

        assert!(validate_setting_entry("dot_size", "38").is_ok());
        assert!(validate_setting_entry("dot_size", "32").is_ok());
        assert!(validate_setting_entry("dot_size", "64").is_ok());
        assert!(validate_setting_entry("dot_size", "31").is_err());
        assert!(validate_setting_entry("dot_size", "65").is_err());
        assert!(validate_setting_entry("dot_size", "not_a_number").is_err());
    }
}
