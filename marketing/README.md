# Marketing assets

## App Store screenshots

`appstore/` holds six 1320×2868 PNGs — the iPhone 6.9" size App Store Connect
requires. Upload them in order; the numbering is the display order.

Regenerate after a UI change:

```bash
python3 marketing/build-appstore-shots.py
```

`source-captures/` holds the raw simulator captures the panels are built from.
To refresh them, run the app on an iPhone simulator, sign in, and capture with:

```bash
xcrun simctl status_bar <udid> override --time "9:41" \
  --cellularBars 4 --wifiBars 3 --batteryState charged --batteryLevel 100
xcrun simctl io <udid> screenshot marketing/source-captures/01-servers.png
```

The status bar override matters: Apple's own marketing uses 9:41, and a real
clock with a half-empty battery looks unfinished.

## Rules these follow

- **Guideline 2.3.3** — screenshots must show the app in use. Every panel is a
  real capture from the running app, not a mockup.
- **No Apple trademarks.** The demo account's avatar and banner are Apple's
  logo, so the profile screen is deliberately *not* used; the Appearance screen
  covers personalisation instead.
- No system alerts in frame. A keychain "Save Password?" prompt and a
  notification permission dialog both appeared during capture and were
  dismissed before shooting.
