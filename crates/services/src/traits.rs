use async_trait::async_trait;
use bbq_core::BbqResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ServiceState {
    #[default]
    Inactive,
    Sleeping,
    Active,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub name: &'static str,
    pub state: ServiceState,
    pub message: Option<String>,
}

#[async_trait]
pub trait Service: Send + Sync {
    /// Identifier name of the service
    fn name(&self) -> &'static str;

    /// Lifecycle hook: Initialize resources, database connections, and event handles
    async fn init(&self) -> BbqResult<()>;

    /// Lifecycle hook: Transition from Sleeping/Inactive to Active
    async fn start(&self) -> BbqResult<()>;

    /// Lifecycle hook: Release active listeners, halt work, sleep
    async fn stop(&self) -> BbqResult<()>;

    /// Health check query
    fn status(&self) -> ServiceStatus;
}
