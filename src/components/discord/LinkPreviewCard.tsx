"use client";

import { useEffect, useState } from "react";
import { fetchLinkPreview, type LinkPreview } from "@/lib/link-preview";
import { IconLink } from "@/components/icons";
import { safeImageUrl } from "@/lib/safe-url";

interface LinkPreviewCardProps {
  url: string;
  onLoad?: () => void;
}

/*
 Link unfurls wear the same flat card as every other attachment: a 4px
 corner, a solid surface, and a narrow brand spine down the left edge. No
 floating panels, glass, or soft shadows. The title is the one blue element,
 exactly like a classic embed, and the image sits under the copy so a long
 description never pushes the picture off the card.
*/
export function LinkPreviewCard({ url, onLoad }: LinkPreviewCardProps) {
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPreview(undefined);
      setFailed(false);
      setImgFailed(false);
      const data = await fetchLinkPreview(url);
      if (cancelled) return;
      if (!data) {
        setFailed(true);
        setPreview(null);
      } else {
        setPreview(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Fire only when real preview data arrives. The old version fired on the
  // failure path too (preview !== undefined includes null), which triggered
  // a spurious scroll-to-bottom right before rendering nothing.
  useEffect(() => {
    if (preview) onLoad?.();
  }, [preview, onLoad]);

  if (preview === undefined) {
    return (
      <div
        aria-label="Loading preview"
        className="mt-1 w-full max-w-[432px] animate-pulse overflow-hidden rounded-[4px] border border-divider border-l-4 border-l-brand bg-bg-secondary"
      >
        <div className="space-y-2 p-3">
          <div className="h-2.5 w-1/4 rounded-[1px] bg-bg-accent" />
          <div className="h-3.5 w-3/4 rounded-[1px] bg-bg-accent" />
          <div className="h-2.5 w-full rounded-[1px] bg-bg-accent" />
        </div>
      </div>
    );
  }

  if (failed || !preview) return null;

  let hostname = url;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {

  }

  const image = safeImageUrl(preview.image);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block w-full max-w-[432px] overflow-hidden rounded-[4px] border border-divider border-l-4 border-l-brand bg-bg-secondary transition-colors hover:border-[#4f545c] hover:border-l-brand hover:bg-bg-secondary-alt"
    >
      <div className="p-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
          <IconLink size={11} className="shrink-0" />
          <span className="truncate">{hostname}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-text-link hover:underline">
          {preview.title}
        </p>
        {preview.description && (
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] leading-[1.35] text-text-normal">
            {preview.description}
          </p>
        )}
      </div>
      {image && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="max-h-48 w-full border-t border-divider bg-bg-accent object-cover"
          onLoad={onLoad}
          onError={() => setImgFailed(true)}
        />
      ) : image ? (
        // Broken image URLs keep a small strip instead of display:none
        // collapsing the card and shifting the chat.
        <div className="flex h-16 w-full items-center justify-center border-t border-divider bg-bg-accent text-text-muted">
          <IconLink size={20} />
        </div>
      ) : null}
    </a>
  );
}
