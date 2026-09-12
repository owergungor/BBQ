use async_trait::async_trait;
use bbq_core::{BbqResult, LauncherAction, LauncherCapabilities};

#[async_trait]
pub trait PlatformLauncher: Send + Sync {
    async fn initialize(&self) -> BbqResult<()>;
    async fn capabilities(&self) -> BbqResult<LauncherCapabilities>;
    async fn launch(&self, action: &LauncherAction) -> BbqResult<()>;
    async fn open_file(&self, path: &str) -> BbqResult<()>;
    async fn open_folder(&self, path: &str) -> BbqResult<()>;
    async fn open_url(&self, url: &str) -> BbqResult<()>;
    async fn open_application(&self, id: &str) -> BbqResult<()>;
}
