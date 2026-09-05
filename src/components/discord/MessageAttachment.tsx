"use client";

import { useState } from "react";
import { giphyDisplayUrl, giphyMp4Url } from "@/lib/giphy";
import { fileExtension, formatFileSize, type AttachmentType } from "@/lib/messages";
import { IconMusic } from "@/components/icons";
import { DangerousDownloadModal } from "./DangerousDownloadModal";
import { ImageLightbox } from "./ImageLightbox";
import { PollCard } from "./PollCard";
import { VideoPlayer } from "./VideoPlayer";
import { safeDownload, safeImageUrl } from "@/lib/safe-url";
import type { Profile } from "@/lib/supabase/types";

interface MessageAttachmentProps {
  url: string;
  type?: AttachmentType | null;
  name?: string | null;
  size?: number | null;
  onLoad?: () => void;
  author?: Profile;
  authorColor?: string | null;
  isOwn?: boolean;
  createdAt?: string;
}

const mediaClass =
  "block max-h-[min(20rem,35vh)] max-w-full w-auto rounded-lg border border-black/20 object-contain";

export function MessageAttachment({
  url,
  type,
  name,
  size,
  onLoad,
  author,
  authorColor,
  isOwn,
  createdAt,
}: MessageAttachmentProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [imgError, setImgError] = useState(false);
  // Giphy does not serve an mp4 for every rendition, and a missing one answers
  // 403 rather than anything catchable up front. Falling back to the GIF keeps
  // the message from rendering as blank space.
  const [mp4Error, setMp4Error] = useState(false);
  const mp4 = type === "gif" && !mp4Error ? giphyMp4Url(url) : null;
  const displaySrc = mp4 ? giphyDisplayUrl(mp4) : null;
  const fileName = name || url.split("/").pop()?.split("?")[0] || "download";
  const sizeLabel = formatFileSize(size);
  const lightboxSrc = type === "gif" && mp4 ? giphyDisplayUrl(mp4) : url;

  if (type === "file") {
    return (
      <>
        <div className="mt-1 flex max-w-md items-center gap-3 rounded-lg border border-divider bg-bg-secondary px-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-accent text-xs font-bold text-brand">
            {fileExtension(fileName).slice(0, 4)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-normal">{fileName}</p>
            {sizeLabel && <p className="text-xs text-text-muted">{sizeLabel}</p>}
          </div>
          <button
            type="button"
            onClick={() => setDownloadOpen(true)}
            className="shrink-0 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Download
          </button>
        </div>
        <DangerousDownloadModal
          open={downloadOpen}
          fileName={fileName}
          onClose={() => setDownloadOpen(false)}
          onContinue={() => {
            safeDownload(url, fileName);
            setDownloadOpen(false);
          }}
        />
      </>
    );
  }

  if (type === "poll") {
    return <PollCard pollId={url} />;
  }

  if (type === "audio") {
    return (
      <div className="mt-1 flex w-full max-w-md flex-col gap-1 rounded-lg border border-divider bg-bg-secondary p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-accent text-brand">
            <IconMusic size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-normal">{fileName}</p>
            {sizeLabel && <p className="text-xs text-text-muted">{sizeLabel}</p>}
          </div>
        </div>
        <audio
          controls
          preload="metadata"
          src={safeImageUrl(url) ?? undefined}
          onLoadedMetadata={onLoad}
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div className="mt-0.5 max-w-md overflow-hidden">
      {type === "video" ? (
        <VideoPlayer src={safeImageUrl(url) ?? ""} onLoad={onLoad} />
      ) : type === "gif" && mp4 ? (
        <>
          <button type="button" onClick={() => setLightbox(true)} className="block text-left">
            <video
              src={safeImageUrl(displaySrc ?? mp4) ?? ""}
              autoPlay
              loop
              muted
              playsInline
              webkit-playsinline=""
              className={`${mediaClass} cursor-zoom-in`}
              onLoadedData={onLoad}
              onError={() => setMp4Error(true)}
            />
          </button>
          <ImageLightbox
            open={lightbox}
            onClose={() => setLightbox(false)}
            src={lightboxSrc}
            alt="GIF"
            fileName={fileName}
            animated
            author={author}
            authorColor={authorColor}
            isOwn={isOwn}
            createdAt={createdAt}
          />
        </>
      ) : (
        <>
          <button type="button" onClick={() => setLightbox(true)} className="block text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={safeImageUrl(url) ?? ""}
              alt={type === "gif" ? "GIF" : "Attachment"}
              className={`${mediaClass} cursor-zoom-in ${imgError ? "hidden" : ""}`}
              loading="eager"
              onLoad={onLoad}
              onError={() => setImgError(true)}
            />
          </button>
          <ImageLightbox
            open={lightbox}
            onClose={() => setLightbox(false)}
            src={lightboxSrc}
            alt={type === "gif" ? "GIF" : "Attachment"}
            fileName={fileName}
            animated={type === "gif" && !!mp4}
            author={author}
            authorColor={authorColor}
            isOwn={isOwn}
            createdAt={createdAt}
          />
        </>
      )}
    </div>
  );
}
