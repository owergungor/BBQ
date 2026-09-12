use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::BbqResult;
use bbq_platform::PlatformNetwork;
use std::sync::Arc;

#[async_trait]
pub trait NetworkServiceTrait: Service {
    async fn is_connected(&self) -> BbqResult<bool>;
}

pub struct NetworkService {
    platform: Arc<dyn PlatformNetwork>,
}

impl std::fmt::Debug for NetworkService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NetworkService").finish()
    }
}

impl NetworkService {
    pub fn new(platform: Arc<dyn PlatformNetwork>) -> Self {
        Self { platform }
    }
}

#[async_trait]
impl Service for NetworkService {
    fn name(&self) -> &'static str {
        "NetworkService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing NetworkService");
        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        Ok(())
    }

    fn status(&self) -> ServiceStatus {
        ServiceStatus {
            name: self.name(),
            state: ServiceState::Active,
            message: None,
        }
    }
}

#[async_trait]
impl NetworkServiceTrait for NetworkService {
    async fn is_connected(&self) -> BbqResult<bool> {
        self.platform.is_connected().await
    }
}
