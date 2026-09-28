# Desktop auto-updates

The desktop app now updates itself: it checks on launch, tells you a new
version is ready, counts down three seconds, downloads it, installs it and
relaunches.

What it replaced was a **full-screen wall** that blocked the entire app the
moment a newer release existed, ending with *"Desktop updates are installed
manually — quit Disband, install the new version, then reopen the app."* You
could not use Disband until you had gone and done that by hand.

| Piece | Where |
| --- | --- |
| The toast, countdown and install | `src/components/desktop/UpdateToast.tsx` |
| Plugin registration | `src-tauri/src/lib.rs` (desktop only) |
| Endpoint and public key | `src-tauri/tauri.conf.json` → `plugins.updater` |
| Permissions | `src-tauri/capabilities/default.json` |
| Manifest publishing | `.github/workflows/main.yml` → `includeUpdaterJson: true` |

## It is not live yet — it needs a signing key

Tauri will not install an update it cannot verify, which is the right way
round: the updater replaces the running binary, so an unsigned manifest is a
remote code execution primitive. `pubkey` is currently empty, so every check
fails closed.

**Until you do the three steps below, the app falls back** to a dismissible
toast with a download link — the old GitHub-release check, minus the blocking
wall. Nothing is broken in the meantime; it just is not automatic.

### 1. Generate a keypair

```bash
pnpm tauri signer generate -w ~/.tauri/disband.key
```

Two things come out: a **private key** (the file, plus the password you set)
and a **public key** it prints. The private key signs releases — it is not
recoverable and losing it means every installed client stops accepting
updates until they reinstall by hand.

### 2. Put the public key in the config

`src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "<the public key it printed>"
  }
}
```

This one is safe to commit — it is the half that verifies, not the half that
signs.

### 3. Add the private key to GitHub Actions

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/disband.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you set |

**Never commit the private key.** `*.key` is not currently in `.gitignore`;
keep it outside the repo entirely, as above.

## How a release reaches people

`tauri-action` builds the installers, signs them, and — with
`includeUpdaterJson: true` — writes `latest.json` alongside them. The app
polls:

```
https://github.com/polardev-ui/disband-latest/releases/latest/download/latest.json
```

`releases/latest` always resolves to the newest non-prerelease, so nothing
needs updating per release. Branch builds are marked `prerelease: true` and
are therefore invisible to the updater, which is what you want — a test build
should not roll out to everyone.

## Behaviour worth knowing

- **Three seconds, then it goes.** "Not now" is always there, and declining is
  remembered *per version*, so skipping 2.31.0 does not hide 2.32.0.
- **Windows uses `installMode: "passive"`** — a progress bar, no prompts, no
  UAC dialog per update.
- **A failed update never blocks the app.** It says so and retries next
  launch.
- **Re-checks every six hours** for a window left open for days.

## Not done

- **Nothing pauses an update during a call.** A relaunch mid-call would drop
  it. The countdown is short and manual dismissal works, but the honest fix is
  for `UpdateToast` to hold off while `VoiceSessionContext` reports an active
  session.
- **The Rust side is unverified.** Cargo is not installed on the machine this
  was written on, so `tauri-plugin-updater`/`tauri-plugin-process` were added
  to `Cargo.toml` and registered in `lib.rs` without a local `cargo check`.
  The first CI desktop build will confirm it.
