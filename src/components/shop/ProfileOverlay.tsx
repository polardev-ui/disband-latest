"use client";

import { PROFILE_SCENES } from "@/components/shop/effects/ProfileEffect";
import { effectClass } from "@/lib/shop";

/**
 * The equipped profile effect, over a profile card.
 *
 * Prefers the authored SVG scene for an item when one exists, and falls back
 * to the CSS-class effect for the items that have not been drawn yet. Both
 * sit inside `.fx-overlay`, which is what dims them to 45% on hover.
 */
export function ProfileOverlay({ itemId }: { itemId: string | null | undefined }) {
  if (!itemId) return null;

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
