"use client";

import { DECORATIONS } from "@/components/shop/effects/Decorations";
import { LottieEffect } from "@/components/shop/effects/LottieEffect";
import { lottieSrc, shopItem } from "@/lib/shop";

/**
 * A decoration mounted over an avatar — the drawn frames (ears, wings, a
 * collar) rather than the generated rings.
 *
 * Sized in percentages of the avatar rather than pixels, because the same
 * decoration has to sit correctly on a 24px row avatar and a 96px profile
 * one. Artwork is authored with the avatar filling the middle ~72% of the
 * canvas, so the frame overhangs on every side; `scale` is the knob for an
 * asset that does not follow that convention.
 */
export function AvatarDecoration({
  itemId,
  scale = 1.38,
}: {
  itemId: string | null | undefined;
  scale?: number;
}) {
  if (!itemId) return null;
  const item = shopItem(itemId);
  if (!item || !item.overAvatar) return null;

  const art = lottieSrc(itemId);
  const percent = `${scale * 100}%`;
  const offset = `${((scale - 1) / 2) * -100}%`;

  return (
    <span
      className="pointer-events-none absolute"
      style={{ width: percent, height: percent, left: offset, top: offset }}
      aria-hidden
    >
      {art ? <LottieEffect src={art} /> : <DrawnDecoration itemId={itemId} />}
    </span>
  );
}

function DrawnDecoration({ itemId }: { itemId: string }) {
  const Drawn = DECORATIONS[itemId];
  return Drawn ? <Drawn /> : null;
}
