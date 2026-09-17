"use client";

import { fileExtension, formatFileSize, type AttachmentType } from "@/lib/messages";
import { IconMusic } from "@/components/icons";

export function AttachmentUploadCard({
  name, size, type, progress, localUrl,
}: {
  name: string;
  size?: number | null;
  type?: AttachmentType | null;

  progress: number;

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
