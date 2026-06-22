// Disband desktop bridge.
//
// Keep native (Rust) logic here, isolated from the shared web app in `src/`.
// Expose functionality to the frontend with `#[tauri::command]` and invoke it
// from TypeScript via `@tauri-apps/api`.

/// Example command callable from the web layer:
///   import { invoke } from "@tauri-apps/api/core";
///   await invoke("greet", { name: "Disband" });
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! Disband desktop bridge is live.")
}

/// macOS WebView `Notification` does not reliably deliver when the app is
/// backgrounded; use native UserNotifications via mac-notification-sys instead.
#[cfg(target_os = "macos")]
#[tauri::command]
fn show_macos_notification(title: String, body: Option<String>) -> Result<(), String> {
    use mac_notification_sys::{Notification, NotificationResponse};

    let mut notification = Notification::new();
    notification.title(&title);
    if let Some(ref message) = body {
        notification.message(message);
    }
    notification.sound("Ping");

    match notification.send() {
        NotificationResponse::Success | NotificationResponse::Click => Ok(()),
        NotificationResponse::Failure(err) => Err(err),
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn show_macos_notification(_title: String, _body: Option<String>) -> Result<(), String> {
    Err("show_macos_notification is only available on macOS".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![greet, show_macos_notification])
        .run(tauri::generate_context!())
        .expect("error while running the Disband desktop application");
}
