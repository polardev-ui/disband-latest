//! Game activity for the desktop app.
//!
//! Two sources, both reported to the webview as events; the webview decides
//! what to publish and respects the person's "share my activity" setting.
//!
//! 1. Detection. Every 15 seconds the running processes are checked against
//!    a list of known games, and anything launched from a Steam or Epic
//!    library folder counts as a game named after that folder.
//! 2. Rich Presence. Games built for Discord announce what the player is
//!    doing over a local socket named `discord-ipc-N`. We listen on the first
//!    free one, so with Discord closed those games talk to Disband instead,
//!    and developers can point any Discord RPC library at us. (macOS and
//!    Linux; Windows uses named pipes and is not wired up yet.)

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Serialize, Default)]
pub struct DetectedGame {
    pub name: String,
    /// Seconds since the Unix epoch when the game's process started.
    pub started_at: u64,
}

#[derive(Clone, Serialize)]
pub struct RpcActivity {
    pub client_id: String,
    pub pid: Option<u32>,
    /// The raw Discord `activity` object; `None` once the game clears it.
    pub activity: Option<Value>,
}

#[derive(Default)]
pub struct ActivityState {
    game: Mutex<Option<DetectedGame>>,
    rpc: Mutex<HashMap<u64, RpcActivity>>,
}

#[derive(Serialize)]
pub struct ActivitySnapshot {
    game: Option<DetectedGame>,
    rpc: Vec<RpcActivity>,
}

/// What is happening right now, for a webview that loaded after the events.
#[tauri::command]
pub fn current_activity(state: State<'_, Arc<ActivityState>>) -> ActivitySnapshot {
    ActivitySnapshot {
        game: state.game.lock().map(|g| g.clone()).unwrap_or(None),
        rpc: state
            .rpc
            .lock()
            .map(|m| m.values().filter(|a| a.activity.is_some()).cloned().collect())
            .unwrap_or_default(),
    }
}

pub fn start(app: &AppHandle) {
    let state = Arc::new(ActivityState::default());
    app.manage(state.clone());
    detect::spawn(app.clone(), state.clone());
    #[cfg(unix)]
    ipc::spawn(app.clone(), state);
}

mod detect {
    use super::{ActivityState, DetectedGame};
    use std::sync::Arc;
    use std::time::Duration;
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System, UpdateKind};
    use tauri::{AppHandle, Emitter};

    /// Executable names (lower case, no extension) of popular games.
    const KNOWN: &[(&str, &str)] = &[
        ("robloxplayerbeta", "Roblox"),
        ("robloxplayer", "Roblox"),
        ("fortniteclient-win64-shipping", "Fortnite"),
        ("valorant-win64-shipping", "VALORANT"),
        ("league of legends", "League of Legends"),
        ("cs2", "Counter-Strike 2"),
        ("dota2", "Dota 2"),
        ("rocketleague", "Rocket League"),
        ("gta5", "Grand Theft Auto V"),
        ("gta5_enhanced", "Grand Theft Auto V"),
        ("r5apex", "Apex Legends"),
        ("overwatch", "Overwatch 2"),
        ("genshinimpact", "Genshin Impact"),
        ("among us", "Among Us"),
        ("terraria", "Terraria"),
        ("stardew valley", "Stardew Valley"),
        ("rustclient", "Rust"),
        ("eldenring", "ELDEN RING"),
        ("fallguys_client_game", "Fall Guys"),
        ("deadbydaylight-win64-shipping", "Dead by Daylight"),
        ("cod", "Call of Duty"),
        ("marvel-win64-shipping", "Marvel Rivals"),
    ];

    /// Things that live in a game folder but are not the game.
    const NOT_GAMES: &[&str] = &[
        "unitycrashhandler64", "unitycrashhandler32", "crashreportclient", "crashpad_handler",
        "steamwebhelper", "steamerrorreporter", "easyanticheat", "easyanticheat_eos", "battleye",
        "beservice", "launcher", "epicwebhelper", "vc_redist.x64", "dxsetup", "uninstall",
    ];

    pub fn spawn(app: AppHandle, state: Arc<ActivityState>) {
        std::thread::spawn(move || {
            // No process list on this system (a locked-down sandbox): no detection.
            let Ok(mut sys) = System::new_with_specifics(RefreshKind::nothing()) else { return };
            let mut last: Option<String> = None;
            loop {
                let game = scan(&mut sys);
                let key = game.as_ref().map(|g| g.name.clone());
                if key != last {
                    last = key;
                    if let Ok(mut slot) = state.game.lock() {
                        *slot = game.clone();
                    }
                    let _ = app.emit("activity://game", game);
                }
                std::thread::sleep(Duration::from_secs(15));
            }
        });
    }

    fn scan(sys: &mut System) -> Option<DetectedGame> {
        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet).with_cmd(UpdateKind::OnlyIfNotSet),
        );
        let mut best: Option<DetectedGame> = None;
        for process in sys.processes().values() {
            let Some(name) = game_name(process) else { continue };
            let started_at = process.start_time();
            // The longest-running match is the game itself rather than a helper it spawned.
            if best.as_ref().map_or(true, |b| started_at < b.started_at) {
                best = Some(DetectedGame { name, started_at });
            }
        }
        best
    }

    fn game_name(process: &sysinfo::Process) -> Option<String> {
        let exe_name = process.name().to_string_lossy().to_lowercase();
        let stem = exe_name.strip_suffix(".exe").unwrap_or(&exe_name).to_string();
        if NOT_GAMES.contains(&stem.as_str()) {
            return None;
        }
        if let Some((_, title)) = KNOWN.iter().find(|(exe, _)| *exe == stem) {
            return Some((*title).to_string());
        }
        // Minecraft runs inside Java.
        if stem == "java" || stem == "javaw" {
            let is_minecraft = process
                .cmd()
                .iter()
                .any(|arg| arg.to_string_lossy().contains("net.minecraft"));
            return is_minecraft.then(|| "Minecraft".to_string());
        }
        let path = process.exe()?.to_string_lossy().replace('\\', "/");
        for marker in ["/steamapps/common/", "/Epic Games/"] {
            if let Some(at) = path.find(marker) {
                let folder = path[at + marker.len()..].split('/').next()?.trim();
                if folder.is_empty()
                    || folder.eq_ignore_ascii_case("Steamworks Shared")
                    || folder.eq_ignore_ascii_case("SteamVR")
                    || folder.eq_ignore_ascii_case("Launcher")
                {
                    return None;
                }
                return Some(folder.to_string());
            }
        }
        None
    }
}

#[cfg(unix)]
mod ipc {
    use super::{ActivityState, RpcActivity};
    use serde_json::{json, Value};
    use std::io::{Read, Write};
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use tauri::{AppHandle, Emitter};

    const HANDSHAKE: u32 = 0;
    const FRAME: u32 = 1;
    const CLOSE: u32 = 2;
    const PING: u32 = 3;
    const PONG: u32 = 4;
    const MAX_FRAME: u32 = 64 * 1024;

    static NEXT_CONN: AtomicU64 = AtomicU64::new(1);

    /// Where Discord's own client (and every RPC library) looks for the socket.
    fn socket_dir() -> PathBuf {
        for var in ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"] {
            if let Ok(dir) = std::env::var(var) {
                if !dir.is_empty() && std::path::Path::new(&dir).is_dir() {
                    return PathBuf::from(dir);
                }
            }
        }
        PathBuf::from("/tmp")
    }

    /// The first `discord-ipc-N` nobody is listening on. A file left behind
    /// by a crash refuses connections and is taken over.
    fn bind() -> Option<(UnixListener, PathBuf)> {
        let dir = socket_dir();
        for i in 0..10 {
            let path = dir.join(format!("discord-ipc-{i}"));
            if path.exists() {
                if UnixStream::connect(&path).is_ok() {
                    continue;
                }
                let _ = std::fs::remove_file(&path);
            }
            if let Ok(listener) = UnixListener::bind(&path) {
                return Some((listener, path));
            }
        }
        None
    }

    pub fn spawn(app: AppHandle, state: Arc<ActivityState>) {
        std::thread::spawn(move || {
            let Some((listener, _path)) = bind() else { return };
            for stream in listener.incoming().flatten() {
                let app = app.clone();
                let state = state.clone();
                std::thread::spawn(move || {
                    let id = NEXT_CONN.fetch_add(1, Ordering::Relaxed);
                    let mut client_id = String::new();
                    let _ = serve(stream, &app, &state, id, &mut client_id);
                    // Disconnected: whatever it was showing ends with it.
                    let was = state.rpc.lock().ok().and_then(|mut m| m.remove(&id));
                    if let Some(prev) = was {
                        if prev.activity.is_some() {
                            let _ = app.emit("activity://rpc", RpcActivity { activity: None, ..prev });
                        }
                    }
                });
            }
        });
    }

    fn read_frame(stream: &mut UnixStream) -> std::io::Result<(u32, Value)> {
        let mut header = [0u8; 8];
        stream.read_exact(&mut header)?;
        let op = u32::from_le_bytes(header[0..4].try_into().unwrap());
        let len = u32::from_le_bytes(header[4..8].try_into().unwrap());
        if len > MAX_FRAME {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "frame too large"));
        }
        let mut body = vec![0u8; len as usize];
        stream.read_exact(&mut body)?;
        Ok((op, serde_json::from_slice(&body).unwrap_or(Value::Null)))
    }

    fn write_frame(stream: &mut UnixStream, op: u32, payload: &Value) -> std::io::Result<()> {
        let body = serde_json::to_vec(payload).unwrap_or_default();
        let mut out = Vec::with_capacity(8 + body.len());
        out.extend_from_slice(&op.to_le_bytes());
        out.extend_from_slice(&(body.len() as u32).to_le_bytes());
        out.extend_from_slice(&body);
        stream.write_all(&out)
    }

    fn serve(
        mut stream: UnixStream,
        app: &AppHandle,
        state: &Arc<ActivityState>,
        id: u64,
        client_id: &mut String,
    ) -> std::io::Result<()> {
        loop {
            let (op, msg) = read_frame(&mut stream)?;
            match op {
                HANDSHAKE => {
                    *client_id = msg.get("client_id").and_then(Value::as_str).unwrap_or_default().chars().take(40).collect();
                    let ready = json!({
                        "cmd": "DISPATCH",
                        "evt": "READY",
                        "data": {
                            "v": 1,
                            "config": { "cdn_host": "cdn.discordapp.com", "api_endpoint": "//discord.com/api", "environment": "production" },
                            "user": { "id": "0", "username": "disband", "discriminator": "0", "global_name": "Disband", "avatar": null, "bot": false, "flags": 0, "premium_type": 0 }
                        },
                        "nonce": null
                    });
                    write_frame(&mut stream, FRAME, &ready)?;
                }
                FRAME => {
                    let cmd = msg.get("cmd").and_then(Value::as_str).unwrap_or_default().to_string();
                    let nonce = msg.get("nonce").cloned().unwrap_or(Value::Null);
                    let mut data = Value::Null;
                    if cmd == "SET_ACTIVITY" {
                        let args = msg.get("args").cloned().unwrap_or(Value::Null);
                        let activity = args.get("activity").filter(|a| !a.is_null()).cloned();
                        let pid = args.get("pid").and_then(Value::as_u64).map(|p| p as u32);
                        data = activity.clone().unwrap_or(Value::Null);
                        let update = RpcActivity { client_id: client_id.clone(), pid, activity };
                        if let Ok(mut map) = state.rpc.lock() {
                            map.insert(id, update.clone());
                        }
                        let _ = app.emit("activity://rpc", update);
                    }
                    // Everything else (subscriptions, invites) is acknowledged and ignored.
                    write_frame(&mut stream, FRAME, &json!({ "cmd": cmd, "data": data, "evt": null, "nonce": nonce }))?;
                }
                PING => write_frame(&mut stream, PONG, &msg)?,
                CLOSE => return Ok(()),
                _ => {}
            }
        }
    }
}
