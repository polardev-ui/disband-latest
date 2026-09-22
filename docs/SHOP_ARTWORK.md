# Shop artwork (Lottie)

Shop cosmetics render through one of three paths, best first:

1. **Lottie artwork** — the item declares `lottie` in `src/lib/shop.ts`.
2. **Authored SVG scene** — drawn in code (`components/shop/effects/`).
3. **CSS class** — the original generated pass.

Only the first looks drawn, because it *is* drawn. The other two exist so an
item is never blank while its artwork is being made.

## Adding an animation

1. Export or download a `.lottie` (preferred, it is compressed) or `.json`.
2. Drop it in `public/shop/lottie/` named after the item id:
   `public/shop/lottie/fx-hydro.lottie`.
3. Name it on the catalogue entry:

   ```ts
   { id: "fx-hydro", name: "Hydro Bloom", …, lottie: "/shop/lottie/fx-hydro.lottie" }
   ```

That is the whole change. `ProfileOverlay` and `AvatarDecoration` both check
`lottie` first, so the item is promoted from the generated fallback to the real
artwork everywhere it renders at once — storefront preview, profile card,
member list.

Nothing needs a migration: `shop_items` holds the price and the id, and the
renderer is decided in the app.

## Which kind of asset goes where

| Slot | Canvas | Notes |
|---|---|---|
| Profile effect | square, ~400×400 | Plays over the whole card. Keep the middle readable — the card's name and avatar sit on top. It is dimmed to 45% on hover. |
| Avatar decoration | square, ~400×400 | The avatar fills the middle **~72%**; the frame overhangs on all sides. Set `overAvatar: true` on the item. If an asset is authored to a different margin, pass `scale` to `AvatarDecoration`. |

## Sourcing

LottieFiles is the usual source. Two things to check before shipping one:

- **Licence.** Free LottieFiles animations are mostly under their free licence,
  which generally allows commercial use *with attribution*; some are
  "Lottie Simple Licence" and some are author-restricted. These are being sold,
  so confirm per-file rather than assuming, and keep a record of the source URL
  and licence next to the asset.
- **Weight.** A profile card may have several on screen. Anything over a few
  hundred KB wants trimming in LottieFiles' optimiser first.

## Performance

`LottieEffect` loads the player with `ssr: false` and only when an effect is on
screen, so a person wearing nothing pays nothing. `prefers-reduced-motion` is
honoured at runtime: the animation renders its first frame and does not play.

## Testing

`/shop-gallery` renders every cosmetic with the same components the app uses,
including a Lottie wiring test. A new asset shows up there as soon as it is
named on a catalogue entry.
