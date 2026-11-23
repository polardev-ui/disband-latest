# Wisp sticker pack

Ten animated stickers of Wisp, built from her turnaround (`reference/wisp-turnaround.webp`).
The pack ships as its own built-in pack, a section of its own in the sticker picker next to
Spectre: the Lottie files and WebP fallbacks are copied to `public/stickers/wisp/` and listed
in `BUILT_IN_PACKS` (`src/lib/stickers.ts`) and `ExpressionStore.builtInPacks` on iOS.

| Sticker | Loop | Frames | What happens |
| --- | --- | --- | --- |
| Hi | 2.5 s | 150 | Anticipation dip, a mitt thrown up and four waves, tail swishing, a star pops by her hand |
| Yay | 2.4 s | 144 | Crouch, spring up with both mitts in the air, a burst of stars, squashed landing, arm pumps |
| Thanks | 2.5 s | 150 | Mitts clasped in front, a bow with happy closed eyes, held, back up; hearts and a sparkle float |
| Shy | 2.5 s | 150 | Mitts on her cheeks, blushing, eyes turned away, swaying, a foot twist and one peek at you |
| Sad | 2.0 s | 120 | Two sobs with drooping eyes and streaming tears, drips; tail and halo sag |
| Love | 2.0 s | 120 | Hugging a big heart that beats lub-dub twice a loop, swaying with a blush, hearts float up |
| Please | 2.0 s | 120 | Mitts clasped under her chin, big shiny wobbling eyes, head tilted, sparkles twinkle |
| Pout | 2.0 s | 120 | Hmph: head turned away with a frown, stiff fists, a foot stamp, crooked halo, bristling tail |
| Sleepy | 3.0 s | 180 | Dozing on her feet; her halo slips and dims as she nods off, she jerks awake; Zs drift up |
| Wink | 2.0 s | 120 | Leans in with a mitt by her face and winks; a star pops out and her own stars twinkle |

All are 320 × 320, 60 fps, vector-only Lottie under 512 KiB and under 5 s, like the Spectre
pack (see `../spectre/README.md` for the format, the checks and why the WebPs are all keyframes).

## The model

`src/lib/wisp.mjs` is her rig. Her parts were measured off the front view of the turnaround
(colour-segmented into lavender, navy and white, then traced row by row), in the same reference
units as Spectre: her eyes are 31 × 74 there, like his, so both share one scale.

- **Hood:** a still dome plus the tail, which is the only part that moves. The tail is drawn
  over the dome and closes through points inside it, so the join doesn't show. It bends about
  its root with a damped spring driven by her head's moves, and a travelling wave runs down it
  so it flutters like a flame (`tail`, `tailFlutter`).
- **Halo:** its own layer over her head, on a soft spring that trails her moves, with a slow
  float (`halo` for posing it: tilt, slip, dim).
- **Face:** the same eyes as Spectre (pills with a glow, droop and frown lids, happy arcs, laugh
  chevrons) plus `wink` (right eye closes into an arc), `shine` (pleading highlights) and
  `blush`.
- **Stars** on her hood and chest (`stars` scales them for a twinkle), a navy **scarf** that her
  hood tucks behind, a **tunic** with its zigzag hem, short **sleeves** that grow out of the tunic,
  ball **mitts** and boot **legs**.
- Arms are posed with joint angles (`a1`, `a2`) or `reach(target)`, which solves them so the
  mitt's centre lands on a point.

Rebuild:

```bash
node src/build.mjs                      # Lottie JSON into lottie/
node src/preview.mjs                    # preview.html
node src/export.mjs /tmp/wisp-frames    # every frame as PNG, plus fallback/*.webp
python3 ../spectre/src/tools/check_frames.py /tmp/wisp-frames/*
```
