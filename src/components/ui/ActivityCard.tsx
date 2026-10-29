"use client";

import { useEffect, useState } from "react";
import { safeImageUrl } from "@/lib/safe-url";
import { ACTIVITY_VERB, elapsed, type Activity } from "@/lib/activity";

/** The profile card for a game in progress: art, Rich Presence lines and a running clock. */
export function ActivityCard({ activity }: { activity: Activity }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const large = safeImageUrl(activity.large_image ?? null);
  const small = safeImageUrl(activity.small_image ?? null);
  const ends = activity.ends_at ? Date.parse(activity.ends_at) : NaN;
  const left = Number.isFinite(ends) && ends > now ? Math.ceil((ends - now) / 1000) : null;
  const clock = left !== null
    ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left`
    : elapsed(activity.started_at, now) && `${elapsed(activity.started_at, now)} elapsed`;

  return (
    <section aria-label={`${ACTIVITY_VERB[activity.kind]} ${activity.name}`} className="min-w-0 py-1">
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
        {activity.kind === "playing" ? "Playing a game" : ACTIVITY_VERB[activity.kind]}
      </h3>
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0">
          {large ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={large} alt={activity.large_text ?? ""} title={activity.large_text ?? undefined} className="h-[60px] w-[60px] rounded-[8px] object-cover" />
          ) : (
            <span aria-hidden className="flex h-[60px] w-[60px] items-center justify-center rounded-[8px] bg-bg-secondary text-interactive-normal">
              <svg width="30" height="30" viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10a5 5 0 0 1 4.6 7l-1.5 3.5a2.6 2.6 0 0 1-4.3.7L13.6 16h-3.2l-2.2 2.2a2.6 2.6 0 0 1-4.3-.7L2.4 14A5 5 0 0 1 7 7Zm1 3v1.5H6.5V13H8v1.5h1.5V13H11v-1.5H9.5V10H8Zm7.5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" /></svg>
            </span>
          )}
          {small && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={small} alt={activity.small_text ?? ""} title={activity.small_text ?? undefined} className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-[3px] border-bg-floating object-cover" />
          )}
        </span>
        <div className="min-w-0 text-[14px] leading-[18px]">
          <p className="truncate font-semibold text-header-primary">{activity.name}</p>
          {activity.details && <p className="truncate text-text-normal">{activity.details}</p>}
          {activity.state && <p className="truncate text-text-normal">{activity.state}</p>}
          {clock && <p className="truncate tabular-nums text-text-muted">{clock}</p>}
        </div>
      </div>
    </section>
  );
}
