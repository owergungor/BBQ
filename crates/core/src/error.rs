use serde::{Serialize, Serializer};
use thiserror::Error;

/// BBQ central error type covering domain and infrastructure failures.
#[derive(Error, Debug, Clone)]
pub enum BbqError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Platform error: {0}")]
    Platform(String),

    #[error("Service error [{service}]: {message}")]
    Service {
        service: &'static str,
        message: String,
    },

    #[error("IPC communication error: {0}")]
    Ipc(String),

    #[error("I/O error: {0}")]
    Io(String),

    #[error("Migration error: {0}")]
    Migration(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Feature not supported on current platform: {0}")]
    NotSupported(String),
}

impl Serialize for BbqError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type BbqResult<T> = Result<T, BbqError>;
