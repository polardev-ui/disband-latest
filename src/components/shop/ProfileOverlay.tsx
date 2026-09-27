"use client";

import { PROFILE_SCENES } from "@/components/shop/effects/ProfileEffect";
import { LottieEffect } from "@/components/shop/effects/LottieEffect";
import { effectClass, lottieSrc, shopItem } from "@/lib/shop";
import { AnimatedCosmetic } from "./AnimatedCosmetic";

/**
 * The equipped profile effect, over a profile card.
 *
 * Animated raster artwork takes priority. Lottie, SVG, and CSS renderers remain
 * for older owned items. Keep profile content above this non-interactive layer.
 */
export function ProfileOverlay({ itemId, playing = true }: { itemId: string | null | undefined; playing?: boolean }) {
  if (!itemId) return null;

  const media = shopItem(itemId)?.art;
  if (media) return <div className="fx-overlay fx-overlay-art" aria-hidden><AnimatedCosmetic art={media} playing={playing} /></div>;

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
