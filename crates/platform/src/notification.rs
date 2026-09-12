use bbq_core::{BbqResult, NotificationCapabilities, NotificationRequest};

/// Low-level platform notification abstraction
pub trait PlatformNotification: Send + Sync {
    /// Initialize the native notification subsystem if needed
    fn initialize(&self) -> BbqResult<()>;

    /// Query capabilities of the desktop notification platform
    fn capabilities(&self) -> BbqResult<NotificationCapabilities>;

    /// Deliver a notification request to the desktop environment
    fn notify(&self, request: &NotificationRequest) -> BbqResult<()>;
}
