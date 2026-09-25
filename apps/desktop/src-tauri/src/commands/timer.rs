use crate::AppState;
use bbq_core::{TimerMode, TimerSession};
use bbq_services::TimerServiceTrait;
use tauri::State;

#[tauri::command]
pub async fn timer_get_state(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .get_state()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_start_countdown(
    state: State<'_, AppState>,
    duration_ms: u64,
) -> Result<TimerSession, String> {
    state
        .timer_service
        .start_countdown(duration_ms)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_start_stopwatch(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .start_stopwatch()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_start_pomodoro(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .start_pomodoro()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_pause(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state.timer_service.pause().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_resume(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .resume()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_reset(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state.timer_service.reset().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_cancel(state: State<'_, AppState>) -> Result<TimerSession, String> {
    state
        .timer_service
        .cancel()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timer_set_mode(
    state: State<'_, AppState>,
    mode: TimerMode,
    duration_ms: Option<u64>,
) -> Result<TimerSession, String> {
    state
        .timer_service
        .set_mode(mode, duration_ms)
        .await
        .map_err(|e| e.to_string())
}
