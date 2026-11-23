# Spectre sticker pack

Thirteen animated stickers of Spectre, Disband's mascot. The pack ships as a built-in pack:
the Lottie files and WebP fallbacks are copied to `public/stickers/spectre/` and listed in
`BUILT_IN_PACKS` (`src/lib/stickers.ts`) and in `ExpressionStore.builtInPacks` on iOS.

| Sticker | Loop | Frames | Lottie | What happens |
| --- | --- | --- | --- | --- |
| Hello | 2.5 s | 150 @ 60 fps | `lottie/spectre-hello.json` | Anticipation dip, overshooting arm raise, four waves with the wrist and upper arm lagging the forearm, eased drop, blink |
| LOL | 2.0 s | 120 @ 60 fps | `lottie/spectre-lol.json` | Two laughing fits of four chuckles, leaning side to side, hands on belly, "HA" pops, tears of joy |
| Sad | 2.0 s | 120 @ 60 fps | `lottie/spectre-sad.json` | Two sobs (breath in, sharp catch, shudder), drooping ear, tear streams and drips, one hand rubbing an eye |
| Love | 2.0 s | 120 @ 60 fps | `lottie/spectre-love.json` | Lub-dub heartbeat twice a loop driving a big heart and heart eyes, hands on cheeks, slow swoon, floating hearts |
| Party | 2.4 s | 144 @ 60 fps | `lottie/spectre-party.json` | Crouch, stretched take-off, hang time, squashed landing with overshoot, confetti burst, arm pumps |
| Typing | 2.0 s | 120 @ 60 fps | `lottie/spectre-typing.json` | Sitting behind a laptop, mashing the keys with alternating fists (20 slams a loop); the laptop hops and rocks on every slam, impact ticks, keys fly off, screen glow on his face |
| Sleepy | 3.0 s | 180 @ 60 fps | `lottie/spectre-sleepy.json` | Two slow breaths, a drooping nod and a jerk awake, a sleep bubble that swells, shrinks and pops, Zs drifting up |
| Hmm | 2.5 s | 150 @ 60 fps | `lottie/spectre-thinking.json` | Mitt rubbing his chin, other hand on hip, eyes glancing up and across, a blink, question marks popping and wobbling |
| Shocked | 2.0 s | 120 @ 60 fps | `lottie/spectre-shocked.json` | A flinch, then a jolt: hop, arms flung up to his face, eyes wide, ear straight up, "!", sweat drops and shock lines, trembling, settling back |
| Angry | 2.0 s | 120 @ 60 fps | `lottie/spectre-angry.json` | Stomping in place with clenched fists, shaking, frowning lids, steam puffs and a throbbing anger mark |
| Cool | 2.5 s | 150 @ 60 fps | `lottie/spectre-cool.json` | Shades on, hands on hips, nodding to a beat; pushes the shades up, a glint sweeps the lenses, sparkles |
| Dance | 2.0 s | 120 @ 60 fps | `lottie/spectre-dance.json` | Four beats at 120 bpm: bounce, hip sway, disco points switching every two beats, stepping feet, music notes |
| Shrug | 2.0 s | 120 @ 60 fps | `lottie/spectre-shrug.json` | Shoulders up, mitts turned up and out, head tilted with a flat look and a blink, then back down |

Open `preview.html` in a browser to see them all playing side by side at sticker size
(160 px), full size (320 px) and in a 440 px inspector with frame stepping, slow motion,
a loop-seam player, a frame-rate readout and the WebP fallback alongside. The page has the
pinned lottie-web build and all five animations inlined, so it works offline from disk.

## Try them in the app (dev server only)

`pnpm dev`, open any chat and use the sticker button between GIF and emoji. The picker
works like Discord's: search, a rail on the left with Favourites, Recently used and one
icon per pack (click to jump, or just scroll), hover to play, click to send, right-click
for Favourite Sticker, Copy Sticker ID and Copy Sticker Image Link. Click a sticker in
chat for its name and pack. `/dev/preview` has the same composer over sample chats where
nothing is sent anywhere.

- `pack.json` lists the stickers (name, search tags, poster frame). Any folder in
  `design/stickers/` with a `pack.json` becomes a pack.
- `src/app/api/dev/stickers` serves the packs, but only on `next dev` and only when
  `DISBAND_LOCAL_STICKERS` is set (it is, in the gitignored `.env.development.local`).
  Production builds have no packs, so the sticker button doesn't appear.
- A sticker message stores only `{ type: "sticker", url: <sticker id>, name }` in the
  message's `attachments` array (no schema change). Sending one in a real chat writes a
  real message: other people's apps don't have the art, so the web shows them an empty
  message and the phone apps an unknown attachment. Use `/dev/preview` or a test space
  to keep it to yourself. Notes can't take stickers (no `attachments` column).

## Format (matches Discord's sticker rules)

- Lottie JSON (Bodymovin 5.12 schema), 320 × 320, 60 fps, shape layers only: no images,
  no expressions, no fonts. Every file is under 512 KiB and every loop is under 5 s.
- Discord's limits: stickers are exactly 320 × 320; uploads up to 512 KiB; animated
  stickers up to 5 s; formats PNG, APNG, GIF or Lottie; Lottie must be vector only and can
  only be uploaded by Verified or Partnered servers. Sources: Discord developer docs
  (Sticker resource), Discord blog "How to create and upload your own stickers on
  Discord" (2025) and "Unleash your creativity with stickers on Discord" (2021).
- Style follows Discord's own packs: flat cartoon fills, bold dark outlines, a little
  cel shading and short seamless loops of about two seconds.
- Features used: parenting, alpha track mattes, even-odd fills, one radial gradient (the
  eye glow) and trim paths (tear highlights). All are supported by lottie-web, Lottie for
  Android and iOS, and rlottie/ThorVG.
- Fallbacks: `fallback/spectre-*.webp`, animated WebP at 320 × 320 and 60 fps (frames
  alternate 17/17/16 ms so the average is exact). They are 0.8–1.2 MB each because nearly
  every pixel changes at 60 fps; a 30 fps or 160 px version would be 2–4× smaller. APNG was
  tried and dropped: 3–5 MB per sticker, far over Discord's 512 KiB raster cap.

## How it is made

Everything is generated; nothing was drawn by hand in a design tool.

- `src/tools/trace_reference.py` traces the front view of the turnaround (hood and ear
  silhouette, face opening, rim, cel-shading tones, pocket, legs and boots, cuffs and
  mitts) into point lists in `src/lib/shapes.mjs`. The colours come from posterising the
  render into five lavender tones.
- `src/lib/spectre.mjs` is the rig: root, body and head layers with squash and stretch,
  sleeves, expression lids (sad droop and an angry frown), smile, laugh and heart eyes, a flexible ear, and
  drawstrings and ear driven by damped springs that are simulated to a steady loop so the
  follow-through is seamless. The sleeves sit over the head under an alpha matte of the
  hood's drape, so they tuck under the hood when hanging and pass in front when raised.
- `src/stickers/*.mjs` hold the five animations as per-frame poses built from eased
  keys (anticipation, overshoot, settle).
- `src/lib/lottie.mjs` samples every property once per frame and keeps only the keyframes
  needed for linear interpolation to stay within a fraction of a pixel, so the motion is
  exact at 60 fps and in between frames on high-refresh screens.

Rebuild:

```bash
node src/build.mjs                       # Lottie JSON into lottie/
node src/preview.mjs                     # preview.html
node src/export.mjs /tmp/spectre-frames  # every frame as PNG, plus fallback/*.webp
python3 src/tools/check_frames.py /tmp/spectre-frames/*   # loop and frame-rate checks
```

`export.mjs` renders with the pinned lottie-web in headless Chrome. It uses the
`playwright-core` copy in `marketing/commercial` and Puppeteer's cached
`chrome-headless-shell`; set `PLAYWRIGHT_CORE` and `CHROME_PATH` to use others. It also
needs `img2webp` (libwebp). Run it with `nice`; it takes a few minutes.

Re-trace (only if the reference changes):

```bash
python3 src/tools/trace_reference.py <turnaround.png> src/lib/shapes.mjs
```

## Arms

Each sleeve is two rigid tapered capsules (upper arm and forearm, 84 → 74 units wide, as thick
as the cuff at the wrist) that only rotate, so a moving arm costs a few numbers per frame
instead of a reshaped path. Both pieces have one flat fill and their outline under their own
fill, so nothing changes where they meet and a straight or bent arm reads as one tube. The
forearm is drawn on top and its outline leaves out the elbow end, so a folded arm (a mitt at
the chin, a raised fist) still shows the forearm over the upper arm. A short glint near the
shoulder is the only shading, so there's no band to break at the elbow. The traced cuff and
mitt are drawn at 0.76 of their traced size, which puts them in the turnaround's proportions
(cuff about 1.1 eye-heights across). At rest the arms hang in a slight A-pose so they read
apart from the torso. Bent poses are set with joint angles (`a1`, `a2`) worked out from
`armGeometry`, not IK targets, so the elbow goes where it should. A sticker can set
`armsInFront: true` to keep both arms in front of the hood all loop (a static matte, which
saves file size).

## Checks

`check_frames.py` compares consecutive rendered frames. For every sticker, every frame
differs from the one before it (no held frames), and the change from the last frame back
to the first is no bigger than a normal frame-to-frame change, so the loops have no
visible seam. The preview's inspector also counts distinct frames drawn per second with
sub-frame interpolation off; it reads 60.

Sample frames from every sticker were also rendered with ThorVG (`@lottiefiles/dotlottie-web`
0.80, the engine behind LottieFiles' players) and compared with lottie-web. The mean pixel
difference was under 0.7/255 in every case, i.e. anti-aliasing only, so the mattes, even-odd
fills, gradient and trim paths render the same in both engines.

## Before anything ships

- `design/` is not in `.vercelignore` (unlike `art/`). Files outside `public/` are never
  served, but a `vercel deploy` from the repo root would upload them to the build.
- `vendor/lottie_light-5.13.0.min.js` is lottie-web 5.13.0 (MIT, licence alongside),
  npm integrity `sha512-+gfBXl6sxXMPe8tKQm7qzLnUy5DUPJPKIyRHwtpCpyUEYjHYRJC/5gjUvdkuO2c3JllrPtHXH5UJJK8LRYl5yQ==`.
