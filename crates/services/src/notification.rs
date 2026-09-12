use crate::settings::SettingsServiceTrait;
use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{
    BbqError, BbqEvent, BbqResult, NotificationCapabilities, NotificationCategory,
    NotificationRequest,
};
use bbq_platform::PlatformNotification;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

pub const MAX_RECENT_DEDUPLICATION_IDS: usize = 50;

pub type NotificationEventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;

#[async_trait]
pub trait NotificationServiceTrait: Service {
    fn capabilities(&self) -> BbqResult<NotificationCapabilities>;
    fn notify(&self, request: NotificationRequest) -> BbqResult<()>;
    fn subscribe_events(&self, sink: NotificationEventSink) -> BbqResult<()>;
    fn show_notification(&self, title: &str, body: &str) -> BbqResult<()>;
}

pub struct NotificationService {
    platform: Arc<dyn PlatformNotification>,
    settings: Option<Arc<dyn SettingsServiceTrait>>,
    recent_ids: Arc<Mutex<VecDeque<String>>>,
    event_sink: Arc<Mutex<Option<NotificationEventSink>>>,
}

impl std::fmt::Debug for NotificationService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NotificationService").finish()
    }
}

impl NotificationService {
    pub fn new(
        platform: Arc<dyn PlatformNotification>,
        settings: Option<Arc<dyn SettingsServiceTrait>>,
    ) -> Self {
        Self {
            platform,
            settings,
            recent_ids: Arc::new(Mutex::new(VecDeque::with_capacity(
                MAX_RECENT_DEDUPLICATION_IDS,
            ))),
            event_sink: Arc::new(Mutex::new(None)),
        }
    }

    fn is_duplicate(&self, id: &str) -> bool {
        if let Ok(guard) = self.recent_ids.lock() {
            guard.contains(&id.to_string())
        } else {
            false
        }
    }

    fn record_delivered_id(&self, id: String) {
        if let Ok(mut guard) = self.recent_ids.lock() {
            if guard.len() >= MAX_RECENT_DEDUPLICATION_IDS {
                guard.pop_front();
            }
            guard.push_back(id);
        }
    }

    fn emit_event(&self, event: BbqEvent) {
        if let Ok(sink_guard) = self.event_sink.lock() {
            if let Some(ref sink) = *sink_guard {
                sink(event);
            }
        }
    }
}

#[async_trait]
impl Service for NotificationService {
    fn name(&self) -> &'static str {
        "NotificationService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing NotificationService");
        self.platform.initialize()
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
impl NotificationServiceTrait for NotificationService {
    fn capabilities(&self) -> BbqResult<NotificationCapabilities> {
        self.platform.capabilities()
    }

    fn notify(&self, request: NotificationRequest) -> BbqResult<()> {
        request.validate()?;

        // If user disabled notifications in settings, suppress immediately without platform call
        if let Some(ref settings) = self.settings {
            if let Ok(app_settings) = settings.get_settings() {
                if !app_settings.notifications_enabled {
                    tracing::debug!(
                        "Notification suppressed because notifications_enabled is false"
                    );
                    return Ok(());
                }
            }
        }

        // Lightweight duplicate suppression
        if self.is_duplicate(&request.id) {
            tracing::debug!("Suppressed duplicate notification with ID '{}'", request.id);
            return Ok(());
        }

        self.emit_event(BbqEvent::NotificationRequested(request.clone()));

        // Query platform capability
        let caps = self.platform.capabilities()?;
        if !caps.available {
            self.emit_event(BbqEvent::NotificationUnavailable(request.clone()));
            return Err(BbqError::Platform(
                "Desktop notification subsystem is currently unavailable".to_string(),
            ));
        }

        match self.platform.notify(&request) {
            Ok(()) => {
                self.record_delivered_id(request.id.clone());
                self.emit_event(BbqEvent::NotificationDelivered(request));
                Ok(())
            }
            Err(e) => {
                self.emit_event(BbqEvent::NotificationUnavailable(request));
                Err(e)
            }
        }
    }

    fn subscribe_events(&self, sink: NotificationEventSink) -> BbqResult<()> {
        if let Ok(mut guard) = self.event_sink.lock() {
            *guard = Some(sink);
        }
        Ok(())
    }

    fn show_notification(&self, title: &str, body: &str) -> BbqResult<()> {
        let id = format!(
            "notif_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );
        let request = NotificationRequest::new(id, NotificationCategory::General, title, body)?;
        self.notify(request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_platform::MockNotification;

    #[test]
    fn test_notification_service_duplicate_suppression() {
        let mock = Arc::new(MockNotification::default());
        let service = NotificationService::new(mock.clone(), None);

        let req = NotificationRequest::new(
            "dup-1",
            NotificationCategory::Timer,
            "Timer Done",
            "Countdown completed",
        )
        .unwrap();

        // First delivery should succeed
        assert!(service.notify(req.clone()).is_ok());
        assert_eq!(mock.notification_count(), 1);

        // Immediate duplicate should be suppressed
        assert!(service.notify(req).is_ok());
        assert_eq!(mock.notification_count(), 1);
    }

    #[test]
    fn test_notification_service_bounded_deduplication() {
        let mock = Arc::new(MockNotification::default());
        let service = NotificationService::new(mock.clone(), None);

        // Send 50 distinct notifications
        for i in 0..50 {
            let req = NotificationRequest::new(
                format!("id-{}", i),
                NotificationCategory::General,
                format!("Title {}", i),
                "Body",
            )
            .unwrap();
            assert!(service.notify(req).is_ok());
        }
        assert_eq!(mock.notification_count(), 50);

        // Send 51st notification, which should evict "id-0"
        let req_50 =
            NotificationRequest::new("id-50", NotificationCategory::General, "Title 50", "Body")
                .unwrap();
        assert!(service.notify(req_50).is_ok());
        assert_eq!(mock.notification_count(), 51);

        // "id-0" can now be accepted again
        let req_0 = NotificationRequest::new(
            "id-0",
            NotificationCategory::General,
            "Title 0 again",
            "Body",
        )
        .unwrap();
        assert!(service.notify(req_0).is_ok());
        assert_eq!(mock.notification_count(), 52);
    }

    #[test]
    fn test_notification_service_unavailable_handling() {
        let mock = Arc::new(MockNotification::default());
        mock.set_available(false);

        let service = NotificationService::new(mock.clone(), None);
        let req = NotificationRequest::new(
            "unavail-1",
            NotificationCategory::System,
            "Battery Low",
            "10% remaining",
        )
        .unwrap();

        let res = service.notify(req);
        assert!(res.is_err());
        assert_eq!(mock.notification_count(), 0);
    }
}
