"use client";

import { useState } from "react";
import { safeImageUrl } from "@/lib/safe-url";
import { GifFavStar } from "./GifFavStar";
import { ImageLightbox } from "./ImageLightbox";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { VideoPlayer } from "./VideoPlayer";

// Re-exported so chat code keeps one import site; the logic lives in a pure
// module (src/lib/link-kind.ts) so it can be tested without React.
export { classifyLinkUrl } from "@/lib/link-kind";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * A pasted GIF link becomes the GIF itself (favoritable), replacing the card.
 * Clicking opens the same lightbox an uploaded GIF opens, and if the image
 * never loads the ordinary link card takes its place rather than leaving the
 * message with nothing where its link used to be.
 */
export function GifLinkEmbed({ url, onLoad }: { url: string; onLoad?: () => void }) {
  const [hover, setHover] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const src = safeImageUrl(url);
  if (!src || failed) return <LinkPreviewCard url={url} onLoad={onLoad} />;

  return (
    <div
      className="relative mt-1 max-w-md overflow-hidden rounded-lg border border-divider"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="block w-full cursor-zoom-in bg-bg-secondary text-left"
        title="Open GIF"
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
      </button>
      <GifFavStar url={url} title={hostnameOf(url)} show={hover} />
      <ImageLightbox
        open={lightbox}
        onClose={() => setLightbox(false)}
        src={src}
        alt="GIF"
        fileName={hostnameOf(url)}
        animated
      />
    </div>
  );
}

/**
 * A pasted video/image link keeps its link card, with the playable media
 * rendered below it — same as an uploaded attachment: images click through
 * to the lightbox, videos get the real player.
 */
export function LinkedMedia({ url, kind, onLoad }: {
  url: string;
  kind: "video" | "image";
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const src = safeImageUrl(url);
  if (!src || failed) return null;
  if (kind === "video") {
    return (
      <VideoPlayer
        src={src}
        onLoad={onLoad}
        className="mt-1 max-h-64 w-full max-w-md rounded-lg border border-divider"
      />
    );
  }
  return (
    <div className="relative mt-1 max-w-md overflow-hidden rounded-lg border border-divider bg-bg-secondary">
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="block w-full cursor-zoom-in text-left"
        title="Open image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          className="max-h-64 w-full bg-bg-secondary object-contain"
          onLoad={onLoad}
          onError={() => setFailed(true)}
        />
      </button>
      <ImageLightbox
        open={lightbox}
        onClose={() => setLightbox(false)}
        src={src}
        alt=""
        fileName={hostnameOf(url)}
      />
    </div>
  );
}
