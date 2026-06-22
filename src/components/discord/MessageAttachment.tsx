"use client";

import { useState } from "react";
import { giphyMp4Url } from "@/lib/giphy";
import { fileExtension, formatFileSize, type AttachmentType } from "@/lib/messages";
import { DangerousDownloadModal } from "./DangerousDownloadModal";
import { ImageLightbox } from "./ImageLightbox";
import { VideoPlayer } from "./VideoPlayer";
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

function triggerDownload(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

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
  const mp4 = type === "gif" ? giphyMp4Url(url) : null;
  const fileName = name || url.split("/").pop()?.split("?")[0] || "download";
  const sizeLabel = formatFileSize(size);
  const lightboxSrc = type === "gif" && mp4 ? mp4 : url;

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
            triggerDownload(url, fileName);
            setDownloadOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <div className="mt-0.5 max-w-md overflow-hidden">
      {type === "video" ? (
        <VideoPlayer src={url} onLoad={onLoad} />
      ) : type === "gif" && mp4 ? (
        <>
          <button type="button" onClick={() => setLightbox(true)} className="block text-left">
            <video
              src={mp4}
              autoPlay
              loop
              muted
              playsInline
              className={`${mediaClass} cursor-zoom-in`}
              onLoadedData={onLoad}
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
              src={url}
              alt={type === "gif" ? "GIF" : "Attachment"}
              className={`${mediaClass} cursor-zoom-in`}
              loading="eager"
              onLoad={onLoad}
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
