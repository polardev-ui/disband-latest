"use client";

import { useState } from "react";
import { saveMedia } from "@/lib/media-actions";
import { DangerousDownloadModal } from "./DangerousDownloadModal";

/**
 * Classic Discord file attachment: a flat 4px card, a blue page glyph, the
 * file name in link blue and the size underneath. Opening the name warns
 * first — every non-media file goes through the same gate.
 */
export function FileAttachmentCard({
  url,
  name,
  size,
}: {
  url: string;
  name: string;
  size?: number | null;
}) {
  const [warning, setWarning] = useState(false);
  const sizeLabel = formatFileSize(size);

  return (
    <>
      <div className="mt-1 flex w-full max-w-[520px] items-center gap-4 rounded-[4px] border border-divider bg-bg-secondary px-4 py-3 transition-colors hover:bg-bg-secondary-alt">
        <FileGlyph />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setWarning(true)}
            className="block max-w-full truncate text-left text-[15px] font-medium leading-5 text-text-link hover:underline focus-visible:underline focus-visible:outline-none"
            title={name}
          >
            {name}
          </button>
          {sizeLabel && <p className="mt-0.5 text-[13px] leading-4 text-text-muted">{sizeLabel}</p>}
        </div>
      </div>

      <DangerousDownloadModal
        open={warning}
        fileName={name}
        onClose={() => setWarning(false)}
        onContinue={() => {
          void saveMedia(url, name);
          setWarning(false);
        }}
      />
    </>
  );
}

/** The pale blue document with a folded top-right corner from classic Discord. */
export function FileGlyph({ size = 42 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.16}
      viewBox="0 0 42 49"
      aria-hidden
      className="shrink-0"
    >
      <path d="M1 1h28l12 12v35H1z" fill="#c9ddf8" />
      <path d="M29 1v12h12" fill="#a8c7ef" />
      <path d="M29 1v12h12" fill="none" stroke="#8fb5e8" strokeWidth="1" />
      <path d="M1 1h28l12 12v35H1z" fill="none" stroke="#8fb5e8" strokeWidth="1" />
    </svg>
  );
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  return `${n >= 10 || unit === 0 ? Math.round(n) : n.toFixed(1)} ${units[unit]}`;
}
