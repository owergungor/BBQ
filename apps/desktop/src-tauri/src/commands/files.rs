use crate::AppState;
use bbq_core::FileEntry;
use tauri::State;

#[tauri::command]
pub async fn file_get_workspace(state: State<'_, AppState>) -> Result<Vec<FileEntry>, String> {
    state
        .file_service
        .get_workspace()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_add(
    state: State<'_, AppState>,
    path: String,
    source: Option<String>,
) -> Result<FileEntry, String> {
    state
        .file_service
        .add_file(&path, source)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_open(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .file_service
        .open_file(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_reveal(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .file_service
        .reveal_file(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_remove(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .file_service
        .remove_file(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_clear_workspace(state: State<'_, AppState>) -> Result<(), String> {
    state
        .file_service
        .clear_workspace()
        .await
        .map_err(|e| e.to_string())
}
