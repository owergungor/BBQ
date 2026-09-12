use crate::error::{BbqError, BbqResult};
use std::path::PathBuf;

/// Standard directory layout for BBQ across supported operating systems
#[derive(Debug, Clone)]
pub struct AppDirectories {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub logs_dir: PathBuf,
}

impl AppDirectories {
    /// Resolve standard OS paths for BBQ without hardcoded paths
    pub fn resolve() -> BbqResult<Self> {
        let base_dir = Self::resolve_base_dir()?;
        let app_dir = base_dir.join("BBQ");

        let config_dir = app_dir.join("config");
        let data_dir = app_dir.join("data");
        let cache_dir = app_dir.join("cache");
        let logs_dir = app_dir.join("logs");

        Ok(Self {
            config_dir,
            data_dir,
            cache_dir,
            logs_dir,
        })
    }

    /// Ensure all required application directories exist on disk
    pub fn ensure_created(&self) -> BbqResult<()> {
        for dir in [
            &self.config_dir,
            &self.data_dir,
            &self.cache_dir,
            &self.logs_dir,
        ] {
            if !dir.exists() {
                std::fs::create_dir_all(dir).map_err(|e| {
                    BbqError::Io(format!(
                        "Failed to create directory {}: {}",
                        dir.display(),
                        e
                    ))
                })?;
            }
        }
        Ok(())
    }

    fn resolve_base_dir() -> BbqResult<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                return Ok(PathBuf::from(appdata));
            }
            if let Ok(userprofile) = std::env::var("USERPROFILE") {
                return Ok(PathBuf::from(userprofile).join("AppData").join("Roaming"));
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(home) = std::env::var("HOME") {
                return Ok(PathBuf::from(home)
                    .join("Library")
                    .join("Application Support"));
            }
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
                return Ok(PathBuf::from(xdg));
            }
            if let Ok(home) = std::env::var("HOME") {
                return Ok(PathBuf::from(home).join(".local").join("share"));
            }
        }

        // Fallback for portable / testing environments
        std::env::current_dir()
            .map(|p| p.join(".bbq_data"))
            .map_err(|e| BbqError::Config(format!("Could not determine base directory: {}", e)))
    }
}
