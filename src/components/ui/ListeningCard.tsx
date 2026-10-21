"use client";

import { useEffect, useState } from "react";
import { isSafeUrl, safeImageUrl } from "@/lib/safe-url";
import type { Profile } from "@/lib/supabase/types";

type Listening = NonNullable<Profile["listening"]>;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** Shared classic activity card for the rail, popout and full profile. */
export function ListeningCard({ listening }: { listening: Listening }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [listening.started_at]);

  const source = listening.source === "spotify" ? "Spotify" : listening.source === "soundcloud" ? "SoundCloud" : "Last.fm";
  const artwork = safeImageUrl(listening.artwork);
  const started = Date.parse(listening.started_at);
  const duration = typeof listening.duration_ms === "number" && Number.isFinite(listening.duration_ms) && listening.duration_ms > 0 ? listening.duration_ms : null;
  const elapsed = Math.min(duration ?? Infinity, Math.max(0, Number.isFinite(started) ? now - started : 0));
  const url = listening.track_url && isSafeUrl(listening.track_url) ? listening.track_url : null;

  return (
    <section aria-label={`Listening to ${source}`} className="min-w-0 py-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">Listening to {source}</h3>
        {listening.source === "spotify" && <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-[#1db954]"><circle cx="12" cy="12" r="10" fill="currentColor" /><g fill="none" stroke="var(--bg-floating)" strokeLinecap="round"><path strokeWidth="1.8" d="M6 9c4-1.5 8-1 12 1" /><path strokeWidth="1.6" d="M7 12c3-1 6-1 10 1" /><path strokeWidth="1.4" d="M8 15c3-.6 5-.5 8 1" /></g></svg>}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        {artwork ? <img src={artwork} alt="Album artwork" className="h-[60px] w-[60px] shrink-0 rounded-[4px] object-cover" /> : <span aria-hidden className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[4px] bg-bg-secondary text-2xl text-interactive-normal">♫</span>}
        <div className="min-w-0 text-[14px] leading-[18px]">
          <p className="truncate font-semibold text-header-primary" title={listening.track}>{listening.track}</p>
          <p className="truncate text-text-normal" title={listening.artists}>by {listening.artists}</p>
          {listening.album && <p className="truncate text-text-normal" title={listening.album}>on {listening.album}</p>}
        </div>
      </div>
      {duration ? <div className="mt-3">
        <div role="progressbar" aria-label="Track progress" aria-valuemin={0} aria-valuemax={Math.round(duration / 1000)} aria-valuenow={Math.floor(elapsed / 1000)} className="h-1 overflow-hidden rounded-full bg-bg-composer"><div className="h-full rounded-full bg-header-primary" style={{ width: `${elapsed / duration * 100}%` }} /></div>
        <div className="mt-1 flex justify-between text-[12px] tabular-nums text-header-secondary"><span>{clock(elapsed)}</span><span>{clock(duration)}</span></div>
      </div> : <p className="mt-2 text-[12px] tabular-nums text-header-secondary">{clock(elapsed)} elapsed</p>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 flex h-8 items-center justify-center rounded-[3px] bg-button-secondary px-3 text-[14px] font-medium text-white hover:bg-button-secondary-hover">Play on {source}</a>}
    </section>
  );
}
