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

## One step left: the private key in CI

The keypair exists (`~/.tauri/disband.key`, key id `4FEDEFE8A3A66116`) and the
**public** half is already committed in `src-tauri/tauri.conf.json`. That is
the half that verifies, so it belongs in the repo.

Tauri will not install an update it cannot verify, which is the right way
round: the updater replaces the running binary, so an unsigned manifest is a
remote code execution primitive.

**Until the private key is in GitHub Actions, releases are unsigned** and the
app falls back to a dismissible toast with a download link — the old
GitHub-release check, minus the blocking wall.

### Add the private key to GitHub Actions

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/disband.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password set when generating it |

```bash
# Prints the private key so you can paste it into the secret.
cat ~/.tauri/disband.key
```

The workflow already reads both (`.github/workflows/main.yml`), so the next
release after adding them ships a signed `latest.json` and updates start
flowing on their own.

**Keep `~/.tauri/disband.key` out of the repo.** `*.key` is in `.gitignore`
now, but the file lives outside the working tree and should stay there. It is
not recoverable: lose it and every installed client stops accepting updates
until people reinstall by hand. Back it up somewhere you trust.

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
