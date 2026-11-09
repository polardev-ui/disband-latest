"use client";

import { IconStar } from "@/components/icons";
import { useGifFavorites } from "@/hooks/useGifFavorites";
import { useI18n } from "@/contexts/I18nContext";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * The star chrome itself — one implementation shared by the GIF picker and
 * every GIF rendered in chat, so "the same star UI" is literally the same
 * component. Paint-only over the media (a translucent squircle); the parent
 * owns positioning.
 */
export function FavStarButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={active ? t("Remove from favourites") : t("Save to favourites")}
      title={active ? t("Remove from favourites") : t("Save to favourites")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-yellow-400 transition-colors hover:bg-black/85"
    >
      <IconStar size={15} className={active ? "fill-yellow-400" : ""} />
    </button>
  );
}

/**
 * The chat-side star. On web/desktop it appears only on hover (`show`), even
 * for GIFs that are already saved, so it doesn't sit on top of them all the
 * time. On touch devices (no hover) it stays visible for saved GIFs so they
 * can still be unfavorited.
 */
export function GifFavStar({ url, title, show }: {
  url: string;
  title?: string | null;
  show?: boolean;
}) {
  const { isFav, toggle } = useGifFavorites();
  const isMobile = useIsMobile();
  const fav = isFav(url);
  // On web/desktop the star only appears on hover — even for GIFs that are
  // already favorites, so it doesn't sit on top of them all the time. On
  // touch devices there is no hover, so favorites keep a persistent star so
  // they can still be unfavorited.
  if (!show && !(isMobile && fav)) return null;
  return <FavStarButton active={fav} onToggle={() => void toggle(url, title ?? null, !fav)} />;
}
