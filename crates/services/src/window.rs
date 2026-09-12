use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::BbqResult;
use bbq_platform::{DisplayInfo, PlatformWindow};
use std::sync::Arc;

#[async_trait]
pub trait WindowServiceTrait: Service {
    async fn position_island(
        &self,
        display: &DisplayInfo,
        width: u32,
        height: u32,
    ) -> BbqResult<()>;
    async fn apply_geometry(&self, geometry: &bbq_core::IslandGeometry) -> BbqResult<()>;
    async fn set_interactive(&self, interactive: bool) -> BbqResult<()>;
}

pub struct WindowService {
    platform: Arc<dyn PlatformWindow>,
}

impl std::fmt::Debug for WindowService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WindowService").finish()
    }
}

impl WindowService {
    pub fn new(platform: Arc<dyn PlatformWindow>) -> Self {
        Self { platform }
    }
}

#[async_trait]
impl Service for WindowService {
    fn name(&self) -> &'static str {
        "WindowService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing WindowService");
        self.platform.set_always_on_top(true).await?;
        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        self.platform.set_visible(true).await
    }

    async fn stop(&self) -> BbqResult<()> {
        self.platform.set_visible(false).await
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
impl WindowServiceTrait for WindowService {
    async fn position_island(
        &self,
        display: &DisplayInfo,
        width: u32,
        height: u32,
    ) -> BbqResult<()> {
        // Center horizontally on display work area, pinned to top
        let x = display.work_area.x + ((display.work_area.width as i32 - width as i32) / 2);
        let y = display.work_area.y;

        self.platform.set_size(width, height).await?;
        self.platform.set_position(x, y).await?;
        Ok(())
    }

    async fn apply_geometry(&self, geometry: &bbq_core::IslandGeometry) -> BbqResult<()> {
        self.platform
            .set_size(geometry.width, geometry.height)
            .await?;
        self.platform.set_position(geometry.x, geometry.y).await?;
        Ok(())
    }

    async fn set_interactive(&self, interactive: bool) -> BbqResult<()> {
        self.platform.set_interactive(interactive).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_core::{DisplayRect, IslandAnchor, IslandGeometry};
    use bbq_platform::MockWindow;

    #[tokio::test]
    async fn test_window_service_apply_geometry() {
        let mock_window = Arc::new(MockWindow::default());
        let service = WindowService::new(mock_window.clone());

        service.init().await.expect("Init must succeed");
        assert!(*mock_window.always_on_top.lock().unwrap());

        let geo = IslandGeometry {
            x: -1080,
            y: 6,
            width: 320,
            height: 48,
            anchor: IslandAnchor::TopCenter,
            display_id: "secondary_left".to_string(),
            scale_factor: 1.25,
        };

        service.apply_geometry(&geo).await.expect("Apply geometry");

        let pos = *mock_window.position.lock().unwrap();
        assert_eq!(pos, (-1080, 6));

        let size = *mock_window.size.lock().unwrap();
        assert_eq!(size, (320, 48));
    }

    #[tokio::test]
    async fn test_window_service_position_island() {
        let mock_window = Arc::new(MockWindow::default());
        let service = WindowService::new(mock_window.clone());

        let display = DisplayInfo {
            id: "primary".to_string(),
            name: "Primary".to_string(),
            is_primary: true,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            },
        };

        service
            .position_island(&display, 420, 48)
            .await
            .expect("Position island");

        // (1920 - 420) / 2 = 750
        let pos = *mock_window.position.lock().unwrap();
        assert_eq!(pos, (750, 0));
        let size = *mock_window.size.lock().unwrap();
        assert_eq!(size, (420, 48));
    }
}
