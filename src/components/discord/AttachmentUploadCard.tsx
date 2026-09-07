"use client";

import { fileExtension, formatFileSize, type AttachmentType } from "@/lib/messages";
import { IconMusic } from "@/components/icons";

/**
 * What a message looks like while its file is still going up.
 *
 * The message used to appear the moment it was sent, with the attachment
 * rendered as if it had arrived — a generic "Attachment" for anything that was
 * not an image, and no sign that anything was still happening. On a slow
 * connection a 40 MB video looked identical to a finished one until it
 * suddenly changed. This says what the file is, how big it is and how far
 * along it is, which is the whole of what someone waiting wants to know.
 */
export function AttachmentUploadCard({
  name, size, type, progress, localUrl,
}: {
  name: string;
  size?: number | null;
  type?: AttachmentType | null;
  /** 0-100. */
  progress: number;
  /** A local preview, so an image is recognisable before it has uploaded. */
  localUrl?: string | null;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const sizeLabel = formatFileSize(size);
  const showsThumb = !!localUrl && (type === "image" || type === "video");

  return (
    <div className="mt-1 w-full max-w-md overflow-hidden rounded-lg border border-divider bg-bg-secondary">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-accent text-[11px] font-bold text-brand">
          {showsThumb && type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localUrl!} alt="" className="h-full w-full object-cover opacity-60" />
          ) : showsThumb ? (
            <video src={localUrl!} className="h-full w-full object-cover opacity-60" muted />
          ) : type === "audio" ? (
            <IconMusic size={18} />
          ) : (
            fileExtension(name).slice(0, 4) || "FILE"
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-normal">{name}</p>
          <p className="text-xs text-text-muted">
            {sizeLabel ? `${sizeLabel} · ` : ""}
            {pct < 100 ? `Uploading… ${pct}%` : "Finishing up…"}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Uploading ${name}`}
        className="h-1 w-full bg-bg-accent"
      >
        <div
          className="h-full bg-brand transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
