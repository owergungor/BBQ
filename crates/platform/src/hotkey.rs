use async_trait::async_trait;
use bbq_core::BbqResult;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HotkeyDefinition {
    pub id: String,
    pub key: String,            // e.g. "Space", "K"
    pub modifiers: Vec<String>, // e.g. ["Ctrl"] or ["Cmd"]
    pub display_str: String,    // e.g. "Ctrl+Space"
}

impl HotkeyDefinition {
    pub fn new(
        id: impl Into<String>,
        key: impl Into<String>,
        modifiers: Vec<String>,
        display_str: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            key: key.into(),
            modifiers,
            display_str: display_str.into(),
        }
    }

    /// Default global hotkey definition based on target OS
    pub fn default_command_surface() -> Self {
        #[cfg(target_os = "macos")]
        {
            Self {
                id: "global_command_surface".to_string(),
                key: "Space".to_string(),
                modifiers: vec!["Cmd".to_string()],
                display_str: "Cmd+Space".to_string(),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            Self {
                id: "global_command_surface".to_string(),
                key: "Space".to_string(),
                modifiers: vec!["Ctrl".to_string()],
                display_str: "Ctrl+Space".to_string(),
            }
        }
    }

    /// Parse a hotkey string like "Ctrl+Space" or "Cmd+Shift+K" into HotkeyDefinition
    pub fn from_display_string(id: impl Into<String>, s: &str) -> Self {
        let parts: Vec<&str> = s
            .split('+')
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .collect();
        if parts.is_empty() {
            return Self::default_command_surface();
        }
        let raw_key = parts.last().unwrap_or(&"Space");
        let key = if raw_key.eq_ignore_ascii_case("space") {
            "Space".to_string()
        } else if raw_key.len() == 1
            || ((raw_key.starts_with('f') || raw_key.starts_with('F')) && raw_key.len() <= 3)
        {
            raw_key.to_uppercase()
        } else {
            let mut c = raw_key.chars();
            match c.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + c.as_str(),
            }
        };

        let modifiers: Vec<String> = parts[..parts.len() - 1]
            .iter()
            .map(|m| {
                let lower = m.to_lowercase();
                match lower.as_str() {
                    "ctrl" | "control" => "Ctrl".to_string(),
                    "alt" | "option" => "Alt".to_string(),
                    "shift" => "Shift".to_string(),
                    "win" | "super" => "Win".to_string(),
                    "cmd" | "command" => "Cmd".to_string(),
                    "meta" => {
                        #[cfg(target_os = "macos")]
                        {
                            "Cmd".to_string()
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            "Win".to_string()
                        }
                    }
                    _ => m.to_string(),
                }
            })
            .collect();

        let display_str = if !modifiers.is_empty() {
            format!("{}+{}", modifiers.join("+"), key)
        } else {
            key.clone()
        };

        Self {
            id: id.into(),
            key,
            modifiers,
            display_str,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct HotkeyCapabilities {
    pub can_register: bool,
    pub can_unregister: bool,
    pub can_detect_conflicts: bool,
}

pub type HotkeyEventSink = Arc<dyn Fn(String) + Send + Sync>;

#[async_trait]
pub trait PlatformHotkey: Send + Sync {
    async fn register(&self, hotkey: &HotkeyDefinition) -> BbqResult<()>;
    async fn unregister(&self, id: &str) -> BbqResult<()>;
    async fn is_registered(&self, id: &str) -> BbqResult<bool>;
    async fn capabilities(&self) -> BbqResult<HotkeyCapabilities>;
    async fn subscribe(&self, sink: HotkeyEventSink) -> BbqResult<()>;
}
