use crate::traits::{Service, ServiceState, ServiceStatus};
use async_trait::async_trait;
use bbq_core::{
    BbqError, BbqEvent, BbqResult, PomodoroPhase, TimerMode, TimerSession, TimerState,
    POMODORO_LONG_BREAK_MS, POMODORO_SHORT_BREAK_MS, POMODORO_WORK_MS,
};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// Maximum duration allowed for a countdown timer (24 hours in ms)
pub const MAX_TIMER_DURATION_MS: u64 = 24 * 60 * 60 * 1000;

pub type EventSink = Arc<dyn Fn(BbqEvent) + Send + Sync>;
pub type TimeProvider = Arc<dyn Fn() -> u64 + Send + Sync>;

#[async_trait]
pub trait TimerServiceTrait: Service {
    async fn get_state(&self) -> BbqResult<TimerSession>;
    async fn start_countdown(&self, duration_ms: u64) -> BbqResult<TimerSession>;
    async fn start_stopwatch(&self) -> BbqResult<TimerSession>;
    async fn start_pomodoro(&self) -> BbqResult<TimerSession>;
    async fn pause(&self) -> BbqResult<TimerSession>;
    async fn resume(&self) -> BbqResult<TimerSession>;
    async fn reset(&self) -> BbqResult<TimerSession>;
    async fn cancel(&self) -> BbqResult<TimerSession>;
    async fn set_mode(&self, mode: TimerMode, duration_ms: Option<u64>) -> BbqResult<TimerSession>;
    async fn subscribe_events(&self, sink: EventSink) -> BbqResult<()>;
}

struct TimerInner {
    session: TimerSession,
    accumulated_stopwatch_ms: u64,
    pomodoro_work_count: u32,
    cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

pub struct TimerService {
    inner: Arc<RwLock<TimerInner>>,
    event_sinks: Arc<RwLock<Vec<EventSink>>>,
    time_provider: TimeProvider,
    session_counter: Arc<AtomicU64>,
}

impl std::fmt::Debug for TimerService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TimerService").finish()
    }
}

impl Default for TimerService {
    fn default() -> Self {
        Self::new()
    }
}

impl TimerService {
    pub fn new() -> Self {
        let default_time_provider: TimeProvider = Arc::new(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        });
        Self::new_with_time_provider(default_time_provider)
    }

    pub fn new_with_time_provider(time_provider: TimeProvider) -> Self {
        let initial_session = TimerSession {
            id: "timer_session_1".to_string(),
            mode: TimerMode::Countdown,
            state: TimerState::Idle,
            started_at: None,
            paused_at: None,
            target_at: None,
            duration_ms: Some(5 * 60 * 1000),
            remaining_ms: Some(5 * 60 * 1000),
            pomodoro_phase: None,
            completed_cycles: 0,
        };

        Self {
            inner: Arc::new(RwLock::new(TimerInner {
                session: initial_session,
                accumulated_stopwatch_ms: 0,
                pomodoro_work_count: 1,
                cancel_tx: None,
            })),
            event_sinks: Arc::new(RwLock::new(Vec::new())),
            time_provider,
            session_counter: Arc::new(AtomicU64::new(1)),
        }
    }

    fn now_ms(&self) -> u64 {
        (self.time_provider)()
    }

    fn next_session_id(&self) -> String {
        let id = self.session_counter.fetch_add(1, Ordering::Relaxed);
        format!("timer_session_{}", id)
    }

    async fn dispatch_events(&self, events: Vec<BbqEvent>) {
        let sinks = self.event_sinks.read().await;
        for event in events {
            for sink in sinks.iter() {
                sink(event.clone());
            }
        }
    }

    fn cancel_active_wake_up(&self, inner: &mut TimerInner) {
        if let Some(tx) = inner.cancel_tx.take() {
            let _ = tx.send(());
        }
    }

    /// Schedule single one-shot wake-up for countdown or pomodoro completion
    fn schedule_wake_up(&self, duration_ms: u64, expected_id: String, expected_target: u64) {
        let inner_clone = self.inner.clone();
        let event_sinks_clone = self.event_sinks.clone();
        let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();

        // Store cancellation sender
        let inner_for_tx = self.inner.clone();
        tokio::spawn(async move {
            let mut guard = inner_for_tx.write().await;
            guard.cancel_tx = Some(tx);
        });

        tokio::spawn(async move {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(duration_ms)) => {
                    let mut guard = inner_clone.write().await;
                    // Verify session is still running and matches expected ID and target
                    if guard.session.id == expected_id
                        && guard.session.state == TimerState::Running
                        && guard.session.target_at == Some(expected_target)
                    {
                        guard.cancel_tx = None;
                        let mut events = Vec::new();

                        if guard.session.mode == TimerMode::Pomodoro {
                            // Phase completed
                            guard.session.state = TimerState::Completed;
                            guard.session.remaining_ms = Some(0);
                            events.push(BbqEvent::TimerCompleted(guard.session.clone()));

                            // Advance to next Pomodoro phase
                            let current_phase = guard.session.pomodoro_phase.unwrap_or(PomodoroPhase::Work);
                            let (next_phase, next_duration) = match current_phase {
                                PomodoroPhase::Work => {
                                    if guard.pomodoro_work_count >= 4 {
                                        (PomodoroPhase::LongBreak, POMODORO_LONG_BREAK_MS)
                                    } else {
                                        (PomodoroPhase::ShortBreak, POMODORO_SHORT_BREAK_MS)
                                    }
                                }
                                PomodoroPhase::ShortBreak => {
                                    guard.pomodoro_work_count += 1;
                                    (PomodoroPhase::Work, POMODORO_WORK_MS)
                                }
                                PomodoroPhase::LongBreak => {
                                    guard.session.completed_cycles += 1;
                                    guard.pomodoro_work_count = 1;
                                    (PomodoroPhase::Work, POMODORO_WORK_MS)
                                }
                            };

                            guard.session.pomodoro_phase = Some(next_phase);
                            guard.session.duration_ms = Some(next_duration);
                            guard.session.remaining_ms = Some(next_duration);
                            guard.session.state = TimerState::Completed;

                            events.push(BbqEvent::TimerPhaseChanged(guard.session.clone()));
                            events.push(BbqEvent::TimerChanged(guard.session.clone()));
                        } else {
                            // Regular countdown completed
                            guard.session.state = TimerState::Completed;
                            guard.session.remaining_ms = Some(0);
                            events.push(BbqEvent::TimerCompleted(guard.session.clone()));
                            events.push(BbqEvent::TimerChanged(guard.session.clone()));
                        }

                        let sinks = event_sinks_clone.read().await;
                        for event in events {
                            for sink in sinks.iter() {
                                sink(event.clone());
                            }
                        }
                    }
                }
                _ = &mut rx => {
                    // Canceled or paused by user action - no action needed
                }
            }
        });
    }

    /// Internal helper to advance Pomodoro phase explicitly (used in tests and state logic)
    pub async fn advance_pomodoro_phase_internal(&self) -> BbqResult<TimerSession> {
        let now = self.now_ms();
        let mut guard = self.inner.write().await;

        if guard.session.mode != TimerMode::Pomodoro {
            return Err(BbqError::Validation(
                "Cannot advance phase: session is not in Pomodoro mode".to_string(),
            ));
        }

        self.cancel_active_wake_up(&mut guard);

        let current_phase = guard.session.pomodoro_phase.unwrap_or(PomodoroPhase::Work);
        let (next_phase, next_duration) = match current_phase {
            PomodoroPhase::Work => {
                if guard.pomodoro_work_count >= 4 {
                    (PomodoroPhase::LongBreak, POMODORO_LONG_BREAK_MS)
                } else {
                    (PomodoroPhase::ShortBreak, POMODORO_SHORT_BREAK_MS)
                }
            }
            PomodoroPhase::ShortBreak => {
                guard.pomodoro_work_count += 1;
                (PomodoroPhase::Work, POMODORO_WORK_MS)
            }
            PomodoroPhase::LongBreak => {
                guard.session.completed_cycles += 1;
                guard.pomodoro_work_count = 1;
                (PomodoroPhase::Work, POMODORO_WORK_MS)
            }
        };

        guard.session.pomodoro_phase = Some(next_phase);
        guard.session.duration_ms = Some(next_duration);
        guard.session.started_at = Some(now);
        guard.session.paused_at = None;
        guard.session.target_at = Some(now + next_duration);
        guard.session.remaining_ms = Some(next_duration);
        guard.session.state = TimerState::Running;

        let snapshot = guard.session.clone();
        let expected_id = snapshot.id.clone();
        let expected_target = snapshot.target_at.unwrap_or(0);
        drop(guard);

        self.schedule_wake_up(next_duration, expected_id, expected_target);

        self.dispatch_events(vec![
            BbqEvent::TimerPhaseChanged(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    /// Internal completion trigger for testing without real-time delays
    pub async fn trigger_completion_internal(&self) -> BbqResult<TimerSession> {
        let now = self.now_ms();
        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);

        if guard.session.state != TimerState::Running {
            return Ok(guard.session.clone());
        }

        let mut events = Vec::new();

        if guard.session.mode == TimerMode::Pomodoro {
            guard.session.state = TimerState::Completed;
            guard.session.remaining_ms = Some(0);
            events.push(BbqEvent::TimerCompleted(guard.session.clone()));

            let current_phase = guard.session.pomodoro_phase.unwrap_or(PomodoroPhase::Work);
            let (next_phase, next_duration) = match current_phase {
                PomodoroPhase::Work => {
                    if guard.pomodoro_work_count >= 4 {
                        (PomodoroPhase::LongBreak, POMODORO_LONG_BREAK_MS)
                    } else {
                        (PomodoroPhase::ShortBreak, POMODORO_SHORT_BREAK_MS)
                    }
                }
                PomodoroPhase::ShortBreak => {
                    guard.pomodoro_work_count += 1;
                    (PomodoroPhase::Work, POMODORO_WORK_MS)
                }
                PomodoroPhase::LongBreak => {
                    guard.session.completed_cycles += 1;
                    guard.pomodoro_work_count = 1;
                    (PomodoroPhase::Work, POMODORO_WORK_MS)
                }
            };

            guard.session.pomodoro_phase = Some(next_phase);
            guard.session.duration_ms = Some(next_duration);
            guard.session.started_at = Some(now);
            guard.session.target_at = Some(now + next_duration);
            guard.session.remaining_ms = Some(next_duration);
            guard.session.state = TimerState::Running;

            events.push(BbqEvent::TimerPhaseChanged(guard.session.clone()));
            events.push(BbqEvent::TimerChanged(guard.session.clone()));
        } else {
            guard.session.state = TimerState::Completed;
            guard.session.remaining_ms = Some(0);
            events.push(BbqEvent::TimerCompleted(guard.session.clone()));
            events.push(BbqEvent::TimerChanged(guard.session.clone()));
        }

        let snapshot = guard.session.clone();
        drop(guard);

        self.dispatch_events(events).await;
        Ok(snapshot)
    }
}

#[async_trait]
impl Service for TimerService {
    fn name(&self) -> &'static str {
        "TimerService"
    }

    async fn init(&self) -> BbqResult<()> {
        tracing::info!("Initializing TimerService");
        Ok(())
    }

    async fn start(&self) -> BbqResult<()> {
        Ok(())
    }

    async fn stop(&self) -> BbqResult<()> {
        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);
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
impl TimerServiceTrait for TimerService {
    async fn get_state(&self) -> BbqResult<TimerSession> {
        let now = self.now_ms();
        let guard = self.inner.read().await;
        let mut session = guard.session.clone();
        session.remaining_ms = session.calculate_remaining_ms(now, guard.accumulated_stopwatch_ms);
        Ok(session)
    }

    async fn start_countdown(&self, duration_ms: u64) -> BbqResult<TimerSession> {
        if duration_ms == 0 {
            return Err(BbqError::Validation(
                "Timer duration must be greater than zero".to_string(),
            ));
        }
        if duration_ms > MAX_TIMER_DURATION_MS {
            return Err(BbqError::Validation(
                "Timer duration exceeds maximum limit of 24 hours".to_string(),
            ));
        }

        let now = self.now_ms();
        let session_id = self.next_session_id();
        let target_at = now + duration_ms;

        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);

        guard.session = TimerSession {
            id: session_id.clone(),
            mode: TimerMode::Countdown,
            state: TimerState::Running,
            started_at: Some(now),
            paused_at: None,
            target_at: Some(target_at),
            duration_ms: Some(duration_ms),
            remaining_ms: Some(duration_ms),
            pomodoro_phase: None,
            completed_cycles: 0,
        };
        guard.accumulated_stopwatch_ms = 0;

        let snapshot = guard.session.clone();
        drop(guard);

        self.schedule_wake_up(duration_ms, session_id, target_at);

        self.dispatch_events(vec![
            BbqEvent::TimerStarted(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn start_stopwatch(&self) -> BbqResult<TimerSession> {
        let now = self.now_ms();
        let session_id = self.next_session_id();

        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);

        guard.session = TimerSession {
            id: session_id,
            mode: TimerMode::Stopwatch,
            state: TimerState::Running,
            started_at: Some(now),
            paused_at: None,
            target_at: None,
            duration_ms: None,
            remaining_ms: Some(0),
            pomodoro_phase: None,
            completed_cycles: 0,
        };
        guard.accumulated_stopwatch_ms = 0;

        let snapshot = guard.session.clone();
        drop(guard);

        self.dispatch_events(vec![
            BbqEvent::TimerStarted(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn start_pomodoro(&self) -> BbqResult<TimerSession> {
        let now = self.now_ms();
        let session_id = self.next_session_id();
        let duration_ms = POMODORO_WORK_MS;
        let target_at = now + duration_ms;

        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);

        let previous_cycles = guard.session.completed_cycles;
        guard.session = TimerSession {
            id: session_id.clone(),
            mode: TimerMode::Pomodoro,
            state: TimerState::Running,
            started_at: Some(now),
            paused_at: None,
            target_at: Some(target_at),
            duration_ms: Some(duration_ms),
            remaining_ms: Some(duration_ms),
            pomodoro_phase: Some(PomodoroPhase::Work),
            completed_cycles: previous_cycles,
        };
        guard.pomodoro_work_count = 1;
        guard.accumulated_stopwatch_ms = 0;

        let snapshot = guard.session.clone();
        drop(guard);

        self.schedule_wake_up(duration_ms, session_id, target_at);

        self.dispatch_events(vec![
            BbqEvent::TimerStarted(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn pause(&self) -> BbqResult<TimerSession> {
        let now = self.now_ms();
        let mut guard = self.inner.write().await;

        if guard.session.state != TimerState::Running {
            let mut s = guard.session.clone();
            s.remaining_ms = s.calculate_remaining_ms(now, guard.accumulated_stopwatch_ms);
            return Ok(s);
        }

        self.cancel_active_wake_up(&mut guard);

        match guard.session.mode {
            TimerMode::Countdown | TimerMode::Pomodoro => {
                let remaining_at_pause = guard
                    .session
                    .target_at
                    .map(|t| t.saturating_sub(now))
                    .unwrap_or(0);
                guard.session.remaining_ms = Some(remaining_at_pause);
            }
            TimerMode::Stopwatch => {
                let active = guard
                    .session
                    .started_at
                    .map(|s| now.saturating_sub(s))
                    .unwrap_or(0);
                guard.accumulated_stopwatch_ms =
                    guard.accumulated_stopwatch_ms.saturating_add(active);
                guard.session.remaining_ms = Some(guard.accumulated_stopwatch_ms);
            }
        }

        guard.session.paused_at = Some(now);
        guard.session.state = TimerState::Paused;

        let snapshot = guard.session.clone();
        drop(guard);

        self.dispatch_events(vec![
            BbqEvent::TimerPaused(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn resume(&self) -> BbqResult<TimerSession> {
        let now = self.now_ms();
        let mut guard = self.inner.write().await;

        if guard.session.state != TimerState::Paused {
            let mut s = guard.session.clone();
            s.remaining_ms = s.calculate_remaining_ms(now, guard.accumulated_stopwatch_ms);
            return Ok(s);
        }

        let mut wake_up_duration = 0;
        let mut expected_target = 0;
        let expected_id = guard.session.id.clone();

        match guard.session.mode {
            TimerMode::Countdown | TimerMode::Pomodoro => {
                let remaining = guard.session.remaining_ms.unwrap_or(0);
                if remaining == 0 {
                    guard.session.state = TimerState::Completed;
                    let snapshot = guard.session.clone();
                    drop(guard);
                    return Ok(snapshot);
                }
                let target_at = now + remaining;
                guard.session.target_at = Some(target_at);
                guard.session.started_at = Some(now);
                guard.session.paused_at = None;
                guard.session.state = TimerState::Running;
                wake_up_duration = remaining;
                expected_target = target_at;
            }
            TimerMode::Stopwatch => {
                guard.session.started_at = Some(now);
                guard.session.paused_at = None;
                guard.session.state = TimerState::Running;
            }
        }

        let snapshot = guard.session.clone();
        drop(guard);

        if wake_up_duration > 0 {
            self.schedule_wake_up(wake_up_duration, expected_id, expected_target);
        }

        self.dispatch_events(vec![
            BbqEvent::TimerResumed(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn reset(&self) -> BbqResult<TimerSession> {
        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);

        guard.accumulated_stopwatch_ms = 0;
        guard.session.state = TimerState::Idle;
        guard.session.started_at = None;
        guard.session.paused_at = None;
        guard.session.target_at = None;

        match guard.session.mode {
            TimerMode::Countdown => {
                guard.session.remaining_ms = guard.session.duration_ms;
            }
            TimerMode::Stopwatch => {
                guard.session.remaining_ms = Some(0);
            }
            TimerMode::Pomodoro => {
                guard.pomodoro_work_count = 1;
                guard.session.pomodoro_phase = Some(PomodoroPhase::Work);
                guard.session.duration_ms = Some(POMODORO_WORK_MS);
                guard.session.remaining_ms = Some(POMODORO_WORK_MS);
            }
        }

        let snapshot = guard.session.clone();
        drop(guard);

        self.dispatch_events(vec![
            BbqEvent::TimerReset(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn cancel(&self) -> BbqResult<TimerSession> {
        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);

        guard.accumulated_stopwatch_ms = 0;
        guard.pomodoro_work_count = 1;
        guard.session = TimerSession {
            id: self.next_session_id(),
            mode: TimerMode::Countdown,
            state: TimerState::Idle,
            started_at: None,
            paused_at: None,
            target_at: None,
            duration_ms: Some(5 * 60 * 1000),
            remaining_ms: Some(5 * 60 * 1000),
            pomodoro_phase: None,
            completed_cycles: 0,
        };

        let snapshot = guard.session.clone();
        drop(guard);

        self.dispatch_events(vec![
            BbqEvent::TimerReset(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn set_mode(&self, mode: TimerMode, duration_ms: Option<u64>) -> BbqResult<TimerSession> {
        let mut guard = self.inner.write().await;
        self.cancel_active_wake_up(&mut guard);

        guard.accumulated_stopwatch_ms = 0;

        let (duration, phase) = match mode {
            TimerMode::Countdown => (duration_ms.unwrap_or(5 * 60 * 1000), None),
            TimerMode::Stopwatch => (0, None),
            TimerMode::Pomodoro => (POMODORO_WORK_MS, Some(PomodoroPhase::Work)),
        };

        if mode == TimerMode::Pomodoro {
            guard.pomodoro_work_count = 1;
        }

        guard.session = TimerSession {
            id: self.next_session_id(),
            mode,
            state: TimerState::Idle,
            started_at: None,
            paused_at: None,
            target_at: None,
            duration_ms: if mode == TimerMode::Stopwatch {
                None
            } else {
                Some(duration)
            },
            remaining_ms: Some(duration),
            pomodoro_phase: phase,
            completed_cycles: guard.session.completed_cycles,
        };

        let snapshot = guard.session.clone();
        drop(guard);

        self.dispatch_events(vec![
            BbqEvent::TimerReset(snapshot.clone()),
            BbqEvent::TimerChanged(snapshot.clone()),
        ])
        .await;

        Ok(snapshot)
    }

    async fn subscribe_events(&self, sink: EventSink) -> BbqResult<()> {
        let mut sinks = self.event_sinks.write().await;
        sinks.push(sink);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;
    use std::sync::Mutex;

    fn create_mock_timer_service(initial_time: u64) -> (Arc<TimerService>, Arc<AtomicU64>) {
        let time = Arc::new(AtomicU64::new(initial_time));
        let time_clone = time.clone();
        let service = Arc::new(TimerService::new_with_time_provider(Arc::new(move || {
            time_clone.load(Ordering::Relaxed)
        })));
        (service, time)
    }

    #[tokio::test]
    async fn test_countdown_idle_to_running_and_state_calculation() {
        let (service, time) = create_mock_timer_service(10000);
        let session = service
            .start_countdown(60000)
            .await
            .expect("start countdown");
        assert_eq!(session.state, TimerState::Running);
        assert_eq!(session.mode, TimerMode::Countdown);
        assert_eq!(session.target_at, Some(70000));

        // Advance simulated time by 20s
        time.store(30000, Ordering::Relaxed);
        let current = service.get_state().await.expect("get state");
        assert_eq!(current.remaining_ms, Some(40000));
    }

    #[tokio::test]
    async fn test_countdown_pause_and_resume() {
        let (service, time) = create_mock_timer_service(10000);
        service
            .start_countdown(60000)
            .await
            .expect("start countdown");

        // Advance time to 25s (15s elapsed, 45s remaining)
        time.store(25000, Ordering::Relaxed);
        let paused = service.pause().await.expect("pause");
        assert_eq!(paused.state, TimerState::Paused);
        assert_eq!(paused.remaining_ms, Some(45000));

        // Let some real-time or simulated time pass while paused
        time.store(50000, Ordering::Relaxed);
        let state_while_paused = service.get_state().await.expect("get state while paused");
        assert_eq!(state_while_paused.remaining_ms, Some(45000));

        // Resume at time 50000
        let resumed = service.resume().await.expect("resume");
        assert_eq!(resumed.state, TimerState::Running);
        assert_eq!(resumed.target_at, Some(50000 + 45000));

        // Advance 10s -> remaining should be 35s
        time.store(60000, Ordering::Relaxed);
        let state_after_resume = service.get_state().await.expect("get state after resume");
        assert_eq!(state_after_resume.remaining_ms, Some(35000));
    }

    #[tokio::test]
    async fn test_countdown_reset_and_cancel() {
        let (service, time) = create_mock_timer_service(1000);
        service.start_countdown(30000).await.expect("start");

        time.store(15000, Ordering::Relaxed);
        let reset = service.reset().await.expect("reset");
        assert_eq!(reset.state, TimerState::Idle);
        assert_eq!(reset.remaining_ms, Some(30000));

        let cancelled = service.cancel().await.expect("cancel");
        assert_eq!(cancelled.state, TimerState::Idle);
    }

    #[tokio::test]
    async fn test_countdown_completion_emits_once() {
        let (service, _time) = create_mock_timer_service(1000);
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();

        service
            .subscribe_events(Arc::new(move |event| {
                events_clone.lock().unwrap().push(event);
            }))
            .await
            .expect("subscribe");

        service.start_countdown(10000).await.expect("start");

        // Manually trigger completion via deterministic internal trigger
        service
            .trigger_completion_internal()
            .await
            .expect("complete");

        let captured = events.lock().unwrap().clone();
        let completion_events: Vec<_> = captured
            .iter()
            .filter(|e| matches!(e, BbqEvent::TimerCompleted(_)))
            .collect();

        assert_eq!(completion_events.len(), 1);

        // Calling trigger again does not re-emit completed because state is already Completed
        service
            .trigger_completion_internal()
            .await
            .expect("complete second time");
        let captured_again = events.lock().unwrap().clone();
        let completion_again: Vec<_> = captured_again
            .iter()
            .filter(|e| matches!(e, BbqEvent::TimerCompleted(_)))
            .collect();
        assert_eq!(completion_again.len(), 1);
    }

    #[tokio::test]
    async fn test_stopwatch_timestamps_and_pause_resume() {
        let (service, time) = create_mock_timer_service(10000);
        let session = service.start_stopwatch().await.expect("start stopwatch");
        assert_eq!(session.state, TimerState::Running);
        assert_eq!(session.mode, TimerMode::Stopwatch);

        // Advance 5 seconds
        time.store(15000, Ordering::Relaxed);
        let state1 = service.get_state().await.expect("state 1");
        assert_eq!(state1.remaining_ms, Some(5000));

        // Pause at 15000 (accumulated = 5000)
        let paused = service.pause().await.expect("pause");
        assert_eq!(paused.remaining_ms, Some(5000));

        // Advance simulated time to 30000 while paused (elapsed should remain 5000)
        time.store(30000, Ordering::Relaxed);
        let paused_state = service.get_state().await.expect("paused state");
        assert_eq!(paused_state.remaining_ms, Some(5000));

        // Resume at 30000
        let resumed = service.resume().await.expect("resume");
        assert_eq!(resumed.state, TimerState::Running);

        // Advance to 37000 (7s more, total elapsed = 5000 + 7000 = 12000)
        time.store(37000, Ordering::Relaxed);
        let state2 = service.get_state().await.expect("state 2");
        assert_eq!(state2.remaining_ms, Some(12000));

        // Reset
        let reset = service.reset().await.expect("reset");
        assert_eq!(reset.state, TimerState::Idle);
        assert_eq!(reset.remaining_ms, Some(0));
    }

    #[tokio::test]
    async fn test_pomodoro_full_cycle_progression() {
        let (service, time) = create_mock_timer_service(10000);
        let session = service.start_pomodoro().await.expect("start pomodoro");
        assert_eq!(session.mode, TimerMode::Pomodoro);
        assert_eq!(session.pomodoro_phase, Some(PomodoroPhase::Work));
        assert_eq!(session.duration_ms, Some(POMODORO_WORK_MS));

        // 1. Work #1 -> ShortBreak
        time.store(10000 + POMODORO_WORK_MS, Ordering::Relaxed);
        let p1 = service
            .trigger_completion_internal()
            .await
            .expect("p1 complete");
        assert_eq!(p1.pomodoro_phase, Some(PomodoroPhase::ShortBreak));
        assert_eq!(p1.duration_ms, Some(POMODORO_SHORT_BREAK_MS));

        // 2. ShortBreak -> Work #2
        let p2 = service
            .trigger_completion_internal()
            .await
            .expect("p2 complete");
        assert_eq!(p2.pomodoro_phase, Some(PomodoroPhase::Work));

        // 3. Work #2 -> ShortBreak
        let p3 = service
            .trigger_completion_internal()
            .await
            .expect("p3 complete");
        assert_eq!(p3.pomodoro_phase, Some(PomodoroPhase::ShortBreak));

        // 4. ShortBreak -> Work #3
        let p4 = service
            .trigger_completion_internal()
            .await
            .expect("p4 complete");
        assert_eq!(p4.pomodoro_phase, Some(PomodoroPhase::Work));

        // 5. Work #3 -> ShortBreak
        let p5 = service
            .trigger_completion_internal()
            .await
            .expect("p5 complete");
        assert_eq!(p5.pomodoro_phase, Some(PomodoroPhase::ShortBreak));

        // 6. ShortBreak -> Work #4
        let p6 = service
            .trigger_completion_internal()
            .await
            .expect("p6 complete");
        assert_eq!(p6.pomodoro_phase, Some(PomodoroPhase::Work));

        // 7. Work #4 -> LongBreak
        let p7 = service
            .trigger_completion_internal()
            .await
            .expect("p7 complete");
        assert_eq!(p7.pomodoro_phase, Some(PomodoroPhase::LongBreak));
        assert_eq!(p7.duration_ms, Some(POMODORO_LONG_BREAK_MS));

        // 8. LongBreak -> Work (Cycle increments)
        let p8 = service
            .trigger_completion_internal()
            .await
            .expect("p8 complete");
        assert_eq!(p8.pomodoro_phase, Some(PomodoroPhase::Work));
        assert_eq!(p8.completed_cycles, 1);
    }

    #[tokio::test]
    async fn test_validation_errors() {
        let (service, _) = create_mock_timer_service(0);
        let err_zero = service.start_countdown(0).await.unwrap_err();
        assert!(matches!(err_zero, BbqError::Validation(_)));

        let err_too_large = service
            .start_countdown(MAX_TIMER_DURATION_MS + 1)
            .await
            .unwrap_err();
        assert!(matches!(err_too_large, BbqError::Validation(_)));
    }

    #[tokio::test]
    async fn test_mode_switching_remains_idle_and_never_auto_starts() {
        let (service, _) = create_mock_timer_service(1000);

        // Start a countdown running
        let running_session = service
            .start_countdown(60_000)
            .await
            .expect("Start countdown");
        assert_eq!(running_session.state, TimerState::Running);
        assert_eq!(running_session.mode, TimerMode::Countdown);

        // Switch to Stopwatch via set_mode
        let stopwatch_session = service
            .set_mode(TimerMode::Stopwatch, None)
            .await
            .expect("Switch to stopwatch");
        assert_eq!(stopwatch_session.mode, TimerMode::Stopwatch);
        assert_eq!(stopwatch_session.state, TimerState::Idle);
        assert_eq!(stopwatch_session.started_at, None);
        assert_eq!(stopwatch_session.remaining_ms, Some(0));

        // Switch to Pomodoro via set_mode
        let pomodoro_session = service
            .set_mode(TimerMode::Pomodoro, None)
            .await
            .expect("Switch to pomodoro");
        assert_eq!(pomodoro_session.mode, TimerMode::Pomodoro);
        assert_eq!(pomodoro_session.state, TimerState::Idle);
        assert_eq!(pomodoro_session.started_at, None);
        assert_eq!(pomodoro_session.pomodoro_phase, Some(PomodoroPhase::Work));
        assert_eq!(pomodoro_session.remaining_ms, Some(POMODORO_WORK_MS));

        // Switch back to Countdown via set_mode with custom duration
        let countdown_session = service
            .set_mode(TimerMode::Countdown, Some(120_000))
            .await
            .expect("Switch to countdown");
        assert_eq!(countdown_session.mode, TimerMode::Countdown);
        assert_eq!(countdown_session.state, TimerState::Idle);
        assert_eq!(countdown_session.started_at, None);
        assert_eq!(countdown_session.duration_ms, Some(120_000));
        assert_eq!(countdown_session.remaining_ms, Some(120_000));
    }
}
