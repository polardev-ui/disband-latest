# Sketchbook collection

Four understated avatar decorations, with original SVG line art authored in the repository. No image downloads or animation library are needed for these designs.

| Design | One-time price | Motion |
| --- | ---: | --- |
| Graphite | $2.00 | Three irregular pencil contours alternate gently, like a short drawing loop |
| Blue Note | $2.49 | A small underline redraws, while a little star briefly tilts |
| Margins | $2.49 | Four rough brackets stay anchored; registration marks brighten in sequence |
| Red Thread | $2.99 | A short light follows the thin thread; the tied knot moves slightly |

These are avatar decorations only, so the profile-skin category excludes them. Gallery previews show them on an undecorated profile. The Steam pencil-outline example was used as a general direction, not copied artwork.

The shared motion hook pauses offscreen and hidden-page animations. Gallery pause, OS reduced motion, and Disband's reduced-motion setting are supported. The loops sit outside the avatar opening, preserving the photo at every animation step.

Run `supabase/migrations/0117_sketchbook_shop_collection.sql` in Supabase to add the four IDs and prices. Keep existing RLS enabled. The migration preserves operator pricing and availability when rerun. Deploy the code alongside the migration before offering these products in production.

Implementation: `src/components/shop/SketchDecoration.tsx` and `sketch-decorations.css`.
Preview: `http://127.0.0.1:3200/shop-gallery`.
