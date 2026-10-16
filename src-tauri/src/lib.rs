// Disband desktop bridge.
//
// Keep native (Rust) logic here, isolated from the shared web app in `src/`.
// Expose functionality to the frontend with `#[tauri::command]` and invoke it
// from TypeScript via `@tauri-apps/api`.

/// macOS WebView `Notification` does not reliably deliver when the app is
/// backgrounded; use native UserNotifications via mac-notification-sys instead.
#[cfg(target_os = "macos")]
#[tauri::command]
fn show_macos_notification(title: String, body: Option<String>) -> Result<(), String> {
    use mac_notification_sys::Notification;

    let mut notification = Notification::new();
    notification.title(&title);
    if let Some(ref message) = body {
        notification.message(message);
    }

    notification
        .send()
        .map(|_response| ())
        .map_err(|err| err.to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn show_macos_notification(_title: String, _body: Option<String>) -> Result<(), String> {
    Err("show_macos_notification is only available on macOS".into())
}

/// The notification pop, compiled into the binary so it never depends on a
/// bundle resource path.
#[cfg(target_os = "macos")]
const NOTIFICATION_POP: &[u8] = include_bytes!("../../public/sounds/notificationpop.mp3");

/// Play the notification pop natively.
///
/// The webview's audio is not dependable for this: WKWebView suspends its
/// AudioContext while the window is in the background — exactly when a
/// notification arrives — so the pop played only some of the time. A native
/// player is not throttled. The notification itself stays silent and this is
/// the one sound for it, so the two can never double up.
#[cfg(target_os = "macos")]
#[tauri::command]
fn play_notification_sound(app: tauri::AppHandle) -> Result<(), String> {
    use std::sync::OnceLock;
    use tauri::Manager;

    static POP_PATH: OnceLock<std::path::PathBuf> = OnceLock::new();
    let path = match POP_PATH.get() {
        Some(path) => path.clone(),
        None => {
            let dir = app.path().app_cache_dir().map_err(|err| err.to_string())?;
            std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
            let path = dir.join("notificationpop.mp3");
            std::fs::write(&path, NOTIFICATION_POP).map_err(|err| err.to_string())?;
            POP_PATH.get_or_init(|| path).clone()
        }
    };

    let mut child = std::process::Command::new("/usr/bin/afplay")
        .arg("-v")
        .arg("0.85")
        .arg(&path)
        .spawn()
        .map_err(|err| err.to_string())?;
    // Reap the player off the main thread so it never lingers as a zombie.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn play_notification_sound() -> Result<(), String> {
    Err("native notification sound is only available on macOS".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init());

    // Desktop only. The updater replaces the running binary and `process`
    // restarts it, neither of which means anything on a phone — and the
    // mobile targets have no updater artifacts to look for.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_macos_permissions::init());
    }

    // Desktop: closing the window hides Disband to the system tray instead
    // of quitting — chat, calls and music presence keep running. Full quit
    // happens explicitly from the tray menu (Quit Disband).
    #[cfg(desktop)]
    {
        builder = builder
            .on_window_event(|window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            })
            .setup(|app| {
                build_tray(app.handle())?;
                Ok(())
            });
    }

    builder
        .invoke_handler(tauri::generate_handler![show_macos_notification, play_notification_sound])
        .run(tauri::generate_context!())
        .expect("error while running the Disband desktop application");
}

#[cfg(desktop)]
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::{
        menu::{MenuBuilder, MenuItemBuilder},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let show = MenuItemBuilder::with_id("show", "Show Disband").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Disband").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Disband")
        .menu(&menu)
        .menu_on_left_click(false);
    // The bare Disband mark — no background tile — so the tray reads as a
    // glyph rather than a shrunken app tile. Falls back to the window icon
    // if the asset somehow fails to decode.
    let icon = tray_icon_for_platform().or_else(|| app.default_window_icon().cloned());
    if let Some(icon) = icon {
        tray = tray.icon(icon);
        // macOS template rendering tints the icon for light/dark menu bars.
        #[cfg(target_os = "macos")]
        {
            tray = tray.icon_as_template(true);
        }
    }
    let tray = tray.build(app)?;
    tray.on_menu_event(move |app, event| match event.id.as_ref() {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => app.exit(0),
        _ => {}
    });
    tray.on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
    Ok(())
}

/// The tray glyph, compiled into the binary: a black+alpha template on macOS
/// (the system recolours it for light/dark menu bars) and the brand-purple
/// rendition for Windows/Linux, which don't tint tray icons. Generated by
/// `icons/make_tray_icons.swift` from the shared Disband mark.
#[cfg(desktop)]
fn tray_icon_for_platform() -> Option<tauri::image::Image<'static>> {
    #[cfg(target_os = "macos")]
    {
        tauri::image::Image::from_bytes(include_bytes!("../icons/tray-macos.png")).ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png")).ok()
    }
}
