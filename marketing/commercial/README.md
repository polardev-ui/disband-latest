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

## Android beta announcement

A second 40-second film announcing the Android beta shares the renderer,
devices and synth. Its picture lives in `android/` (timeline, shots, stage)
and its soundtrack in `tools/audio_android.py`.

```bash
npm run capture         # includes ui/android.html -> build/textures/android-*.png
npm run android:audio   # -> build/audio/android-mix.wav
npm run android:render  # -> build/android-frames/
npm run android:encode  # -> build/disband-android-beta-16x9-1080p.mp4
```

`STAGE=android/stage.html node tools/still.mjs 9 29.5` renders review stills.

## Vertical social spot (9:16)

"Your Space. Your Privacy." — a 20-second 1080×1920 spot for TikTok, YouTube
Shorts and Instagram Reels, at 60 fps. It shares the renderer, phone model and
synth: a beam of light finds the mark on black, a rim-lit phone rises out of the
dark and comes apart into its layers (chassis, display, server rail, panel,
dock, cover glass), the light floods to the white studio, the phone glides in
front of the extruded mark, and the end card holds disband.dev for over two
seconds. Picture in `vertical/`, soundtrack in `tools/audio_vertical.py`
(D minor resolving to F major, mastered to about −14 LUFS).

```bash
npm run capture          # includes ios-*.png used on the phone
npm run vertical:layers  # -> build/textures/layer-*.png (Messages and Disband Demo HQ split into layers)
npm run vertical:audio   # -> build/audio/vertical-mix.wav
npm run vertical:render  # -> build/vertical-frames/
npm run vertical:encode  # -> build/disband-vertical-9x16-1080p.mp4
```

`VIEWPORT=1080x1920 STAGE=vertical/stage.html node tools/still.mjs 1.6 7.6 18` renders review stills.

## "A New Way to Connect." (9:16)

A second 20-second 1080×1920 social spot, bright where the first is dark: a black
prism cut to the hull of the mark spins in and cuts to the logo; a phone from the
left meets the Messages panel from the right, the screen lifts into layers and
swaps to Disband Demo HQ; an iris out of the edge-on phone opens on two phones
standing on the floor; "SIMPLE." "SOCIAL." "DISBAND." each arrive with their own
move (scale, slide, depth) on the lift, the last folding into the mark; the end
card holds disband.dev for three seconds. Picture in `connect/`, soundtrack in
`tools/audio_connect.py` (A major, 120 BPM).

```bash
npm run capture && npm run vertical:layers
npm run connect:audio    # -> build/audio/connect-mix.wav
npm run connect:render   # -> build/connect-frames/
npm run connect:encode   # -> build/disband-connect-9x16-1080p.mp4
```

## "The internet is loud." (9:16)

The third 20-second 1080×1920 spot, built on contrast: in the dark, a field of
abstract interface fragments (notification panels, message bubbles, windows,
rings and frames; their marks are bars and dots, never text) rushes past the
camera under "The internet is loud."; at 3 s everything stops dead and the
sound drops to silence; the fragments drift off and one phone rises, a strip of
light running over its edges as the screen wakes; the screen lifts into seven
layers and comes home, then shows Disband Demo HQ, #random and You; the phone
recedes as the world turns white, and its silhouette morphs into the mark. The
end card holds DISBAND, "Find your space." and disband.dev for 2.4 seconds.
Picture in `loud/`, soundtrack in `tools/audio_loud.py` (on D, 120 BPM).

```bash
npm run capture && npm run vertical:layers
npm run loud:audio       # -> build/audio/loud-mix.wav
npm run loud:render      # -> build/loud-frames/
npm run loud:encode      # -> build/disband-loud-9x16-1080p.mp4
```

## "Not another boring app." (9:16)

The fourth 20-second 1080×1920 spot, the fastest: a black phone spins in from
the right and lands under "YOUR NEXT APP?"; its screen lifts off as a floating
panel, four more slide out behind it and the camera flies down the corridor
they make, under "MEET DISBAND." (white through a difference blend, so it reads
over the panels and the studio alike); a match cut on black lands on the back
of a phone, and four shots cut on the beat (the turn to the screen, the
Messages panel coming out, a push to Disband Demo HQ, two phones passing); three
phones snap into a row and the camera flies over them to the black extruded
mark; "YOUR." "PEOPLE." "DISBAND." on black, the last flipping into the mark;
the end card puts the mark beside a phone above "Privacy first, privacy
always.", "Explore Disband." and disband.dev (held 3 s). Picture in `nextapp/`,
soundtrack in `tools/audio_nextapp.py` (E minor to a G major climax, 120 BPM).

```bash
npm run capture && npm run vertical:layers
npm run nextapp:audio    # -> build/audio/nextapp-mix.wav
npm run nextapp:render   # -> build/nextapp-frames/
npm run nextapp:encode   # -> build/disband-nextapp-9x16-1080p.mp4
```

## How it fits together

| Path | What it does |
|---|---|
| `src/timeline.js` | Every cue in seconds. The picture and the soundtrack both read it, so re-timing a moment moves its sound with it. |
| `src/stage.html`, `src/stage.js` | Composes frame *t*: typography scenes in the DOM (logo click and inversions, kinetic type, the counter, the globe line, the end card), the product shots on a WebGL canvas beneath. |
| `src/shots.js` | The six 3D shots: camera paths, device choreography and on-screen UI animation (screen switch, iOS sheet, settings opening, typing, the phone-to-desktop message). |
| `src/engine3d.js` | Offline renderer. Each frame averages jittered samples, which gives anti-aliasing, lens depth of field and motion blur in one pass, then composites onto pure white. |
| `src/devices.js`, `src/studio-env.js`, `src/contact-shadow.js` | Procedural phone, display and laptop; the softbox lighting environment; baked floor shadows. |
| `ui/ios.html`, `ui/desktop.html`, `ui/card.html` | The app screens shown on the devices (see below). |
| `tools/audiolib.py`, `tools/audio.py` | The synth toolkit (instruments, effects, reverb, mastering) and the commercial's arrangement: music at 120 BPM and every effect, mastered to about −15 LUFS / −1.2 dBTP. |
| `android/*`, `ui/android.html`, `tools/audio_android.py` | The Android beta announcement: its cue sheet, phone shots, typography, Android screens and soundtrack. |
| `vertical/*`, `tools/audio_vertical.py` | The 9:16 social spot: cue sheet, dark/light phone shots and exploded layers, typography and light, layer capture, and its soundtrack. |
| `connect/*`, `tools/audio_connect.py` | "A New Way to Connect.": cue sheet, prism/converge/pair/type shots, type moves and iris, and its soundtrack. |
| `loud/*`, `tools/audio_loud.py` | "The internet is loud.": cue sheet, the fragment field, the layered phone and recede, the silhouette-to-mark morph, and its soundtrack. |
| `nextapp/*`, `tools/audio_nextapp.py` | "Not another boring app.": cue sheet, hero/corridor, the cut-on-beat shots, the row and the extruded mark, the word flip, and its soundtrack. |
| `tools/render.mjs`, `tools/encode.sh` | Parallel headless frame capture (`STAGE` picks the page, `VIEWPORT` its size) and the delivery encode (BT.709). |

## About the screens

The iOS screens recreate the 1.13 redesign (server rail, raised panel,
floating dock, #random, You, Discover) from device captures and the SwiftUI
sources in `ios/DisbandiOS/Views/Shell`. The desktop screens follow
`src/components/discord/*` with the Midnight theme tokens from `globals.css`,
matching the AMOLED theme on iOS since the theme is shared per account.
The Android screens recreate the current Android app (server rail, raised
panel, labelled floating dock, Material 3 chips) in Roboto with Material Design
icons, from device captures of the Disband Dark theme.

Only the App Review demo personas and spaces appear (Iris Bennet, Theo Marsh,
Sam Whitfield, Nova Reyes, Mila Oduya, Kai Tanaka, Disband Demo HQ, Design
Lab). Real members' names, photos and messages, and third-party branding,
are deliberately left out of a public ad for a privacy product. The signed-in
persona is a placeholder, "Riley Park".

## Credits

Inter typeface, SIL Open Font License (`assets/fonts/OFL.txt`). Roboto
typeface, SIL Open Font License (`assets/fonts/Roboto-OFL.txt`). Material
Design icons © Google, Apache License 2.0 (`assets/material-icons/LICENSE`). Twemoji
graphics © Twitter, Inc. and contributors, CC BY 4.0. three.js, MIT. The
Disband mark in `assets/logo/` is traced from the iOS app icon glyph and is
© Genysis IQ.
