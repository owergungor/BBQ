use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::BbqResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickNote {
    pub id: String,
    pub title: String,
    pub updated_at: u64,
}

pub trait NotesServiceTrait: Service {
    fn list_recent_notes(&self) -> BbqResult<Vec<QuickNote>>;
}

#[derive(Debug, Default)]
pub struct NotesService;

#[async_trait]
impl Service for NotesService {
    fn name(&self) -> &'static str {
        "NotesService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing NotesService");
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
            state: ServiceState::Inactive,
            message: None,
        }
    }
}

impl NotesServiceTrait for NotesService {
    fn list_recent_notes(&self) -> BbqResult<Vec<QuickNote>> {
        Ok(vec![])
    }
}
