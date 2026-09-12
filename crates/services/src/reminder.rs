use crate::notification::{NotificationService, NotificationServiceTrait};
use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{
    BbqError, BbqEvent, BbqResult, NotificationCategory, NotificationRequest, Reminder,
    ReminderState,
};
use bbq_storage::ReminderRepository;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::oneshot;

pub const MAX_STARTUP_OVERDUE_NOTIFICATIONS: usize = 10;

pub type ReminderEventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;
pub type TimeProvider = Arc<dyn Fn() -> u64 + Send + Sync>;

fn system_time_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[async_trait]
pub trait ReminderServiceTrait: Service {
    async fn create_reminder(
        &self,
        title: &str,
        body: Option<String>,
        due_at: u64,
    ) -> BbqResult<Reminder>;
    async fn cancel_reminder(&self, id: &str) -> BbqResult<Reminder>;
    async fn list_reminders(&self) -> BbqResult<Vec<Reminder>>;
    async fn get_reminder(&self, id: &str) -> BbqResult<Option<Reminder>>;
    async fn clear_fired(&self) -> BbqResult<()>;
    fn subscribe_events(&self, sink: ReminderEventSink) -> BbqResult<()>;
}

#[derive(Clone)]
pub struct ReminderService {
    storage: Option<Arc<dyn ReminderRepository>>,
    notification: Arc<NotificationService>,
    reminders: Arc<Mutex<HashMap<String, Reminder>>>,
    wake_up_cancel_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    event_sink: Arc<Mutex<Option<ReminderEventSink>>>,
    time_provider: TimeProvider,
}

impl std::fmt::Debug for ReminderService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ReminderService")
            .field("storage_enabled", &self.storage.is_some())
            .finish()
    }
}

impl ReminderService {
    pub fn new(
        storage: Option<Arc<dyn ReminderRepository>>,
        notification: Arc<NotificationService>,
    ) -> Self {
        Self {
            storage,
            notification,
            reminders: Arc::new(Mutex::new(HashMap::new())),
            wake_up_cancel_tx: Arc::new(Mutex::new(None)),
            event_sink: Arc::new(Mutex::new(None)),
            time_provider: Arc::new(system_time_now_ms),
        }
    }

    /// Alternate constructor for deterministic testing with controlled timestamps
    pub fn with_time_provider(
        storage: Option<Arc<dyn ReminderRepository>>,
        notification: Arc<NotificationService>,
        time_provider: TimeProvider,
    ) -> Self {
        Self {
            storage,
            notification,
            reminders: Arc::new(Mutex::new(HashMap::new())),
            wake_up_cancel_tx: Arc::new(Mutex::new(None)),
            event_sink: Arc::new(Mutex::new(None)),
            time_provider,
        }
    }

    pub fn now(&self) -> u64 {
        (self.time_provider)()
    }

    fn emit_event(&self, event: BbqEvent) {
        if let Ok(sink_guard) = self.event_sink.lock() {
            if let Some(ref sink) = *sink_guard {
                sink(event);
            }
        }
    }

    /// Schedule a single one-shot wake-up for the nearest upcoming reminder.
    /// Cancels any previously active wake-up task.
    pub fn schedule_nearest(&self) {
        let mut cancel_tx_guard = match self.wake_up_cancel_tx.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        // Cancel previous sender by dropping or sending
        if let Some(old_tx) = cancel_tx_guard.take() {
            let _ = old_tx.send(());
        }

        let now = self.now();
        let reminders_guard = match self.reminders.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        // Find nearest due_at strictly in the future
        let mut nearest: Option<u64> = None;
        for rem in reminders_guard.values() {
            if rem.state == ReminderState::Scheduled && rem.due_at >= now {
                match nearest {
                    None => nearest = Some(rem.due_at),
                    Some(cur) if rem.due_at < cur => nearest = Some(rem.due_at),
                    _ => {}
                }
            }
        }

        if let Some(target_at) = nearest {
            let delay_ms = target_at.saturating_sub(now);
            let (tx, rx) = oneshot::channel::<()>();
            *cancel_tx_guard = Some(tx);

            let this = self.clone();
            tokio::spawn(async move {
                tokio::select! {
                    _ = rx => {
                        // Wake-up superseded or cancelled
                    }
                    _ = tokio::time::sleep(Duration::from_millis(delay_ms)) => {
                        this.process_due_reminders();
                    }
                }
            });
        }
    }

    /// Evaluates due reminders, transitions them to Fired, emits events, and notifies.
    pub fn process_due_reminders(&self) {
        let now = self.now();
        let mut due_to_fire = Vec::new();

        if let Ok(mut guard) = self.reminders.lock() {
            for rem in guard.values_mut() {
                if rem.state == ReminderState::Scheduled && rem.due_at <= now {
                    rem.state = ReminderState::Fired;
                    due_to_fire.push(rem.clone());
                }
            }
        }

        // Sort chronologically
        due_to_fire.sort_by_key(|r| r.due_at);

        for reminder in due_to_fire {
            if let Some(ref storage) = self.storage {
                let _ = storage.update_state(&reminder.id, ReminderState::Fired);
            }

            self.emit_event(BbqEvent::ReminderFired(reminder.clone()));

            let body_text = reminder
                .body
                .clone()
                .unwrap_or_else(|| "Your scheduled reminder is due.".to_string());

            let notif_req = NotificationRequest::new(
                format!("reminder_{}", reminder.id),
                NotificationCategory::Reminder,
                &reminder.title,
                body_text,
            );

            if let Ok(req) = notif_req {
                let _ = self.notification.notify(req);
            }
        }

        // Recalculate and schedule the next nearest reminder
        self.schedule_nearest();
    }
}

#[async_trait]
impl Service for ReminderService {
    fn name(&self) -> &'static str {
        "ReminderService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing ReminderService");

        // 1. Load persisted reminders if storage is present
        if let Some(ref storage) = self.storage {
            let all = storage.list_all()?;
            if let Ok(mut guard) = self.reminders.lock() {
                for rem in all {
                    guard.insert(rem.id.clone(), rem);
                }
            }
        }

        // 2. Bounded Overdue Startup Policy
        let now = self.now();
        let mut overdue = Vec::new();

        if let Ok(guard) = self.reminders.lock() {
            for rem in guard.values() {
                if rem.state == ReminderState::Scheduled && rem.due_at <= now {
                    overdue.push(rem.clone());
                }
            }
        }

        overdue.sort_by_key(|r| r.due_at);

        for (idx, mut rem) in overdue.into_iter().enumerate() {
            rem.state = ReminderState::Fired;

            if let Ok(mut guard) = self.reminders.lock() {
                guard.insert(rem.id.clone(), rem.clone());
            }

            if let Some(ref storage) = self.storage {
                let _ = storage.update_state(&rem.id, ReminderState::Fired);
            }

            // Only fire desktop notifications up to MAX_STARTUP_OVERDUE_NOTIFICATIONS
            if idx < MAX_STARTUP_OVERDUE_NOTIFICATIONS {
                self.emit_event(BbqEvent::ReminderFired(rem.clone()));
                let body_text = rem
                    .body
                    .clone()
                    .unwrap_or_else(|| "Missed scheduled reminder".to_string());
                if let Ok(notif) = NotificationRequest::new(
                    format!("startup_reminder_{}", rem.id),
                    NotificationCategory::Reminder,
                    format!("Overdue: {}", rem.title),
                    body_text,
                ) {
                    let _ = self.notification.notify(notif);
                }
            }
        }

        // 3. Schedule the nearest future reminder
        self.schedule_nearest();

        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        if let Ok(mut tx_guard) = self.wake_up_cancel_tx.lock() {
            if let Some(tx) = tx_guard.take() {
                let _ = tx.send(());
            }
        }
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
impl ReminderServiceTrait for ReminderService {
    async fn create_reminder(
        &self,
        title: &str,
        body: Option<String>,
        due_at: u64,
    ) -> BbqResult<Reminder> {
        let now = self.now();
        let id = format!("rem_{}", now);

        let reminder = Reminder::new(id, title, body, due_at, now)?;

        if let Some(ref storage) = self.storage {
            storage.insert(&reminder)?;
        }

        if let Ok(mut guard) = self.reminders.lock() {
            guard.insert(reminder.id.clone(), reminder.clone());
        }

        self.emit_event(BbqEvent::ReminderCreated(reminder.clone()));
        self.emit_event(BbqEvent::ReminderChanged(reminder.clone()));

        // Recalculate schedule in case this is the new nearest reminder
        self.schedule_nearest();

        Ok(reminder)
    }

    async fn cancel_reminder(&self, id: &str) -> BbqResult<Reminder> {
        let updated = {
            let mut guard = self.reminders.lock().map_err(|e| BbqError::Service {
                service: "ReminderService",
                message: format!("Lock error: {}", e),
            })?;
            let reminder = guard
                .get_mut(id)
                .ok_or_else(|| BbqError::Validation(format!("Reminder not found: {}", id)))?;

            if reminder.state == ReminderState::Cancelled {
                return Ok(reminder.clone());
            }

            reminder.state = ReminderState::Cancelled;
            reminder.clone()
        };

        if let Some(ref storage) = self.storage {
            let _ = storage.update_state(id, ReminderState::Cancelled);
        }

        self.emit_event(BbqEvent::ReminderCancelled(updated.clone()));
        self.emit_event(BbqEvent::ReminderChanged(updated.clone()));

        // Recalculate schedule in case the cancelled reminder was the nearest
        self.schedule_nearest();

        Ok(updated)
    }

    async fn list_reminders(&self) -> BbqResult<Vec<Reminder>> {
        let guard = self.reminders.lock().map_err(|e| BbqError::Service {
            service: "ReminderService",
            message: format!("Lock error: {}", e),
        })?;
        let mut list: Vec<Reminder> = guard.values().cloned().collect();
        list.sort_by_key(|r| r.due_at);
        Ok(list)
    }

    async fn get_reminder(&self, id: &str) -> BbqResult<Option<Reminder>> {
        let guard = self.reminders.lock().map_err(|e| BbqError::Service {
            service: "ReminderService",
            message: format!("Lock error: {}", e),
        })?;
        Ok(guard.get(id).cloned())
    }

    async fn clear_fired(&self) -> BbqResult<()> {
        if let Some(ref storage) = self.storage {
            storage.clear_fired()?;
        }

        if let Ok(mut guard) = self.reminders.lock() {
            guard.retain(|_, r| r.state != ReminderState::Fired);
        }

        Ok(())
    }

    fn subscribe_events(&self, sink: ReminderEventSink) -> BbqResult<()> {
        if let Ok(mut guard) = self.event_sink.lock() {
            *guard = Some(sink);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bbq_platform::MockNotification;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct TestEnv {
        service: ReminderService,
        current_time: Arc<AtomicU64>,
        mock_platform: Arc<MockNotification>,
    }

    fn create_test_env(initial_time: u64) -> TestEnv {
        let mock_platform = Arc::new(MockNotification::default());
        let notif_service = Arc::new(NotificationService::new(mock_platform.clone(), None));
        let current_time = Arc::new(AtomicU64::new(initial_time));

        let time_copy = current_time.clone();
        let service = ReminderService::with_time_provider(
            None,
            notif_service,
            Arc::new(move || time_copy.load(Ordering::SeqCst)),
        );

        TestEnv {
            service,
            current_time,
            mock_platform,
        }
    }

    #[tokio::test]
    async fn test_reminder_create_and_list() {
        let env = create_test_env(100_000);
        let created = env
            .service
            .create_reminder("Submit invoice", Some("To client A".to_string()), 150_000)
            .await
            .unwrap();

        assert_eq!(created.title, "Submit invoice");
        assert_eq!(created.state, ReminderState::Scheduled);

        let list = env.service.list_reminders().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);
    }

    #[tokio::test]
    async fn test_reminder_cancel() {
        let env = create_test_env(100_000);
        let created = env
            .service
            .create_reminder("Dentist", None, 150_000)
            .await
            .unwrap();

        let cancelled = env.service.cancel_reminder(&created.id).await.unwrap();
        assert_eq!(cancelled.state, ReminderState::Cancelled);

        let fetched = env
            .service
            .get_reminder(&created.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(fetched.state, ReminderState::Cancelled);
    }

    #[tokio::test]
    async fn test_reminder_firing_transitions_and_notifies() {
        let env = create_test_env(100_000);
        let created = env
            .service
            .create_reminder("Standup", None, 120_000)
            .await
            .unwrap();

        assert_eq!(env.mock_platform.notification_count(), 0);

        // Advance simulated time past due_at
        env.current_time.store(125_000, Ordering::SeqCst);
        env.service.process_due_reminders();

        assert_eq!(env.mock_platform.notification_count(), 1);
        let notif = env.mock_platform.last_notification().unwrap();
        assert_eq!(notif.title, "Standup");
        assert_eq!(notif.category, NotificationCategory::Reminder);

        let rem = env
            .service
            .get_reminder(&created.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(rem.state, ReminderState::Fired);

        // Firing again must be a no-op (exactly once)
        env.service.process_due_reminders();
        assert_eq!(env.mock_platform.notification_count(), 1);
    }

    #[tokio::test]
    async fn test_startup_overdue_bounded_replay() {
        let mock_platform = Arc::new(MockNotification::default());
        let notif_service = Arc::new(NotificationService::new(mock_platform.clone(), None));
        let current_time = Arc::new(AtomicU64::new(500_000));

        let time_copy = current_time.clone();
        let service = ReminderService::with_time_provider(
            None,
            notif_service,
            Arc::new(move || time_copy.load(Ordering::SeqCst)),
        );

        // Insert 15 overdue reminders directly into in-memory store
        for i in 1..=15 {
            let rem = Reminder {
                id: format!("overdue_{}", i),
                title: format!("Overdue Task {}", i),
                body: None,
                due_at: 100_000 + (i as u64 * 10_000), // All before 500_000
                state: ReminderState::Scheduled,
                created_at: 50_000,
            };
            service
                .reminders
                .lock()
                .unwrap()
                .insert(rem.id.clone(), rem);
        }

        // Initialize service (triggers startup policy)
        service.init().await.unwrap();

        // Exactly 10 startup notifications should be dispatched (preventing storms)
        assert_eq!(
            mock_platform.notification_count(),
            MAX_STARTUP_OVERDUE_NOTIFICATIONS
        );

        // All 15 reminders should be transitioned to Fired
        let all = service.list_reminders().await.unwrap();
        assert_eq!(all.len(), 15);
        for r in all {
            assert_eq!(r.state, ReminderState::Fired);
        }
    }
}
