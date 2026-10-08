# DisbandSetup — prototype web-stub installer (Windows x64)

Branded bootstrapper in the spirit of Discord's `DiscordSetup.exe`: a small
window that fetches the **latest** Disband release from GitHub on every run,
installs it silently (per-user, no admin), and launches the app.

## It never needs rebuilding because…

Nothing versioned is baked in. On each run it calls
`api.github.com/repos/polardev-ui/disband-latest/releases/latest`, picks the
`*x64-setup.exe` asset (ARM64 Windows picks the arm64 one), downloads,
runs with `/S`, and resolves the installed exe from `%LocalAppData%\Disband`
at launch time. Only a repo move, an asset rename, or a GitHub API change
would require touching it.

## Build (from macOS)

```sh
cd installer/DisbandSetup
dotnet publish -c Release -r win-x64 --self-contained
# -> bin/Release/net10.0-windows/win-x64/publish/DisbandSetup.exe (~170MB, PE32+ GUI x64)
```

Self-contained on purpose: friends need no .NET installed. The size is the
whole runtime + WinForms; trimming is deliberately off (unverifiable from
here — a trimmed-but-broken exe is worse than a fat working one).

## Before sending it to anyone

- **SmartScreen will warn.** It is unsigned. Right-click → Properties →
  unblock if needed, then More info → Run anyway. (The Trusted Signing
  conversation covers fixing this properly.)
- Requires internet (it downloads the real installer).
- Installs silently per-user; no elevation prompts.
- Tested paths it handles: missing release/assets (clean error, nothing
  half-installed), installer non-zero exit, missing exe after install.

## Do NOT commit the exe

`bin/` and `obj/` are ignored. Share `DisbandSetup.exe` directly
(AirDrop/USB/Drive upload) — at ~170MB it exceeds GitHub's 100MB file
limit anyway.
