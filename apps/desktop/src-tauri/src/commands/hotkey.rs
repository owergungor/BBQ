use crate::AppState;
use bbq_platform::{HotkeyCapabilities, HotkeyDefinition};
use tauri::State;

#[tauri::command]
pub async fn hotkey_get_definition(state: State<'_, AppState>) -> Result<HotkeyDefinition, String> {
    state
        .hotkey_service
        .get_definition()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn hotkey_update_definition(
    state: State<'_, AppState>,
    definition: HotkeyDefinition,
) -> Result<(), String> {
    state
        .hotkey_service
        .update_definition(definition)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn hotkey_get_capabilities(
    state: State<'_, AppState>,
) -> Result<HotkeyCapabilities, String> {
    state
        .hotkey_service
        .get_capabilities()
        .await
        .map_err(|e| e.to_string())
}
