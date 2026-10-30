# "The Way It Used to Feel." — art direction and morph plan (internal)

Source: `/Users/joshclark/Projects/disband-classic` at `6a2aa144` (2026-10-21),
re-captured on 2026-10-22 because the classic UI was polished after the
previous spot (messages, server rail, attachments, DM profile rail, globals).
Captures: `build/morph/{main,dm}.png` (1440×900 at 3×) with part rectangles in
`{main,dm}.json` from `morph/capture.mjs`.

## Palette (from `src/app/globals.css`, classic dark tokens)

| Use in the film | Token | Value |
|---|---|---|
| Void / background | (below `bg-floating`) | #0b0c0e |
| Floating surfaces, slab edges | `--bg-floating` | #111214 |
| Rail, edge undersides | `--bg-tertiary` | #1e1f22 |
| Columns | `--bg-secondary` | #2b2d31 |
| Chat | `--bg-primary` | #313338 |
| Type layers (depth) | `--interactive-muted` → `--text-muted` | #4e5058 → #949ba4 |
| Headlines | `--header-primary` | #f2f3f5 |
| The one accent (only where the UI itself uses it) | `--brand` | #5865f2 |

No gradients, no neon, no colour that is not in the app. Light is white and
directional: two thin rim strips and a soft top fill, so window edges catch a
line of light and the UI itself stays exactly as captured.

## Morph language (every piece is a crop of the real UI)

1. **Assembly** — a point opens into the mark's outline (four edges); the edges
   split outward and the six regions of the window (rail, channel column, chat
   header, chat body, composer, member column) fly in and snap together.
2. **Rail → strip → channels** — the nine rail items (measured rectangles)
   leave the window, line up as a horizontal strip that travels across the
   frame, turn over on the strip's long axis, and come out as the eleven
   channel-column rows, which fold back into their exact places in the column.
3. **Through the boundary** — the camera runs down the channel list and crosses
   the column edge into the conversation.
4. **Bands** — the window splits into eleven full-width bands cut at the real
   message-group edges; they fan out in depth, flip, and close up as the DM
   view (same rectangles from `dm.png`), so the second state is exact.
5. **Convergence** — the DM view breaks into its six regions, which flip in
   flight to the main view's regions and converge into the whole app.
6. **Signature** — the four columns fold inward along their boundaries into one
   block, which turns once; at its edge the block becomes the extruded mark.

Type: Inter 800 caps, built from stacked layers in the UI's greys so words have
depth, separate while moving, and settle flat and crisp.
