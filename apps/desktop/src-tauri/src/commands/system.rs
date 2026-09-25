use crate::AppState;
use bbq_core::{NotificationCapabilities, PlatformCapabilities, SystemCapabilities, SystemState};
use bbq_services::{NotificationServiceTrait, ServiceStatus, SystemServiceTrait};
use tauri::State;

#[tauri::command]
pub async fn system_get_state(state: State<'_, AppState>) -> Result<SystemState, String> {
    state
        .system_service
        .get_state()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_get_capabilities(
    state: State<'_, AppState>,
) -> Result<SystemCapabilities, String> {
    state
        .system_service
        .get_capabilities()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_set_volume(state: State<'_, AppState>, volume: f32) -> Result<(), String> {
    state
        .system_service
        .set_volume(volume)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_set_muted(state: State<'_, AppState>, muted: bool) -> Result<(), String> {
    state
        .system_service
        .set_muted(muted)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn system_toggle_muted(state: State<'_, AppState>) -> Result<(), String> {
    state
        .system_service
        .toggle_muted()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_service_statuses(state: State<'_, AppState>) -> Result<Vec<ServiceStatus>, String> {
    Ok(state.services.get_statuses())
}

#[tauri::command]
pub fn notification_get_capabilities(
    state: State<'_, AppState>,
) -> Result<NotificationCapabilities, String> {
    state
        .notification_service
        .capabilities()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_platform_capabilities() -> PlatformCapabilities {
    PlatformCapabilities::detect()
}
