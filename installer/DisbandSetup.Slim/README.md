# DisbandSetup.Slim — framework-dependent twin of the fat stub

Same branded UI, same always-fetches-latest flow, one extra first step:
if the shared **.NET 10 Desktop Runtime** is missing, it downloads and
installs it once (silent, one UAC prompt), then proceeds exactly like the
fat build. Result: a **~200KB** exe instead of ~172MB.

## Build (from macOS)

```sh
cd installer/DisbandSetup.Slim
dotnet publish -c Release -r win-x64 --self-contained false
# -> bin/Release/net10.0-windows/win-x64/publish/DisbandSetup.exe
```

## Why it never needs rebuilding either

- Same `Program.cs` as the fat stub (shared source, `SLIM` define only
  toggles the runtime preflight) — all the never-stale properties hold.
- `RollForward: Major` is baked into the runtimeconfig: when .NET 11/12
  ships, the stub runs on it with no rebuild.
- Runtime installer URL is the stable `aka.ms/dotnet/10.0/` link, with an
  ARM64 variant picked automatically on Arm machines.

## Tradeoffs vs the fat build

- Needs internet on first run either way (both download Disband itself).
- The runtime install needs **one admin approval**; afterwards everything
  is per-user again. Locked-down machines where that prompt is denied
  should use the fat `DisbandSetup.exe` instead.
- Registry check is HKLM `...\sharedfx\Microsoft.WindowsDesktop.App`
  version >= 10; exit codes 0/3010/1641 accepted, UAC-decline (1223) fails
  with a plain-English message instead of a crash.
