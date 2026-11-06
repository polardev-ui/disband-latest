"use client";

import type { ReactNode } from "react";
import { PROFILE_SCENES } from "@/components/shop/effects/ProfileEffect";
import { LottieEffect } from "@/components/shop/effects/LottieEffect";
import { effectClass, lottieSrc, shopItem } from "@/lib/shop";
import { AnimatedCosmetic } from "./AnimatedCosmetic";
import { FlightCosmetic } from "./FlightCosmetic";
import { Skin } from "./skins/Skin";
import { SKIN_FLOOR } from "./skins/designs";

/**
 * The equipped profile effect, over a profile card.
 *
 * Drawn skins (components/shop/skins) take priority. Raster, Lottie, SVG, and
 * CSS renderers remain for older owned items. Keep profile content above this
 * non-interactive layer: the host card needs `isolate`, and what should read
 * over the art needs `relative z-10`.
 */
export function ProfileOverlay({ itemId, playing = true }: { itemId: string | null | undefined; playing?: boolean }) {
  if (!itemId) return null;

  const skin = shopItem(itemId)?.skin;
  if (skin) return <div className="fx-overlay fx-overlay-art" aria-hidden><Skin design={skin} playing={playing} /></div>;

  const flight = shopItem(itemId)?.flight;
  if (flight) return <div className="fx-overlay fx-overlay-art" aria-hidden><FlightCosmetic design={flight} profile playing={playing} /></div>;

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

/**
 * A panel with a background of its own inside a profile card (the inner card
 * on a popout, the mutuals box). With an effect equipped, the background goes
 * under the artwork and the content over it, so the art reads across the whole
 * card, as it does in the shop preview, and the text stays on top.
 */
export function ArtPanel({ art, className, background, children }: {
  art: boolean;
  className: string;
  background: string;
  children: ReactNode;
}) {
  if (!art) return <div className={`${className} ${background}`}>{children}</div>;
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className={`pointer-events-none absolute inset-0 rounded-[inherit] ${background}`} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Room under a profile's content for the equipped skin's ground, so the scene
 * isn't drawn behind the last lines of text. Put it last in the card's
 * content. Vertical padding in % is a share of the width, which is how the
 * artwork is sized too.
 */
export function SkinFloor({ itemId }: { itemId: string | null | undefined }) {
  const skin = itemId ? shopItem(itemId)?.skin : undefined;
  if (!skin) return null;
  return <div aria-hidden className="shrink-0" style={{ paddingBottom: `${SKIN_FLOOR[skin]}%` }} />;
}
