use crate::AppState;
use bbq_core::Reminder;
use tauri::State;

#[tauri::command]
pub async fn reminder_list(state: State<'_, AppState>) -> Result<Vec<Reminder>, String> {
    state
        .reminder_service
        .list_reminders()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reminder_create(
    state: State<'_, AppState>,
    title: String,
    body: Option<String>,
    due_at: u64,
) -> Result<Reminder, String> {
    state
        .reminder_service
        .create_reminder(&title, body, due_at)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reminder_cancel(state: State<'_, AppState>, id: String) -> Result<Reminder, String> {
    state
        .reminder_service
        .cancel_reminder(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reminder_get(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<Reminder>, String> {
    state
        .reminder_service
        .get_reminder(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reminder_clear_fired(state: State<'_, AppState>) -> Result<(), String> {
    state
        .reminder_service
        .clear_fired()
        .await
        .map_err(|e| e.to_string())
}
