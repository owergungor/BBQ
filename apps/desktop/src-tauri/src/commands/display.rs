use crate::AppState;
use bbq_platform::DisplayInfo;
use tauri::State;

#[tauri::command]
pub async fn get_displays(state: State<'_, AppState>) -> Result<Vec<DisplayInfo>, String> {
    state
        .display_service
        .list_displays()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_primary_display(state: State<'_, AppState>) -> Result<DisplayInfo, String> {
    state
        .display_service
        .get_primary_display()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_active_display(state: State<'_, AppState>) -> Result<DisplayInfo, String> {
    state
        .display_service
        .get_active_display()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_display_capabilities(
    state: State<'_, AppState>,
) -> Result<bbq_core::DisplayCapabilities, String> {
    Ok(state.display_service.capabilities())
}
