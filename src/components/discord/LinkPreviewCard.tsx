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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPreview(undefined);
      setFailed(false);
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

  useEffect(() => {
    if (preview !== undefined) onLoad?.();
  }, [preview, onLoad]);

  if (preview === undefined) {
    return (
      <div className="mt-1 max-w-md rounded-lg border border-divider bg-bg-secondary p-3 text-xs text-text-muted">
        Loading preview…
      </div>
    );
  }

  if (failed || !preview) return null;

  let hostname = url;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // keep raw url
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block max-w-md overflow-hidden rounded-lg border border-divider bg-bg-secondary transition-colors hover:border-brand/40 hover:bg-interactive-hover/30"
    >
      {safeImageUrl(preview.image) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeImageUrl(preview.image)!}
          alt=""
          className="max-h-48 w-full object-cover"
          onLoad={onLoad}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
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
