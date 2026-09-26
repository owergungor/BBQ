use crate::AppState;
use bbq_core::{NotificationCategory, NotificationRequest, PomodoroPhase, TimerMode};
use bbq_services::{
    ClipboardServiceTrait, DisplayServiceTrait, DropServiceTrait, FileServiceTrait,
    HotkeyServiceTrait, LauncherServiceTrait, MediaServiceTrait, NotificationServiceTrait,
    ReminderServiceTrait, Service, SystemServiceTrait, TimerServiceTrait, WindowServiceTrait,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Coordinates startup service initialization and attaches event sinks that forward
/// core events across the IPC bridge to the frontend shell.
pub fn wire_service_events(handle: &AppHandle, state: &AppState) {
    let app_handle = handle.clone();
    let services_clone = state.services.clone();
    let media_clone = state.media_service.clone();
    let clipboard_clone = state.clipboard.clone();
    let file_clone = state.file_service.clone();
    let system_clone = state.system_service.clone();
    let platform_sys = state.platform.system();
    let timer_clone = state.timer_service.clone();
    let notif_for_timer = state.notification_service.clone();
    let reminder_clone = state.reminder_service.clone();
    let notif_clone = state.notification_service.clone();
    let launcher_clone = state.launcher_service.clone();
    let drop_clone = state.drop_service.clone();
    let display_clone = state.display_service.clone();
    let hotkey_clone = state.hotkey_service.clone();
    let hotkey_disp_svc = state.display_service.clone();
    let hotkey_win_svc = state.window_service.clone();

    tauri::async_runtime::spawn(async move {
        // 0. Authoritative centralized service startup initialization
        if let Err(err) = services_clone.init_all().await {
            tracing::error!("ServiceRegistry init_all encountered error: {}", err);
        }

        // 1. Forward media events to frontend via MediaService
        let app_media = app_handle.clone();
        let _ = media_clone
            .subscribe_events(Arc::new(move |event| match event {
                bbq_core::MediaEvent::SessionChanged(session) => {
                    let _ = app_media.emit("bbq://media_changed", session);
                }
                bbq_core::MediaEvent::PlaybackChanged { state, .. } => {
                    let _ = app_media.emit("bbq://media_playback_state", state);
                }
                _ => {}
            }))
            .await;

        // 2. Forward clipboard events to frontend
        let app_clip = app_handle.clone();
        let _ = clipboard_clone
            .subscribe_events(Arc::new(move |entry| {
                let _ = app_clip.emit("bbq://clipboard_changed", entry);
            }))
            .await;

        // 3. Forward file events to frontend
        let app_file = app_handle.clone();
        let _ = file_clone
            .subscribe_events(Arc::new(move |event| match event {
                bbq_core::BbqEvent::FileAdded { entry } => {
                    let _ = app_file.emit("bbq://file_added", entry);
                }
                bbq_core::BbqEvent::FileRemoved { id } => {
                    let _ = app_file.emit("bbq://file_removed", id);
                }
                bbq_core::BbqEvent::FileWorkspaceChanged { entries } => {
                    let _ = app_file.emit("bbq://file_workspace_changed", entries);
                }
                _ => {}
            }))
            .await;

        // 4. Forward system events to frontend
        let app_sys = app_handle.clone();
        let sys_for_emit = system_clone.clone();
        let _ = platform_sys
            .subscribe(Arc::new(move |_event| {
                let emit = app_sys.clone();
                let sys_read = sys_for_emit.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(state) = sys_read.get_state().await {
                        let _ = emit.emit("bbq://system_changed", state);
                    }
                });
            }))
            .await;

        // 5. Forward timer events to frontend and coordinate desktop notification on completion
        let app_timer = app_handle.clone();
        let notif_timer = notif_for_timer.clone();
        let _ = timer_clone
            .subscribe_events(Arc::new(move |event| match event {
                bbq_core::BbqEvent::TimerCompleted(ref session) => {
                    let _ = app_timer.emit("bbq://timer_changed", session);
                    let notif_res = match session.mode {
                        TimerMode::Countdown => NotificationRequest::new(
                            format!("timer_finish_{}", session.id),
                            NotificationCategory::Timer,
                            "Timer finished",
                            "Your countdown timer has completed.",
                        ),
                        TimerMode::Pomodoro => {
                            let (title, body) = match session.pomodoro_phase {
                                Some(PomodoroPhase::Work) => (
                                    "Focus session complete",
                                    "Focus session complete. Time for a well-deserved break!",
                                ),
                                Some(PomodoroPhase::ShortBreak)
                                | Some(PomodoroPhase::LongBreak) => {
                                    ("Break ended", "Break ended. Ready to focus again!")
                                }
                                None => (
                                    "Focus session complete",
                                    "Focus session complete. Time for a well-deserved break!",
                                ),
                            };
                            NotificationRequest::new(
                                format!("pomodoro_finish_{}", session.id),
                                NotificationCategory::Pomodoro,
                                title,
                                body,
                            )
                        }
                        _ => Err(bbq_core::BbqError::Validation(
                            "No notification for stopwatch completion".to_string(),
                        )),
                    };

                    if let Ok(req) = notif_res {
                        let _ = notif_timer.notify(req);
                    }
                }
                bbq_core::BbqEvent::TimerStarted(session)
                | bbq_core::BbqEvent::TimerPaused(session)
                | bbq_core::BbqEvent::TimerResumed(session)
                | bbq_core::BbqEvent::TimerReset(session)
                | bbq_core::BbqEvent::TimerPhaseChanged(session)
                | bbq_core::BbqEvent::TimerChanged(session) => {
                    let _ = app_timer.emit("bbq://timer_changed", session);
                }
                _ => {}
            }))
            .await;

        // 6. Forward reminder events to frontend
        let app_rem = app_handle.clone();
        let _ = reminder_clone.subscribe_events(Arc::new(move |event| match event {
            bbq_core::BbqEvent::ReminderCreated(rem)
            | bbq_core::BbqEvent::ReminderCancelled(rem)
            | bbq_core::BbqEvent::ReminderFired(rem)
            | bbq_core::BbqEvent::ReminderChanged(rem) => {
                let _ = app_rem.emit("bbq://reminder_changed", rem);
            }
            _ => {}
        }));

        // 7. Forward notification events to frontend
        let app_notif = app_handle.clone();
        let _ = notif_clone.subscribe_events(Arc::new(move |event| match event {
            bbq_core::BbqEvent::NotificationRequested(req)
            | bbq_core::BbqEvent::NotificationDelivered(req)
            | bbq_core::BbqEvent::NotificationUnavailable(req) => {
                let _ = app_notif.emit("bbq://notification_changed", req);
            }
            _ => {}
        }));

        // 8. Forward launcher events to frontend
        let app_launcher = app_handle.clone();
        let _ = launcher_clone.subscribe_events(Arc::new(move |event| match event {
            bbq_core::BbqEvent::LauncherItemsChanged(items)
            | bbq_core::BbqEvent::LauncherRecentChanged(items)
            | bbq_core::BbqEvent::LauncherFavoritesChanged(items) => {
                let _ = app_launcher.emit("bbq://launcher_changed", items);
            }
            bbq_core::BbqEvent::LauncherActionCompleted { item_id, action } => {
                let _ = app_launcher.emit(
                    "bbq://launcher_changed",
                    serde_json::json!({
                        "item_id": item_id,
                        "action": action,
                        "status": "completed"
                    }),
                );
            }
            bbq_core::BbqEvent::LauncherActionFailed { item_id, error } => {
                let _ = app_launcher.emit(
                    "bbq://launcher_changed",
                    serde_json::json!({
                        "item_id": item_id,
                        "error": error,
                        "status": "failed"
                    }),
                );
            }
            _ => {}
        }));

        // 9. Forward drop events to frontend
        let app_drop = app_handle.clone();
        let _ = drop_clone
            .subscribe_events(Arc::new(move |event| match event {
                bbq_core::BbqEvent::DropBatchInspected(batch) => {
                    let _ = app_drop.emit(
                        "bbq://drop_changed",
                        serde_json::json!({
                            "type": "inspected",
                            "batch": batch
                        }),
                    );
                }
                bbq_core::BbqEvent::DropActionExecuted(result) => {
                    let _ = app_drop.emit(
                        "bbq://drop_changed",
                        serde_json::json!({
                            "type": "action_executed",
                            "result": result
                        }),
                    );
                }
                _ => {}
            }))
            .await;

        // 10. Forward display events to frontend
        let app_disp = app_handle.clone();
        let _ = display_clone
            .subscribe_events(Arc::new(move |event| {
                if let bbq_core::BbqEvent::DisplayChanged(info) = event {
                    let _ = app_disp.emit("bbq://display_changed", info);
                }
            }))
            .await;

        // 11. Forward hotkey events to frontend
        let app_hk = app_handle.clone();
        let _ = hotkey_clone.start().await;
        let disp_svc = hotkey_disp_svc.clone();
        let win_svc = hotkey_win_svc.clone();
        let _ = hotkey_clone
            .subscribe_events(Arc::new(move |event| match event {
                bbq_core::BbqEvent::HotkeyTriggered { id, display_str } => {
                    let window_opt = app_hk.get_webview_window("main");
                    let d_svc = disp_svc.clone();
                    let w_svc = win_svc.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Ok(active_display) = d_svc.get_active_display().await {
                            let geo = bbq_core::calculate_island_geometry(
                                &active_display,
                                bbq_core::IslandLayoutState::Expanded,
                                None,
                                bbq_core::IslandAnchor::TopCenter,
                            );
                            if let Some(ref window) = window_opt {
                                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                                    width: geo.width as f64,
                                    height: geo.height as f64,
                                }));
                                let _ = window.set_position(tauri::Position::Logical(
                                    tauri::LogicalPosition {
                                        x: geo.x as f64,
                                        y: geo.y as f64,
                                    },
                                ));
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            let _ = w_svc.apply_geometry(&geo).await;
                        }
                    });
                    let _ = app_hk.emit(
                        "bbq://hotkey_triggered",
                        serde_json::json!({
                            "id": id,
                            "display_str": display_str
                        }),
                    );
                }
                bbq_core::BbqEvent::HotkeyConflict {
                    id,
                    display_str,
                    reason,
                } => {
                    let _ = app_hk.emit(
                        "bbq://hotkey_conflict",
                        serde_json::json!({
                            "id": id,
                            "display_str": display_str,
                            "reason": reason
                        }),
                    );
                }
                _ => {}
            }))
            .await;
    });
}
