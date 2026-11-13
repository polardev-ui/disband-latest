// The startup window, as Discord does it.
//
// Disband opens on a small window that checks for an update before anything
// else. If there is one it downloads and installs it there and then and
// restarts into it: an update can't be skipped. If there isn't, it says
// "Starting…" and hands over to the main window, which has been loading
// (hidden) the whole time, so the check costs next to nothing.
//
// It must never be able to keep Disband from opening. The check gives up
// after a few seconds (offline, GitHub slow, a manifest that won't verify),
// a failed download opens Disband anyway, and if the window itself can't be
// made the main window is shown straight away. Disband then nags from its
// in-app banner instead.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;

const LABEL: &str = "splash";

/// Still checking.
const CHECKING: u8 = 0;
/// An update was found and is downloading or installing.
const UPDATING: u8 = 1;
/// Disband has been opened.
const OPENED: u8 = 2;

/// How long the check may take before Disband opens without it.
const CHECK_LIMIT: Duration = Duration::from_secs(10);

pub fn start(app: &AppHandle) {
    // A development build has nothing to update to.
    if cfg!(debug_assertions) {
        show_main(app);
        return;
    }

    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("splash.html".into()))
        .title("Disband")
        .inner_size(300.0, 350.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        // Transparent, so the page can draw the window as a rounded card
        // (Discord's look) instead of a sharp-cornered rectangle. macOS needs
        // `macOSPrivateApi` for this, set in tauri.conf.json.
        .transparent(true)
        .shadow(true)
        .center()
        .focused(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .build();
    if built.is_err() {
        show_main(app);
        return;
    }

    let state = Arc::new(AtomicU8::new(CHECKING));

    // The time limit on the check. Not on the download: an update that has
    // started downloading is allowed to finish.
    {
        let app = app.clone();
        let state = state.clone();
        std::thread::spawn(move || {
            std::thread::sleep(CHECK_LIMIT);
            if state
                .compare_exchange(CHECKING, OPENED, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                open_disband(&app);
            }
        });
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let found = match app.updater() {
            Ok(updater) => updater.check().await.ok().flatten(),
            Err(_) => None,
        };

        let Some(update) = found else {
            if state
                .compare_exchange(CHECKING, OPENED, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                set_status(&app, "Starting\u{2026}", None);
                // Long enough to read, short enough not to notice.
                let app = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(450));
                    open_disband(&app);
                });
            }
            return;
        };

        // The time limit already opened Disband: its banner takes it from here.
        if state
            .compare_exchange(CHECKING, UPDATING, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        set_status(&app, "Downloading update\u{2026}", Some(0.0));
        let progress_app = app.clone();
        let finish_app = app.clone();
        let mut downloaded: u64 = 0;
        let mut shown: i64 = -1;
        let result = update
            .download_and_install(
                move |chunk, total| {
                    downloaded += chunk as u64;
                    if let Some(total) = total.filter(|t| *t > 0) {
                        let percent = ((downloaded as f64 / total as f64) * 100.0).min(100.0);
                        // Only when the whole number changes: this runs per chunk.
                        if percent as i64 != shown {
                            shown = percent as i64;
                            set_status(&progress_app, "Downloading update\u{2026}", Some(percent));
                        }
                    }
                },
                move || set_status(&finish_app, "Installing update\u{2026}", None),
            )
            .await;

        match result {
            Ok(()) => {
                set_status(&app, "Restarting\u{2026}", None);
                app.restart();
            }
            Err(_) => {
                // Couldn't install it here (a signature this build can't
                // verify, a dropped download). Open Disband; the banner
                // offers it again.
                state.store(OPENED, Ordering::SeqCst);
                open_disband(&app);
            }
        }
    });
}

/// Tells the splash page what is happening. Lost if the page hasn't loaded
/// yet, which is fine: it opens on "Checking for updates…".
fn set_status(app: &AppHandle, text: &str, progress: Option<f64>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let payload = serde_json::json!({ "text": text, "progress": progress });
        let _ = window.eval(&format!(
            "window.__disbandSplash && window.__disbandSplash({payload})"
        ));
    }
}

fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Shows the main window and closes the splash. `destroy`, not `close`: a
/// close request is turned into "hide to tray" for every window.
fn open_disband(app: &AppHandle) {
    show_main(app);
    if let Some(splash) = app.get_webview_window(LABEL) {
        let _ = splash.destroy();
    }
}
