use crate::AppState;
use bbq_core::{DropAction, DropActionResult, DropBatch};
use bbq_services::DropServiceTrait;
use tauri::State;

#[tauri::command]
pub async fn drop_inspect(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<DropBatch, String> {
    state
        .drop_service
        .inspect(&paths)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_get_actions(
    state: State<'_, AppState>,
    batch_id: String,
) -> Result<Vec<DropAction>, String> {
    state
        .drop_service
        .get_actions(&batch_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_execute(
    state: State<'_, AppState>,
    batch_id: String,
    action: DropAction,
    target_id: Option<String>,
) -> Result<DropActionResult, String> {
    state
        .drop_service
        .execute_action(&batch_id, action, target_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_clear(state: State<'_, AppState>) -> Result<(), String> {
    state.drop_service.clear().await.map_err(|e| e.to_string())
}
