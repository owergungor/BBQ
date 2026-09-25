use crate::AppState;
use bbq_core::{LauncherCapabilities, LauncherItem};
use tauri::State;

#[tauri::command]
pub async fn launcher_get_capabilities(
    state: State<'_, AppState>,
) -> Result<LauncherCapabilities, String> {
    state
        .launcher_service
        .get_capabilities()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_list(state: State<'_, AppState>) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .list_items()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_search(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .search_items(&query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_launch(state: State<'_, AppState>, item_id: String) -> Result<(), String> {
    state
        .launcher_service
        .launch_item(&item_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_add_favorite(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<(), String> {
    state
        .launcher_service
        .add_favorite(&item_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_remove_favorite(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<(), String> {
    state
        .launcher_service
        .remove_favorite(&item_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_list_favorites(
    state: State<'_, AppState>,
) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .list_favorites()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_list_recent(state: State<'_, AppState>) -> Result<Vec<LauncherItem>, String> {
    state
        .launcher_service
        .list_recent()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn launcher_clear_recent(state: State<'_, AppState>) -> Result<(), String> {
    state
        .launcher_service
        .clear_recent()
        .await
        .map_err(|e| e.to_string())
}
