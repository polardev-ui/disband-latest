"use client";

import { DECORATIONS } from "@/components/shop/effects/Decorations";
import { LottieEffect } from "@/components/shop/effects/LottieEffect";
import { lottieSrc, shopItem } from "@/lib/shop";
import { AnimatedCosmetic } from "./AnimatedCosmetic";
import { FlightCosmetic } from "./FlightCosmetic";
import { SketchDecoration } from "./SketchDecoration";

/**
 * Artwork mounted over an avatar, with a transparent opening for the photo.
 *
 * Sized in percentages of the avatar rather than pixels, because the same
 * decoration has to sit correctly on a 24px row avatar and a 96px profile
 * one. Each raster asset declares its calibrated opening scale and offset.
 */
export function AvatarDecoration({
  itemId,
  scale,
  playing = true,
}: {
  itemId: string | null | undefined;
  scale?: number;
  playing?: boolean;
}) {
  if (!itemId) return null;
  const item = shopItem(itemId);
  if (!item || !item.overAvatar) return null;

  const art = lottieSrc(itemId);
  const renderedScale = scale ?? item.art?.scale ?? (item.sketch === "graphite" ? 1.3 : item.sketch ? 1.22 : item.flight ? 1.5 : 1.38);
  const percent = `${renderedScale * 100}%`;
  const offset = ((renderedScale - 1) / 2) * -100;

  return (
    <span
      className="pointer-events-none absolute"
      style={{ width: percent, height: percent, left: `${offset}%`, top: `${offset + (item.art?.offsetY ?? 0) * 100}%`, zIndex: 2 }}
      aria-hidden
    >
      {item.sketch ? <SketchDecoration design={item.sketch} playing={playing} /> : item.flight ? <FlightCosmetic design={item.flight} playing={playing} /> : item.art ? <AnimatedCosmetic art={item.art} playing={playing} /> : art ? <LottieEffect src={art} /> : <DrawnDecoration itemId={itemId} />}
    </span>
  );
}

function DrawnDecoration({ itemId }: { itemId: string }) {
  const Drawn = DECORATIONS[itemId];
  return Drawn ? <Drawn /> : null;
}
