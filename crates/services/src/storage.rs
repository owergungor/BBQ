use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::BbqResult;
use bbq_storage::DatabaseManager;
use std::sync::Arc;

pub trait StorageServiceTrait: Service {
    fn database(&self) -> &DatabaseManager;
}

pub struct StorageService {
    db: Arc<DatabaseManager>,
}

impl std::fmt::Debug for StorageService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StorageService").finish()
    }
}

impl StorageService {
    pub fn new(db: Arc<DatabaseManager>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl Service for StorageService {
    fn name(&self) -> &'static str {
        "StorageService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing StorageService");
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

impl StorageServiceTrait for StorageService {
    fn database(&self) -> &DatabaseManager {
        &self.db
    }
}
