"use client";

import { useState } from "react";
import { SolidStickerIcon } from "@/components/icons/SolidIcons";
import { useI18n } from "@/contexts/I18nContext";
import { getSpaceSticker, useExpressions } from "@/lib/expressions";
import { findPack, findSticker, fromSpaceSticker, useStickerPacks } from "@/lib/stickers";
import { openExpressionCard } from "../expressions/ExpressionCard";
import { StickerArt, usePrefersReducedMotion } from "./StickerArt";

/*
 A sticker sent in chat: 160px with no frame, like Discord's. It plays by
 itself while on screen (only on hover if the OS asks for less motion).
 Clicking it opens the sticker card. A sticker that can't be found shows as
 an empty sticker shape with its name.
*/

const SIZE = 160;

export function StickerMessage({ id, name }: { id: string; name?: string | null }) {
  const { t } = useI18n();
  const { packs, ready } = useStickerPacks();
  useExpressions();
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState(false);

  const local = findSticker(packs, id);
  const space = local ? null : getSpaceSticker(id);
  const sticker = local ?? (space ? fromSpaceSticker(space) : null);
  const pack = local ? findPack(packs, local.packId) : null;

  if (!sticker) {
    // Still looking: hold the space so the message doesn't jump.
    if (!ready || space === undefined) return <div className="mt-0.5" style={{ width: SIZE, height: SIZE }} aria-hidden />;
    return (
      <div
        className="mt-0.5 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border-subtle px-3 text-center text-text-muted"
        style={{ width: SIZE, height: SIZE }}
      >
        <SolidStickerIcon size={36} className="opacity-60" />
        <p className="text-[13px] font-medium leading-tight">{name || t("Sticker")}</p>
        <p className="text-[12px] leading-tight">{t("This sticker isn't available.")}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-sticker-message
      aria-label={t("{name} sticker", { name: sticker.name })}
      title={sticker.name}
      onClick={(e) =>
        openExpressionCard(e.currentTarget, {
          kind: "sticker",
          sticker,
          packName: pack?.name ?? null,
          serverId: sticker.serverId ?? null,
        })
      }
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="mt-0.5 block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand"
      style={{ width: SIZE, height: SIZE }}
    >
      <StickerArt sticker={sticker} size={SIZE} playing={!reduced || hover} />
    </button>
  );
}
