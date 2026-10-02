"use client";

import { IconStar } from "@/components/icons";
import { useGifFavorites } from "@/hooks/useGifFavorites";

/**
 * The star chrome itself — one implementation shared by the GIF picker and
 * every GIF rendered in chat, so "the same star UI" is literally the same
 * component. Paint-only over the media (a translucent squircle); the parent
 * owns positioning.
 */
export function FavStarButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={active ? "Remove from favorites" : "Save to favorites"}
      title={active ? "Remove from favorites" : "Save to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-[30%] bg-black/50 text-yellow-400 backdrop-blur-sm transition-transform hover:scale-110"
    >
      <IconStar size={15} className={active ? "fill-yellow-400" : ""} />
    </button>
  );
}

/**
 * The chat-side star. Appears on hover (`show`) and — the point of the
 * shared favorites list — stays visible and filled whenever this GIF is
 * already saved, no matter who sent it or which spelling of the URL they
 * used.
 */
export function GifFavStar({ url, title, show }: {
  url: string;
  title?: string | null;
  show?: boolean;
}) {
  const { isFav, toggle } = useGifFavorites();
  const fav = isFav(url);
  if (!show && !fav) return null;
  return <FavStarButton active={fav} onToggle={() => void toggle(url, title ?? null, !fav)} />;
}
