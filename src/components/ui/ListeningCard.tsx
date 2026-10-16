"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { safeImageUrl } from "@/lib/safe-url";
import type { Profile } from "@/lib/supabase/types";

type Listening = NonNullable<NonNullable<Profile["listening"]>>;

/**
 * "Now listening" card: artwork on the left, track title and artist(s) on
 * the right. A title too long for its box marquees — slides left to reveal
 * the rest, slides back, rests 3s at the start, and loops.
 */
export function ListeningCard({ listening }: { listening: Listening }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current;
      const text = textRef.current;
      if (!box || !text) return;
      setOverflow(Math.max(0, text.scrollWidth - box.clientWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [listening.track]);

  // ~45px/s travel each way plus a 3s rest at both ends.
  const duration = overflow > 0 ? overflow / 45 + overflow / 45 + 6 : 0;
  const artwork = listening.artwork ? safeImageUrl(listening.artwork) : null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-divider bg-bg-accent px-3 py-2.5">
      {artwork ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artwork}
          alt=""
          draggable={false}
          className="h-11 w-11 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-lg">
          {listening.source === "spotify" ? "🟢" : listening.source === "soundcloud" ? "🟠" : "🎵"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
          Listening to {listening.source === "spotify" ? "Spotify" : listening.source === "soundcloud" ? "SoundCloud" : "Last.fm"}
        </p>
        <div ref={boxRef} className="overflow-hidden">
          <span
            ref={textRef}
            className={overflow > 0 ? "listening-marquee inline-block whitespace-nowrap" : "block truncate"}
            style={
              overflow > 0
                ? ({
                    "--marquee-dist": `${overflow}px`,
                    animationDuration: `${duration}s`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <span className="text-[14px] font-semibold text-text-normal">{listening.track}</span>
          </span>
        </div>
        <p className="truncate text-[12px] text-text-muted">{listening.artists}</p>
      </div>
    </div>
  );
}
