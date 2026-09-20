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

  currentUserId?: string | null;
}

const mediaClass =
  "block max-h-[min(20rem,35vh)] max-w-full w-auto rounded-lg border border-black/20 object-contain";

// Natural dimensions remembered per URL: rows remount constantly
// (reactions, presence, pagination), and a repeat view can reserve the
// exact box instead of the 16/10 fallback. First view still guesses, but
// the guess is capped with the same max-h as the final media.
const dimCache = new Map<string, { w: number; h: number }>();

function rememberDims(url: string, w: number, h: number) {
  if (w > 0 && h > 0) dimCache.set(url, { w, h });
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
  currentUserId,
}: MessageAttachmentProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [imgError, setImgError] = useState(false);

  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [dims, setDims] = useState(() => dimCache.get(url) ?? null);

  const [mp4Error, setMp4Error] = useState(false);
  const mp4 = type === "gif" && !mp4Error ? giphyMp4Url(url) : null;
  const displaySrc = mp4 ? giphyDisplayUrl(mp4) : null;
  const fileName = name || url.split("/").pop()?.split("?")[0] || "download";
  const sizeLabel = formatFileSize(size);
  const lightboxSrc = type === "gif" && mp4 ? giphyDisplayUrl(mp4) : url;

  const imgSrc = safeImageUrl(url);
  const gifSrc = safeImageUrl(displaySrc ?? mp4);

  const handleMediaLoad = () => {
    setMediaLoaded(true);
    onLoad?.();
  };

  const skeleton = (
    <div
      aria-label="Loading attachment"
      className={`flex w-full max-w-md items-center justify-center rounded-lg border border-black/20 bg-bg-accent ${
        dims ? "" : "aspect-[16/10]"
      } max-h-[min(20rem,35vh)] min-h-24`}
      style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-text-muted/30 border-t-text-muted" />
    </div>
  );

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
    return <PollCard pollId={url} currentUserId={currentUserId} />;
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

  const brokenTile = (
    <div className="mt-1 flex max-w-md items-center gap-3 rounded-lg border border-divider bg-bg-secondary px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-accent text-xs font-bold text-text-muted">
        {fileExtension(fileName).slice(0, 4) || "FILE"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-normal">{fileName}</p>
        <p className="text-xs text-text-muted">Couldn't load this attachment.</p>
      </div>
    </div>
  );

  return (
    <div className="mt-0.5 max-w-md overflow-hidden">
      {type === "video" ? (
        imgSrc ? (
          <>
            {!mediaLoaded && skeleton}
            <span className={mediaLoaded ? "" : "hidden"}>
              <VideoPlayer src={imgSrc} onLoad={handleMediaLoad} />
            </span>
          </>
        ) : (
          brokenTile
        )
      ) : type === "gif" && mp4 ? (
        gifSrc ? (
          <>
            <button type="button" onClick={() => setLightbox(true)} className="block text-left">
              {!mediaLoaded && skeleton}
              <video
                src={gifSrc}
                autoPlay
                loop
                muted
                playsInline
                webkit-playsinline=""
                className={`${mediaClass} cursor-zoom-in ${mediaLoaded ? "" : "hidden"}`}
                onLoadedData={(e) => {
                  const v = e.currentTarget;
                  rememberDims(url, v.videoWidth, v.videoHeight);
                  setDims(dimCache.get(url) ?? null);
                  handleMediaLoad();
                }}
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
          brokenTile
        )
      ) : imgError || !imgSrc ? (
        brokenTile
      ) : (
        <>
          {!mediaLoaded && skeleton}
          <button type="button" onClick={() => setLightbox(true)} className={`block text-left ${mediaLoaded ? "" : "hidden"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt={type === "gif" ? "GIF" : fileName}
              className={`${mediaClass} cursor-zoom-in`}
              loading="eager"
              onLoad={(e) => {
                const img = e.currentTarget;
                rememberDims(url, img.naturalWidth, img.naturalHeight);
                setDims(dimCache.get(url) ?? null);
                handleMediaLoad();
              }}
              onError={() => setImgError(true)}
            />
          </button>
          <ImageLightbox
            open={lightbox}
            onClose={() => setLightbox(false)}
            src={lightboxSrc}
            alt={type === "gif" ? "GIF" : fileName}
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
