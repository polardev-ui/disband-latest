# Flight collection

Three new illustrated sets, each with an avatar decoration and a matching profile skin. All purchases are permanent; matching pieces are sold separately.

| Collection | Decoration | Profile skin | Motion |
| --- | ---: | ---: | --- |
| Aurelian | $4.99 | $6.49 | Slow opening feather wings, delayed return, swinging opal, glints |
| Nightflight | $4.49 | $5.99 | Folded bat wings with a sharper downstroke, crescent swing, starlight |
| Roseling | $3.99 | $5.49 | Paired butterfly flutters with a rest, heart swing, drifting petals |

Prices are chosen as modest one-time cosmetic purchases within the existing shop range. These are proposed launch prices, not a revenue forecast or market benchmark.

## Artwork and animation

Original transparent PNG atlases were created with the built-in imagegen tool. Sources are in `art/shop/source/flight/`. WebP delivery atlases are in `public/shop/art/flight/`; conversion preserves alpha at quality 90, with lossless alpha. Each atlas contains a frame, left wing, right wing, and pendant. CSS selects each quadrant without extra image downloads.

`FlightCosmetic.tsx` animates each wing around its attachment point using independent 3D transforms. Jewelry uses a separate pendulum loop; accents use their own timing. The circular frame stays fixed, and the avatar opening stays transparent. Profile skins compose the wings at the lower corners and pendants at the upper edges, keeping the central profile readable.

Motion pauses when offscreen, when the page is hidden, or when the gallery is paused. OS reduced motion and the app's reduced-motion setting disable motion. The same renderer is used by the shop, gallery, chat avatars, and profile overlays.

## Activation

Run `supabase/migrations/0116_flight_shop_collection.sql` in the Supabase SQL editor after the existing shop migrations. RLS remains enabled under the existing catalogue policy; do not disable it. The migration adds the six stable IDs and prices. It does not change ownership or payment history. A rerun preserves operator changes to prices, sale prices, and availability.

The existing Stripe checkout reads prices from the database and grants ownership through its existing webhook. No new Stripe products need to be created manually. Production sales require both the migration and deployment of these code/assets. No live purchase or production database modification was performed in this task.

Preview locally at `http://127.0.0.1:3200/shop-gallery`.

## Generation prompts

### aurelian

Use case: stylized-concept. Asset type: transparent layered sprite atlas for premium Disband avatar decorations. Create one polished original 1024x1024 RGBA illustration sheet, clean transparent background, precisely four equal 512x512 quadrants with generous empty gutters. No text, no labels, no grid. AURELIAN: ivory feather angel wings, brushed antique gold fittings, opal enamel, refined hand-painted game cosmetic, crisp silhouette and subtle ink contours, expressive elegant detailing rather than photorealistic.
TOP LEFT quadrant: a perfectly circular thin gold ornamental avatar frame, centered at (256,256), outer diameter 420px, transparent hole diameter 360px; small opal details and gold filigree only around circumference. No wings on this ring.
TOP RIGHT quadrant: ONE isolated LEFT angel wing extending upward-left, root at lower-right of its quadrant, layered ivory feathers with warm pale gold shadow, five long primary feathers with separated tips. Fit inside quadrant with 45px margin.
BOTTOM LEFT quadrant: matching isolated RIGHT angel wing extending upward-right, root lower-left, mirrored feather structure. Fit with 45px margin.
BOTTOM RIGHT quadrant: one separate slender dangling opal teardrop pendant suspended on a short gold chain, centered and filling middle half of quadrant.
Each of these four objects completely separate, never cross quadrant boundaries. The center of the ring and all empty areas genuinely alpha transparent. No background glow rectangle, no avatar, no lettering. Production-quality saleable illustration with deliberate shape design.

### nightflight

Use case: stylized-concept. Asset type: layered sprite atlas for Disband premium avatar cosmetics. A single square transparent RGBA sheet with four equal quadrants, no text or grid, objects separated by clear gutters. NIGHTFLIGHT theme: gothic ink-blue bat wings, plum membranes with delicate silver constellation veins, dark oxidized silver jewelry and amethyst. Elegant hand-painted game illustration with crisp contours, readable small, polished and original. Top LEFT quadrant: a perfectly circular thin dark silver avatar frame with amethyst settings at compass points, transparent circular hole approximately 72% of quadrant width, ring entirely within quadrant. No wings attached to ring. Top RIGHT quadrant: one isolated LEFT bat wing fanning upward-left from its root at lower-right; three elongated fingers, scalloped edge, rich violet translucent-looking membrane, constellation details. Bottom LEFT quadrant: mirrored isolated RIGHT bat wing, root lower-left, fan upward-right. Bottom RIGHT quadrant: a separate crescent silver moon pendant on a short chain with one dangling amethyst star. Each sprite fully contained within its own quadrant, 25px minimum margin, maximum usable artwork size. Genuinely transparent background and ring center. No avatar, no lettering, no luminous background haze. Wings are independent rigging pieces.

### roseling

Use case: stylized-concept. Asset type: transparent layered sprite atlas for Disband premium avatar cosmetics. One square RGBA sheet arranged precisely as four equal quadrants. Original ROSELING theme: soft rose-pink butterfly wings, cream enamel, copper rose-gold jewelry, tiny sculpted cherry blossoms, strawberry-pink gemstones. Beautiful hand-painted collectible game cosmetic with clean strong silhouette and restrained finely inked detail, readable at small sizes. Top LEFT quadrant: perfectly circular thin rose-gold avatar frame decorated with small cherry blossoms and tiny leaves along circumference, transparent opening 72% of quadrant width. No wings attached. Top RIGHT quadrant: one isolated LEFT butterfly wing with two rounded scalloped lobes, extending upward-left, root toward lower-right, pink and peach translucent-looking cells with thin rose gold veins, small cream spots along edge. Bottom LEFT quadrant: matching isolated RIGHT butterfly wing, root lower-left and fanning upward-right. Bottom RIGHT quadrant: separate small hanging heart-shaped rose quartz jewel on a slender chain with two petal charms. Exactly these four isolated sprites, generous empty gutters at quadrant boundaries, no object extends outside its quadrant. True transparent background, hole in ring alpha transparent, no cast shadow panel. No text, labels, grid, avatar or watermark.
