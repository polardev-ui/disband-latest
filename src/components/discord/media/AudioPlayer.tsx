"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { saveMedia } from "@/lib/media-actions";
import {
  PLAYBACK_RATES,
  SeekBar,
  bufferedFraction,
  claimPlayback,
  formatTime,
  sliderKeys,
  useMediaClock,
  useScrub,
} from "./MediaKit";

const BARS = 56;
/** Above this the waveform isn't worth downloading the whole file for. */
const WAVEFORM_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Real peaks from the file, decoded once it scrolls into view. Returns null
 * while loading or when it can't be decoded (CORS, odd codec, too big) — the
 * player then shows a plain seek bar rather than a made-up shape.
 */
function useWaveform(url: string | null, target: React.RefObject<HTMLElement | null>, sizeBytes?: number) {
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    setPeaks(null);
    const el = target.current;
    if (!url || !el || (sizeBytes && sizeBytes > WAVEFORM_MAX_BYTES)) return;
    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      try {
        const res = await fetch(url, { mode: "cors", signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.arrayBuffer();
        if (data.byteLength > WAVEFORM_MAX_BYTES) return;
        const ctx = new OfflineAudioContext(1, 1, 44_100);
        const audio = await ctx.decodeAudioData(data);
        const ch = audio.getChannelData(0);
        const block = Math.floor(ch.length / BARS) || 1;
        const raw: number[] = [];
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          for (let j = 0; j < block; j++) sum += Math.abs(ch[i * block + j] ?? 0);
          raw.push(sum / block);
        }
        const max = Math.max(...raw) || 1;
        if (!cancelled) setPeaks(raw.map((v) => Math.max(0.08, v / max)));
      } catch {
        /* leave the plain seek bar */
      }
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void run();
      }
    });
    io.observe(el);
    return () => {
      cancelled = true;
      ctrl.abort();
      io.disconnect();
    };
  }, [url, target, sizeBytes]);

  return peaks;
}

function Waveform({
  peaks,
  current,
  duration,
  onSeek,
}: {
  peaks: number[];
  current: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const { trackRef, handlers, hover } = useScrub((f) => duration && onSeek(f * duration));
  const played = duration ? current / duration : 0;
  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
      onKeyDown={(e) => sliderKeys(e, current, duration, onSeek)}
      {...handlers}
      className="relative flex h-8 flex-1 cursor-pointer touch-none items-center gap-[2px] rounded outline-none focus-visible:ring-1 focus-visible:ring-brand"
    >
      {peaks.map((p, i) => {
        const at = (i + 0.5) / peaks.length;
        const isPlayed = at <= played;
        const isHover = hover !== null && at <= hover && !isPlayed;
        return (
          <span
            key={i}
            aria-hidden
            className={`flex-1 rounded-full transition-colors duration-75 ${
              isPlayed ? "bg-text-normal" : isHover ? "bg-text-muted/70" : "bg-text-muted/35"
            }`}
            style={{ height: `${Math.round(p * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

export function AudioPlayer({
  src,
  fileName,
  sizeLabel,
  sizeBytes,
  onLoad,
}: {
  src: string | null;
  fileName: string;
  sizeLabel?: string | null;
  sizeBytes?: number;
  onLoad?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [el, setEl] = useState<HTMLAudioElement | null>(null);
  const [failed, setFailed] = useState(false);
  useMediaClock(el);
  const peaks = useWaveform(src, cardRef, sizeBytes);

  const current = el?.currentTime ?? 0;
  const duration = el && Number.isFinite(el.duration) ? el.duration : 0;
  const isPlaying = !!el && !el.paused && !el.ended;
  const rate = el?.playbackRate ?? 1;
  const muted = !!el?.muted;

  const toggle = () => {
    if (!el) return;
    if (el.paused || el.ended) {
      claimPlayback(el);
      void el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  };
  const seek = (s: number) => {
    if (el) el.currentTime = s;
  };
  const cycleRate = () => {
    if (!el) return;
    const i = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
    el.playbackRate = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
  };

  return (
    <div
      ref={cardRef}
      className="mt-1 w-full max-w-md rounded-[14px] border border-divider bg-bg-secondary p-3"
      onKeyDown={(e) => {
        // Space/K play-pause when focus is inside the card but not on a control.
        if ((e.key === " " || e.key === "k") && e.target === e.currentTarget) {
          e.preventDefault();
          toggle();
        }
      }}
      tabIndex={-1}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!src || failed}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-text-normal text-bg-primary transition-[transform,opacity] hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {isPlaying ? <Pause size={17} fill="currentColor" strokeWidth={0} /> : <Play size={17} fill="currentColor" strokeWidth={0} className="translate-x-px" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[14px] font-medium text-text-normal" title={fileName}>{fileName}</p>
            <span className="shrink-0 text-[12px] tabular-nums text-text-muted">
              {isPlaying || current > 0 ? `${formatTime(current)} / ` : ""}
              {formatTime(duration)}
            </span>
          </div>
          {failed ? (
            <p className="mt-1 text-[12px] text-status-dnd">Couldn&apos;t play this file.</p>
          ) : peaks ? (
            <div className="mt-1 flex">
              <Waveform peaks={peaks} current={current} duration={duration} onSeek={seek} />
            </div>
          ) : (
            <div className="mt-1">
              <SeekBar current={current} duration={duration} buffered={bufferedFraction(el)} onSeek={seek} tone="surface" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 pl-[52px]">
        {sizeLabel && <span className="mr-auto text-[12px] text-text-muted">{sizeLabel}</span>}
        {!sizeLabel && <span className="mr-auto" />}
        <button
          type="button"
          onClick={cycleRate}
          title="Playback speed"
          className="h-7 min-w-[38px] rounded-md px-1.5 text-[12px] font-medium tabular-nums text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
        >
          {rate}×
        </button>
        <button
          type="button"
          onClick={() => el && (el.muted = !el.muted)}
          aria-label={muted ? "Unmute" : "Mute"}
          title={muted ? "Unmute" : "Mute"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        {src && (
          <button
            type="button"
            onClick={() => void saveMedia(src, fileName)}
            aria-label="Download"
            title="Download"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
          >
            <Download size={15} />
          </button>
        )}
      </div>

      {src && (
        <audio
          ref={setEl}
          src={src}
          preload="metadata"
          onLoadedMetadata={onLoad}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </div>
  );
}
