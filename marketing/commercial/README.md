# Disband commercial (16:9)

Source for the 40-second Disband promotional commercial: 1920×1080, 60 fps,
H.264 + AAC. Every frame and every sound is generated from this folder, so
the film can be re-timed, re-worded or re-rendered without an editing suite.

## Build

Requirements: Node 22, Python 3 with `numpy` and `scipy`, an `ffmpeg` with
libx264, and Chromium for Playwright (`npx playwright install chromium` on a
fresh machine).

```bash
npm install
npm run capture   # UI recreations -> build/textures/*.png
npm run audio     # soundtrack + sound design -> build/audio/mix.wav
npm run render    # frames -> build/frames/ (resumable; ~20 min on 4 cores)
npm run encode    # -> build/disband-commercial-16x9-1080p.mp4
```

`npm run preview` renders a quick 30 fps draft with fewer 3D samples.
`node tools/still.mjs 1.5 21.3` renders single frames to `build/stills/` for review.

## How it fits together

| Path | What it does |
|---|---|
| `src/timeline.js` | Every cue in seconds. The picture and the soundtrack both read it, so re-timing a moment moves its sound with it. |
| `src/stage.html`, `src/stage.js` | Composes frame *t*: typography scenes in the DOM (logo click and inversions, kinetic type, the counter, the globe line, the end card), the product shots on a WebGL canvas beneath. |
| `src/shots.js` | The six 3D shots: camera paths, device choreography and on-screen UI animation (screen switch, iOS sheet, settings opening, typing, the phone-to-desktop message). |
| `src/engine3d.js` | Offline renderer. Each frame averages jittered samples, which gives anti-aliasing, lens depth of field and motion blur in one pass, then composites onto pure white. |
| `src/devices.js`, `src/studio-env.js`, `src/contact-shadow.js` | Procedural phone, display and laptop; the softbox lighting environment; baked floor shadows. |
| `ui/ios.html`, `ui/desktop.html`, `ui/card.html` | The app screens shown on the devices (see below). |
| `tools/audio.py` | Synthesises the music (120 BPM) and every effect, mixes, and masters to about −15 LUFS / −1.2 dBTP. |
| `tools/render.mjs`, `tools/encode.sh` | Parallel headless frame capture and the delivery encode (BT.709). |

## About the screens

The iOS screens recreate the 1.13 redesign (server rail, raised panel,
floating dock, #random, You, Discover) from device captures and the SwiftUI
sources in `ios/DisbandiOS/Views/Shell`. The desktop screens follow
`src/components/discord/*` with the Midnight theme tokens from `globals.css`,
matching the AMOLED theme on iOS since the theme is shared per account.

Only the App Review demo personas and spaces appear (Iris Bennet, Theo Marsh,
Sam Whitfield, Nova Reyes, Mila Oduya, Kai Tanaka, Disband Demo HQ, Design
Lab). Real members' names, photos and messages, and third-party branding,
are deliberately left out of a public ad for a privacy product. The signed-in
persona is a placeholder, "Riley Park".

## Credits

Inter typeface, SIL Open Font License (`assets/fonts/OFL.txt`). Twemoji
graphics © Twitter, Inc. and contributors, CC BY 4.0. three.js, MIT. The
Disband mark in `assets/logo/` is traced from the iOS app icon glyph and is
© Genysis IQ.
