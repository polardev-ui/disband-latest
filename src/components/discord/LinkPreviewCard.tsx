"use client";

import { useEffect, useState } from "react";
import { fetchLinkPreview, type LinkPreview } from "@/lib/link-preview";
import { IconLink } from "@/components/icons";
import { safeImageUrl } from "@/lib/safe-url";

interface LinkPreviewCardProps {
  url: string;
  onLoad?: () => void;
}

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
      <div aria-label="Loading preview" className="mt-1 w-full max-w-md animate-pulse rounded-lg border border-divider bg-bg-secondary p-3">
        <div className="h-3 w-1/3 rounded bg-bg-accent" />
        <div className="mt-2 h-4 w-3/4 rounded bg-bg-accent" />
        <div className="mt-1.5 h-3 w-full rounded bg-bg-accent" />
      </div>
    );
  }

  if (failed || !preview) return null;

  let hostname = url;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {

  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block max-w-md overflow-hidden rounded-lg border border-divider bg-bg-secondary transition-colors hover:border-brand/40 hover:bg-interactive-hover/30"
    >
      {safeImageUrl(preview.image) && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeImageUrl(preview.image)!}
          alt=""
          className="aspect-[1200/630] max-h-48 w-full bg-bg-accent object-cover"
          onLoad={onLoad}
          onError={() => setImgFailed(true)}
        />
      ) : safeImageUrl(preview.image) ? (
        // Broken image URLs keep the same aspect box (with an icon) instead
        // of display:none collapsing the card and shifting the chat.
        <div className="flex aspect-[1200/630] max-h-48 w-full items-center justify-center bg-bg-accent text-text-muted">
          <IconLink size={24} />
        </div>
      ) : null}
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <IconLink size={12} />
          <span className="truncate">{hostname}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-brand">{preview.title}</p>
        {preview.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{preview.description}</p>
        )}
      </div>
    </a>
  );
}
