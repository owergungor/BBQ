use crate::error::BbqResult;
use tracing_subscriber::{fmt, EnvFilter};

/// Initialize structured tracing for BBQ with privacy redaction awareness
pub fn init_logging() -> BbqResult<()> {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("bbq=info,warn"));

    // Formatter writing structured logs to stdout without sensitive PII
    let subscriber = fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .finish();

    // Set global default subscriber if not already set (ignores if already initialized)
    let _ = tracing::subscriber::set_global_default(subscriber);

    tracing::info!("BBQ core logging initialized");
    Ok(())
}

/// Helper function to safely redact user content in debug logs
pub fn redact_sensitive_string(input: &str) -> String {
    if input.is_empty() {
        "<empty>".to_string()
    } else {
        format!("<redacted len={}>", input.chars().count())
    }
}
