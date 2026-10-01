"use client";

import { useState } from "react";
import { IconStar } from "@/components/icons";
import { safeImageUrl } from "@/lib/safe-url";
import { useGifFavorites } from "@/hooks/useGifFavorites";

const GIF_EXTS = new Set(["gif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "avif", "bmp"]);
const GIF_HOSTS = ["media.giphy.com", "media.tenor.com", "c.tenor.com", "i.imgur.com"];

function pathExt(url: string): string | null {
  try {
    const clean = new URL(url).pathname.toLowerCase();
    const m = clean.match(/\.([a-z0-9]{2,5})$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** gif, video, or image — or null for ordinary links. Client-side only. */
export function classifyLinkUrl(url: string): "gif" | "video" | "image" | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const ext = pathExt(url);
  if (ext && GIF_EXTS.has(ext)) return "gif";
  if (ext && VIDEO_EXTS.has(ext)) return "video";
  if (ext && IMAGE_EXTS.has(ext)) return "image";
  if (GIF_HOSTS.includes(host)) return "gif";
  return null;
}

function FavStar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={active ? "Remove from favorites" : "Save to favorites"}
      title={active ? "Remove from favorites" : "Save to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-[30%] bg-black/50 text-yellow-400 backdrop-blur-sm transition-transform hover:scale-110"
    >
      <IconStar size={15} className={active ? "fill-yellow-400" : ""} />
    </button>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A pasted GIF link becomes the GIF itself (favoritable), replacing the card. */
export function GifLinkEmbed({ url, onLoad }: { url: string; onLoad?: () => void }) {
  const { isFav, toggle } = useGifFavorites();
  const [hover, setHover] = useState(false);
  const [failed, setFailed] = useState(false);
  const fav = isFav(url);
  const src = safeImageUrl(url);
  if (!src || failed) return null;

  return (
    <div
      className="relative mt-1 max-w-md overflow-hidden rounded-lg border border-divider"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="GIF"
        loading="lazy"
        className="max-h-64 w-full bg-bg-secondary object-contain"
        onLoad={onLoad}
        onError={() => setFailed(true)}
      />
      {(hover || fav) && (
        <FavStar active={fav} onToggle={() => void toggle(url, hostnameOf(url), !fav)} />
      )}
    </div>
  );
}

/**
 * A pasted video/image link keeps its link card, with the playable media
 * rendered below it — same as an uploaded attachment.
 */
export function LinkedMedia({ url, kind, onLoad }: {
  url: string;
  kind: "video" | "image";
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = safeImageUrl(url);
  if (!src || failed) return null;
  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="mt-1 max-h-64 w-full max-w-md rounded-lg border border-divider bg-black"
        onLoadedData={onLoad}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="mt-1 max-h-64 w-full max-w-md rounded-lg border border-divider bg-bg-secondary object-contain"
      onLoad={onLoad}
      onError={() => setFailed(true)}
    />
  );
}
