use crate::AppState;
use bbq_core::{ClipboardEntry, ClipboardStatus};
use bbq_services::ClipboardServiceTrait;
use tauri::State;

#[tauri::command]
pub async fn clipboard_get_history(
    state: State<'_, AppState>,
) -> Result<Vec<ClipboardEntry>, String> {
    state
        .clipboard
        .get_history()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clipboard_clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state
        .clipboard
        .clear_history()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clipboard_delete_entry(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .clipboard
        .delete_entry(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clipboard_set_history_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    state
        .clipboard
        .set_history_enabled(enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clipboard_get_status(state: State<'_, AppState>) -> Result<ClipboardStatus, String> {
    state
        .clipboard
        .get_status()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clipboard_write_text(state: State<'_, AppState>, text: String) -> Result<(), String> {
    state
        .clipboard
        .copy_text(&text)
        .await
        .map_err(|e| e.to_string())
}
