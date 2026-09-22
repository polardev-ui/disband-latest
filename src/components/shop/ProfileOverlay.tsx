"use client";

import { PROFILE_SCENES } from "@/components/shop/effects/ProfileEffect";
import { LottieEffect } from "@/components/shop/effects/LottieEffect";
import { effectClass, lottieSrc } from "@/lib/shop";

/**
 * The equipped profile effect, over a profile card.
 *
 * Three renderers, in descending order of how good they look:
 *   1. Lottie artwork, when the item declares a `lottie` path — this is the
 *      one that looks drawn, because it is;
 *   2. an authored SVG scene, for items drawn in code;
 *   3. the CSS-class effect, for the items still on the original pass.
 *
 * Dropping an export into /public/shop/lottie and naming it on the catalogue
 * entry promotes an item from 3 to 1 with no other change.
 *
 * All three sit inside `.fx-overlay`, which is what holds them behind the card
 * content and eases them to 45% while it is hovered.
 */
export function ProfileOverlay({ itemId }: { itemId: string | null | undefined }) {
  if (!itemId) return null;

  const art = lottieSrc(itemId);
  if (art) {
    return (
      <div className="fx-overlay" aria-hidden>
        {/* Slightly under speed: a profile loop that runs at full rate reads
            as busy behind text. */}
        <LottieEffect src={art} speed={0.8} />
      </div>
    );
  }

  const Scene = PROFILE_SCENES[itemId];
  if (Scene) {
    return (
      <div className="fx-overlay" aria-hidden>
        <Scene />
      </div>
    );
  }

  const fallback = effectClass(itemId);
  if (!fallback) return null;
  return <div className={`fx-overlay ${fallback}`} aria-hidden />;
}
