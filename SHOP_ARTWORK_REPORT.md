# Illustrated profile cosmetics — September 22, 2026

## Delivered

Three original matching collections replace six existing products. Each has an
illustrated avatar decoration and a transparent animated profile skin. The
original item IDs and prices are retained, so existing owners receive the new
artwork without buying again.

| Collection | Avatar decoration | Profile skin | Existing IDs |
| --- | --- | --- | --- |
| Tideglass | $4.50 | $8.00 | `ring-bubble`, `fx-hydro` |
| Moonmoth | $5.50 | $8.00 | `ring-gold`, `fx-sakura-night` |
| Emberwing | $5.00 | $5.50 | `ring-flame`, `fx-embers` |

The designs use the references' general format: illustrated frames with clear
avatar openings, plus artwork around a readable profile. No Discord artwork,
characters, branding, or source files were copied. These are AI-generated
illustrations with an illustrated aesthetic, **not human-drawn commissions**.
They were created with the built-in OpenAI imagegen tool, then animated and
encoded locally. Exact prompts and generation provenance are in
`art/shop/sources.json`. Original PNGs are preserved in `art/shop/source/`.

## Actual animation files

`public/shop/art/` contains twelve production assets: six animated WebP files
and six static WebP alternatives. Each loop has 48 frames over four seconds,
with real alpha transparency. Motion is baked into the files: flowing wave
contours, gently flexing wings and feathers, and moving painted highlights.
These are subtle repeating ambient motions, not full character animation or
an opening cinematic. They do not rely on spinning a CSS border.

The ring exports are 256×256; profile skins are 320×480. Animated rings are
approximately 1.0–1.2 MiB each and skins 1.9–2.4 MiB. Only visible artwork
loads its animated version. Hidden tabs, offscreen media, reduced-motion
preferences, and the gallery's pause control switch to the still versions.
Failed animation loads also fall back to the still image. This avoids a
canvas renderer or additional animation runtime for the new collection.

Rebuild with `python3 scripts/render-shop-art.py` (Pillow and numpy required).
The source illustrations are never overwritten. Export dimensions, frame
counts, byte sizes, and alpha verification are recorded in
`art/shop/exports.json`.

## App changes

- `/shop-gallery` is now a collection browser and fitting room: avatar/profile
  tabs, personal name preview, dark/light preview, matching sets, chat-size
  examples, and a motion control. It links into the actual shop modal.
- The shop uses the same avatar and profile renderers as the app. Previously
  its ring previews omitted the decoration layer and its profile previews
  were too short to show the product.
- Equipped avatars use artwork-specific sizing to align the transparent
  opening with the photo. Profile text and controls stay above the artwork.
- Twenty-four unfinished legacy ring/overlay products are removed from new
  sales. Existing owners can still equip them. Name effects remain available.
- The checkout endpoint enforces the same product availability rule, so a
  direct request cannot purchase a retired preview. Existing server-side
  pricing, ownership checks, Stripe payment, and webhook grants remain in use.

## Supabase step

Run `supabase/migrations/0095_illustrated_shop_collection.sql` after the existing
`0092_shop.sql`. It synchronizes the six product names/descriptions and retires
the unfinished products from new sales. It does not change prices, ownership,
equipped selections, payment history, or permissions. **Keep RLS enabled**;
this migration neither disables nor modifies RLS policies.

The artwork and gallery work locally before this SQL runs. Apply it before
selling the renamed collection so Stripe checkout receives the correct
product names from the database. No database migration or live purchase was
executed against your Supabase/Stripe account during this work.

## Validation

- TypeScript typecheck passed.
- Browser checked at desktop size and 390px phone width: artwork loaded, no
  horizontal overflow, collection/category switching, editable preview name,
  dark/light previews, and the real shop modal worked; no browser errors found.
- Pause switched every gallery cosmetic to static media.
- All six animation files decoded to 48 frames / 4000ms. Every frame retained
  a transparent center. The last-to-first visual change was comparable to
  ordinary frame changes, with no anomalous jump at the loop boundary.
- Ran the SQL twice against an isolated local PGlite database: all 45 item IDs
  and prices survived, six new artwork products matched the catalog, and all
  24 retired products matched the server availability rule.
- A live Stripe payment and an authenticated purchase/equip round trip still
  need to be tested in your configured Stripe test environment before launch.

Preview: http://localhost:3000/shop-gallery
