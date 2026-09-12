use serde::{Deserialize, Serialize};

/// Mode of operation for the Timer Quick Tool
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TimerMode {
    #[default]
    Countdown,
    Stopwatch,
    Pomodoro,
}

/// Execution state of a timer session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TimerState {
    #[default]
    Idle,
    Running,
    Paused,
    Completed,
}

/// Phases of the Pomodoro productivity cycle
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PomodoroPhase {
    Work,
    ShortBreak,
    LongBreak,
}

/// Standard Pomodoro phase durations in milliseconds
pub const POMODORO_WORK_MS: u64 = 25 * 60 * 1000;
pub const POMODORO_SHORT_BREAK_MS: u64 = 5 * 60 * 1000;
pub const POMODORO_LONG_BREAK_MS: u64 = 15 * 60 * 1000;

/// Normalized timer session representation.
/// All time values are epoch timestamps in milliseconds or relative durations in milliseconds.
/// The timestamp is the authoritative source of truth. `remaining_ms` is a derived snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimerSession {
    pub id: String,
    pub mode: TimerMode,
    pub state: TimerState,
    pub started_at: Option<u64>,
    pub paused_at: Option<u64>,
    pub target_at: Option<u64>,
    pub duration_ms: Option<u64>,
    pub remaining_ms: Option<u64>,
    pub pomodoro_phase: Option<PomodoroPhase>,
    pub completed_cycles: u32,
}

impl Default for TimerSession {
    fn default() -> Self {
        Self {
            id: "timer_session_default".to_string(),
            mode: TimerMode::Countdown,
            state: TimerState::Idle,
            started_at: None,
            paused_at: None,
            target_at: None,
            duration_ms: Some(5 * 60 * 1000), // Default 5 minutes
            remaining_ms: Some(5 * 60 * 1000),
            pomodoro_phase: None,
            completed_cycles: 0,
        }
    }
}

impl TimerSession {
    /// Calculate the current derived remaining/elapsed duration in milliseconds given current timestamp.
    pub fn calculate_remaining_ms(&self, now: u64, accumulated_stopwatch_ms: u64) -> Option<u64> {
        match self.mode {
            TimerMode::Countdown | TimerMode::Pomodoro => match self.state {
                TimerState::Idle => self.duration_ms,
                TimerState::Running => {
                    if let Some(target) = self.target_at {
                        Some(target.saturating_sub(now))
                    } else {
                        self.remaining_ms
                    }
                }
                TimerState::Paused => self.remaining_ms,
                TimerState::Completed => Some(0),
            },
            TimerMode::Stopwatch => match self.state {
                TimerState::Idle => Some(0),
                TimerState::Running => {
                    let active_elapsed = self
                        .started_at
                        .map(|start| now.saturating_sub(start))
                        .unwrap_or(0);
                    Some(accumulated_stopwatch_ms.saturating_add(active_elapsed))
                }
                TimerState::Paused => Some(accumulated_stopwatch_ms),
                TimerState::Completed => Some(accumulated_stopwatch_ms),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timer_session_serialization() {
        let session = TimerSession {
            id: "test-timer-1".to_string(),
            mode: TimerMode::Pomodoro,
            state: TimerState::Running,
            started_at: Some(1000),
            paused_at: None,
            target_at: Some(1501000),
            duration_ms: Some(1500000),
            remaining_ms: Some(1500000),
            pomodoro_phase: Some(PomodoroPhase::Work),
            completed_cycles: 2,
        };

        let json = serde_json::to_string(&session).expect("serialize timer session");
        let deserialized: TimerSession =
            serde_json::from_str(&json).expect("deserialize timer session");
        assert_eq!(session, deserialized);
    }

    #[test]
    fn test_countdown_remaining_calculation() {
        let session = TimerSession {
            id: "cd-1".to_string(),
            mode: TimerMode::Countdown,
            state: TimerState::Running,
            started_at: Some(1000),
            paused_at: None,
            target_at: Some(60000),
            duration_ms: Some(59000),
            remaining_ms: None,
            pomodoro_phase: None,
            completed_cycles: 0,
        };

        assert_eq!(session.calculate_remaining_ms(30000, 0), Some(30000));
        assert_eq!(session.calculate_remaining_ms(60000, 0), Some(0));
        assert_eq!(session.calculate_remaining_ms(70000, 0), Some(0)); // Saturating
    }

    #[test]
    fn test_stopwatch_elapsed_calculation() {
        let session = TimerSession {
            id: "sw-1".to_string(),
            mode: TimerMode::Stopwatch,
            state: TimerState::Running,
            started_at: Some(10000),
            paused_at: None,
            target_at: None,
            duration_ms: None,
            remaining_ms: None,
            pomodoro_phase: None,
            completed_cycles: 0,
        };

        // accumulated = 5000, started_at = 10000, now = 12000 -> elapsed = 5000 + 2000 = 7000
        assert_eq!(session.calculate_remaining_ms(12000, 5000), Some(7000));
    }
}
