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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running the Disband desktop application");
}
