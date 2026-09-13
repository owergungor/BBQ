use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{events::DisplayChangedEvent, BbqEvent, BbqResult};
use bbq_platform::{DisplayInfo, PlatformDisplay, PlatformDisplayEvent};
use std::sync::{Arc, Mutex};

pub type DisplayServiceEventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;

pub use bbq_platform::DisplayCapabilities;

#[async_trait]
pub trait DisplayServiceTrait: Service {
    async fn list_displays(&self) -> BbqResult<Vec<DisplayInfo>>;
    async fn get_primary_display(&self) -> BbqResult<DisplayInfo>;
    async fn get_active_display(&self) -> BbqResult<DisplayInfo>;
    async fn get_target_display(&self, display_id: Option<&str>) -> BbqResult<DisplayInfo>;
    fn capabilities(&self) -> DisplayCapabilities;
    async fn subscribe_events(&self, sink: DisplayServiceEventSink) -> BbqResult<()>;
}

pub struct DisplayService {
    platform: Arc<dyn PlatformDisplay>,
    subscribers: Arc<Mutex<Vec<DisplayServiceEventSink>>>,
}

impl std::fmt::Debug for DisplayService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DisplayService").finish()
    }
}

impl DisplayService {
    pub fn new(platform: Arc<dyn PlatformDisplay>) -> Self {
        Self {
            platform,
            subscribers: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[async_trait]
impl Service for DisplayService {
    fn name(&self) -> &'static str {
        "DisplayService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing DisplayService");
        let subs = self.subscribers.clone();
        let _ = self.platform.subscribe(Arc::new(move |event| {
            let sinks = subs.lock().map(|s| s.clone()).unwrap_or_default();
            match event {
                PlatformDisplayEvent::DisplaysChanged(displays) => {
                    let primary_id = displays
                        .iter()
                        .find(|d| d.is_primary)
                        .map(|d| d.id.clone())
                        .unwrap_or_default();
                    let ev = BbqEvent::DisplayChanged(DisplayChangedEvent {
                        display_count: displays.len(),
                        primary_display_id: primary_id,
                    });
                    for sink in &sinks {
                        sink(ev.clone());
                    }
                }
                PlatformDisplayEvent::ActiveDisplayChanged(display) => {
                    let ev = BbqEvent::DisplayChanged(DisplayChangedEvent {
                        display_count: 1,
                        primary_display_id: display.id,
                    });
                    for sink in &sinks {
                        sink(ev.clone());
                    }
                }
            }
        }));
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
impl DisplayServiceTrait for DisplayService {
    async fn list_displays(&self) -> BbqResult<Vec<DisplayInfo>> {
        self.platform.get_displays().await
    }

    async fn get_primary_display(&self) -> BbqResult<DisplayInfo> {
        self.platform.get_primary_display().await
    }

    async fn get_active_display(&self) -> BbqResult<DisplayInfo> {
        self.platform.get_active_display().await
    }

    async fn get_target_display(&self, display_id: Option<&str>) -> BbqResult<DisplayInfo> {
        let displays = self.platform.get_displays().await?;
        if let Some(id) = display_id {
            if let Some(disp) = displays.iter().find(|d| d.id == id) {
                return Ok(disp.clone());
            }
        }
        self.get_primary_display().await
    }

    fn capabilities(&self) -> DisplayCapabilities {
        self.platform.capabilities()
    }

    async fn subscribe_events(&self, sink: DisplayServiceEventSink) -> BbqResult<()> {
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(sink);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_core::DisplayRect;
    use bbq_platform::MockDisplay;

    fn sample_monitors() -> Vec<DisplayInfo> {
        vec![
            DisplayInfo {
                id: "disp_1".to_string(),
                name: "Primary Monitor".to_string(),
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
            },
            DisplayInfo {
                id: "disp_2".to_string(),
                name: "Secondary Left Monitor".to_string(),
                is_primary: false,
                scale_factor: 1.25,
                bounds: DisplayRect {
                    x: -1920,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
                work_area: DisplayRect {
                    x: -1920,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
            },
        ]
    }

    #[tokio::test]
    async fn test_display_service_list_and_primary() {
        let mock = Arc::new(MockDisplay::default());
        mock.set_displays(sample_monitors());

        let service = DisplayService::new(mock);
        service.init().await.expect("Init must succeed");

        let list = service.list_displays().await.expect("List displays");
        assert_eq!(list.len(), 2);

        let primary = service.get_primary_display().await.expect("Primary");
        assert_eq!(primary.id, "disp_1");
        assert!(primary.is_primary);
    }

    #[tokio::test]
    async fn test_display_service_target_display() {
        let mock = Arc::new(MockDisplay::default());
        mock.set_displays(sample_monitors());

        let service = DisplayService::new(mock);

        // Found target
        let target = service
            .get_target_display(Some("disp_2"))
            .await
            .expect("Target disp_2");
        assert_eq!(target.id, "disp_2");
        assert_eq!(target.bounds.x, -1920);

        // Fallback to primary
        let fallback = service
            .get_target_display(Some("non_existent"))
            .await
            .expect("Fallback to primary");
        assert_eq!(fallback.id, "disp_1");
    }

    #[tokio::test]
    async fn test_display_service_events_subscription() {
        let mock = Arc::new(MockDisplay::default());
        let service = DisplayService::new(mock.clone());
        service.init().await.expect("Init must succeed");

        let received = Arc::new(Mutex::new(Vec::new()));
        let recv_clone = received.clone();

        service
            .subscribe_events(Arc::new(move |ev| {
                if let BbqEvent::DisplayChanged(info) = ev {
                    recv_clone.lock().unwrap().push(info);
                }
            }))
            .await
            .expect("Subscribe events");

        // Simulate displays changed in mock
        mock.set_displays(sample_monitors());

        let events = received.lock().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].display_count, 2);
        assert_eq!(events[0].primary_display_id, "disp_1");
    }
}
