use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

/// Sets up the system tray icon and context menu for BBQ.
///
/// Features:
/// - Left-click: Restores, shows and focuses the BBQ window.
/// - Right-click context menu: Show / Open, Settings, and Quit.
/// - Clean termination: "Quit" triggers a graceful application exit (shutting down services & listeners).
/// - Zero polling / event-driven.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", "Show BBQ").build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit BBQ").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&settings_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id("bbq-tray")
        .tooltip("BBQ Productivity Island")
        .menu(&menu)
        .show_menu_on_left_click(false);

    // Load crisp embedded 32x32 branding icon, fallback to default window icon if needed
    if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")) {
        tray_builder = tray_builder.icon(icon);
    } else if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("bbq://show_island", ());
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("bbq://open_settings", ());
            }
            "quit" => {
                tracing::info!("BBQ system tray: application quit requested");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("bbq://show_island", ());
            }
        })
        .build(app)?;

    tracing::info!("BBQ system tray initialized successfully");
    Ok(())
}
