use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn media_get_current_session(
    state: State<'_, AppState>,
) -> Result<Option<bbq_core::MediaSession>, String> {
    use bbq_services::MediaServiceTrait;
    state
        .media_service
        .current_session()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_play(state: State<'_, AppState>) -> Result<(), String> {
    use bbq_services::MediaServiceTrait;
    state.media_service.play().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_pause(state: State<'_, AppState>) -> Result<(), String> {
    use bbq_services::MediaServiceTrait;
    state.media_service.pause().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_toggle_play_pause(state: State<'_, AppState>) -> Result<(), String> {
    use bbq_services::MediaServiceTrait;
    state
        .media_service
        .toggle_play_pause()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_next(state: State<'_, AppState>) -> Result<(), String> {
    use bbq_services::MediaServiceTrait;
    state.media_service.next().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_previous(state: State<'_, AppState>) -> Result<(), String> {
    use bbq_services::MediaServiceTrait;
    state
        .media_service
        .previous()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn media_seek(state: State<'_, AppState>, position_ms: u64) -> Result<(), String> {
    use bbq_services::MediaServiceTrait;
    state
        .media_service
        .seek(position_ms)
        .await
        .map_err(|e| e.to_string())
}
