"use client";

import { IconMusic } from "@/components/icons";
import type { Listening } from "@/lib/music-presence";

const SOURCE: Record<string, { label: string; color: string }> = {
  spotify: { label: "Spotify", color: "#1db954" },
  soundcloud: { label: "SoundCloud", color: "#ff7700" },
  lastfm: { label: "Last.fm", color: "#d51007" },
};

/**
 * The one-line "♫ Artist" hint under a name in the member and DM lists.
 * Artists rather than the track title: shorter, and it's what people scan for.
 */
export function ListeningLine({ listening, className = "" }: { listening: Listening; className?: string }) {
  const source = SOURCE[listening.source] ?? { label: "music", color: "currentColor" };
  const text = listening.artists?.trim() || listening.track;
  return (
    <span
      className={`flex min-w-0 items-center gap-1 text-[12px] leading-tight text-text-muted ${className}`}
      title={`Listening to ${source.label}: ${listening.track}${listening.artists ? ` by ${listening.artists}` : ""}`}
    >
      <span className="flex shrink-0" style={{ color: source.color }} aria-hidden>
        <IconMusic size={12} strokeWidth={2.25} />
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}
