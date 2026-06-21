"use client";

interface MessageAttachmentProps {
  url: string;
  type?: "image" | "video" | "gif" | null;
}

const mediaClass =
  "block max-h-[min(20rem,35vh)] max-w-full w-auto rounded-lg border border-black/20 object-contain";

export function MessageAttachment({ url, type }: MessageAttachmentProps) {
  return (
    <div className="mt-0.5 max-w-md overflow-hidden">
      {type === "video" ? (
        <video src={url} controls className={mediaClass} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={type === "gif" ? "GIF" : "Attachment"}
          className={mediaClass}
          loading="lazy"
        />
      )}
    </div>
  );
}
