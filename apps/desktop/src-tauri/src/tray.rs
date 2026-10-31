use bbq_core::BbqSettings;
use bbq_services::SettingsServiceTrait;
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

#[derive(Debug, Clone, Copy)]
pub struct TrayLocaleStrings {
    pub show: &'static str,
    pub toggle_expand: &'static str,
    pub switch_widget: &'static str,
    pub widget_system: &'static str,
    pub widget_media: &'static str,
    pub widget_timer: &'static str,
    pub widget_files: &'static str,
    pub widget_drop: &'static str,
    pub widget_clipboard: &'static str,
    pub widget_launcher: &'static str,
    pub always_on_top: &'static str,
    pub move_hud: &'static str,
    pub reset_position: &'static str,
    pub reload_widget: &'static str,
    pub settings: &'static str,
    pub launch_at_login: &'static str,
    pub about: &'static str,
    pub quit: &'static str,
}

pub fn get_tray_strings(lang: &str) -> TrayLocaleStrings {
    match lang.to_lowercase().as_str() {
        "tr" => TrayLocaleStrings {
            show: "BBQ'yu Göster",
            toggle_expand: "HUD'ı Genişlet / Daralt",
            switch_widget: "Widget Değiştir",
            widget_system: "Sistem",
            widget_media: "Medya",
            widget_timer: "Sayaç",
            widget_files: "Dosyalar",
            widget_drop: "Bırakma Rafı",
            widget_clipboard: "Pano",
            widget_launcher: "Başlatıcı",
            always_on_top: "Her Zaman Üstte",
            move_hud: "HUD'ı Taşı",
            reset_position: "Ada Konumunu Sıfırla",
            reload_widget: "Aktif Widget'ı Yenile",
            settings: "Ayarlar",
            launch_at_login: "Başlangıçta Çalıştır",
            about: "BBQ Hakkında",
            quit: "BBQ'dan Çık",
        },
        "de" => TrayLocaleStrings {
            show: "BBQ anzeigen",
            toggle_expand: "HUD erweitern / einklappen",
            switch_widget: "Widget wechseln",
            widget_system: "System",
            widget_media: "Medien",
            widget_timer: "Timer",
            widget_files: "Dateien",
            widget_drop: "Ablage",
            widget_clipboard: "Zwischenablage",
            widget_launcher: "Launcher",
            always_on_top: "Immer im Vordergrund",
            move_hud: "HUD verschieben",
            reset_position: "Island-Position zurücksetzen",
            reload_widget: "Aktives Widget neu laden",
            settings: "Einstellungen",
            launch_at_login: "Beim Anmelden starten",
            about: "Über BBQ",
            quit: "BBQ beenden",
        },
        "es" => TrayLocaleStrings {
            show: "Mostrar BBQ",
            toggle_expand: "Expandir / Contraer HUD",
            switch_widget: "Cambiar Widget",
            widget_system: "Sistema",
            widget_media: "Medios",
            widget_timer: "Temporizador",
            widget_files: "Archivos",
            widget_drop: "Estante de Entrega",
            widget_clipboard: "Portapapeles",
            widget_launcher: "Lanzador",
            always_on_top: "Siempre visible",
            move_hud: "Mover HUD",
            reset_position: "Restablecer posición de la Isla",
            reload_widget: "Recargar Widget Activo",
            settings: "Configuración",
            launch_at_login: "Iniciar al iniciar sesión",
            about: "Acerca de BBQ",
            quit: "Salir de BBQ",
        },
        "fr" => TrayLocaleStrings {
            show: "Afficher BBQ",
            toggle_expand: "Développer / Réduire le HUD",
            switch_widget: "Changer de Widget",
            widget_system: "Système",
            widget_media: "Médias",
            widget_timer: "Minuteur",
            widget_files: "Fichiers",
            widget_drop: "Zone de Dépôt",
            widget_clipboard: "Presse-papiers",
            widget_launcher: "Lanceur",
            always_on_top: "Toujours au premier plan",
            move_hud: "Déplacer le HUD",
            reset_position: "Réinitialiser la position de l'Îlot",
            reload_widget: "Recharger le Widget Actif",
            settings: "Paramètres",
            launch_at_login: "Lancer au démarrage",
            about: "À propos de BBQ",
            quit: "Quitter BBQ",
        },
        _ => TrayLocaleStrings {
            show: "Show BBQ",
            toggle_expand: "Expand / Collapse HUD",
            switch_widget: "Switch Widget",
            widget_system: "System",
            widget_media: "Media",
            widget_timer: "Timer",
            widget_files: "Files",
            widget_drop: "Drop Shelf",
            widget_clipboard: "Clipboard",
            widget_launcher: "Launcher",
            always_on_top: "Always on Top",
            move_hud: "Move HUD",
            reset_position: "Reset Island Position",
            reload_widget: "Reload Active Widget",
            settings: "Settings",
            launch_at_login: "Launch at Login",
            about: "About BBQ",
            quit: "Quit BBQ",
        },
    }
}

pub fn build_tray_menu(
    app: &AppHandle,
    settings: &BbqSettings,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let loc = get_tray_strings(&settings.language);

    let show_item = MenuItemBuilder::with_id("show", loc.show).build(app)?;
    let toggle_expand_item =
        MenuItemBuilder::with_id("toggle_expand", loc.toggle_expand).build(app)?;

    let switch_submenu = SubmenuBuilder::with_id(app, "switch_menu", loc.switch_widget)
        .item(&MenuItemBuilder::with_id("switch_system", loc.widget_system).build(app)?)
        .item(&MenuItemBuilder::with_id("switch_media", loc.widget_media).build(app)?)
        .item(&MenuItemBuilder::with_id("switch_timer", loc.widget_timer).build(app)?)
        .item(&MenuItemBuilder::with_id("switch_files", loc.widget_files).build(app)?)
        .item(&MenuItemBuilder::with_id("switch_drop", loc.widget_drop).build(app)?)
        .item(&MenuItemBuilder::with_id("switch_clipboard", loc.widget_clipboard).build(app)?)
        .item(&MenuItemBuilder::with_id("switch_launcher", loc.widget_launcher).build(app)?)
        .build()?;

    let always_on_top_item = CheckMenuItemBuilder::with_id("always_on_top", loc.always_on_top)
        .checked(settings.always_on_top)
        .build(app)?;

    let move_hud_item = CheckMenuItemBuilder::with_id("move_hud", loc.move_hud)
        .checked(settings.move_hud)
        .build(app)?;

    let reset_pos_item =
        MenuItemBuilder::with_id("reset_position", loc.reset_position).build(app)?;
    let reload_item = MenuItemBuilder::with_id("reload", loc.reload_widget).build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", loc.settings).build(app)?;

    let autostart_item = CheckMenuItemBuilder::with_id("autostart", loc.launch_at_login)
        .checked(settings.start_at_login)
        .build(app)?;

    let about_item = MenuItemBuilder::with_id("about", loc.about).build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", loc.quit).build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&toggle_expand_item)
        .item(&switch_submenu)
        .separator()
        .item(&always_on_top_item)
        .item(&move_hud_item)
        .item(&reset_pos_item)
        .item(&reload_item)
        .separator()
        .item(&settings_item)
        .item(&autostart_item)
        .item(&about_item)
        .separator()
        .item(&quit_item)
        .build()?;

    Ok(menu)
}

pub fn update_tray_menu_internal(
    app: &AppHandle,
    settings: &BbqSettings,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(tray) = app.tray_by_id("bbq-tray") {
        let menu = build_tray_menu(app, settings)?;
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

/// Sets up the system tray icon and context menu for BBQ.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let settings = if let Some(state) = app.try_state::<crate::AppState>() {
        state.settings_service.get_settings().unwrap_or_default()
    } else {
        BbqSettings::default()
    };

    let menu = build_tray_menu(app, &settings)?;

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
        .on_menu_event(|app, event| {
            let event_id = event.id().as_ref();
            match event_id {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("bbq://show_island", ());
                }
                "toggle_expand" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("bbq://toggle_expand", ());
                }
                id if id.starts_with("switch_") => {
                    let widget_id = id.trim_start_matches("switch_");
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("bbq://switch_widget", widget_id);
                }
                "always_on_top" => {
                    if let Some(state) = app.try_state::<crate::AppState>() {
                        if let Ok(settings) = state.settings_service.get_settings() {
                            let next_val = !settings.always_on_top;
                            let _ = state
                                .settings_service
                                .update_setting("always_on_top", &next_val.to_string());
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.set_always_on_top(next_val);
                            }
                            if let Ok(updated) = state.settings_service.get_settings() {
                                let _ = app.emit("bbq://settings_changed", &updated);
                                let _ = update_tray_menu_internal(app, &updated);
                            }
                        }
                    }
                }
                "move_hud" => {
                    if let Some(state) = app.try_state::<crate::AppState>() {
                        if let Ok(settings) = state.settings_service.get_settings() {
                            let next_val = !settings.move_hud;
                            let _ = state
                                .settings_service
                                .update_setting("move_hud", &next_val.to_string());
                            if let Ok(updated) = state.settings_service.get_settings() {
                                let _ = app.emit("bbq://settings_changed", &updated);
                                let _ = update_tray_menu_internal(app, &updated);
                            }
                        }
                    }
                }
                "reset_position" => {
                    if let Some(state) = app.try_state::<crate::AppState>() {
                        let _ = state.settings_service.update_setting("move_hud", "false");
                        let _ = state
                            .settings_service
                            .update_setting("island_vertical_position", "top");
                        let _ = state
                            .settings_service
                            .update_setting("island_horizontal_position", "center");
                        let _ = state
                            .settings_service
                            .update_setting("island_position", "top-center");
                        if let Ok(updated) = state.settings_service.get_settings() {
                            let _ = app.emit("bbq://settings_changed", &updated);
                            let _ = update_tray_menu_internal(app, &updated);
                        }
                    }
                    let _ = app.emit("bbq://reset_position", ());
                }
                "reload" => {
                    let _ = app.emit("bbq://reload_widget", ());
                }
                "settings" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("bbq://open_settings", ());
                }
                "autostart" => {
                    if let Some(state) = app.try_state::<crate::AppState>() {
                        if let Ok(settings) = state.settings_service.get_settings() {
                            let next_val = !settings.start_at_login;
                            let _ = state
                                .settings_service
                                .update_setting("start_at_login", &next_val.to_string());
                            if let Ok(updated) = state.settings_service.get_settings() {
                                let _ = app.emit("bbq://settings_changed", &updated);
                                let _ = update_tray_menu_internal(app, &updated);
                            }
                        }
                    }
                }
                "about" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("bbq://open_about", ());
                }
                "quit" => {
                    tracing::info!("BBQ system tray: application quit requested");
                    app.exit(0);
                }
                _ => {}
            }
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
