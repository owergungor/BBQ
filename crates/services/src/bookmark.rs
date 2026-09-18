use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::BbqResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookmarkItem {
    pub id: String,
    pub title: String,
    pub url: String,
    pub favicon: Option<String>,
}

pub trait BookmarkServiceTrait: Service {
    fn list_bookmarks(&self) -> BbqResult<Vec<BookmarkItem>>;
}

/// BookmarkService serves as an intentionally reserved architectural marker service
/// within the BBQ ServiceRegistry (slot 15) for planned bookmark HUD functionality.
/// It maintains ServiceState::Inactive until full implementation.
#[derive(Debug, Default)]
pub struct BookmarkService;

#[async_trait]
impl Service for BookmarkService {
    fn name(&self) -> &'static str {
        "BookmarkService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing BookmarkService");
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

impl BookmarkServiceTrait for BookmarkService {
    fn list_bookmarks(&self) -> BbqResult<Vec<BookmarkItem>> {
        Ok(vec![])
    }
}
