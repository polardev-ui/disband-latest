"use client";

import { useEffect, useState } from "react";
import { safeImageUrl } from "@/lib/safe-url";
import { ACTIVITY_VERB, elapsed, type Activity } from "@/lib/activity";

const CONTROLLER = "M7 7h10a5 5 0 0 1 4.6 7l-1.5 3.5a2.6 2.6 0 0 1-4.3.7L13.6 16h-3.2l-2.2 2.2a2.6 2.6 0 0 1-4.3-.7L2.4 14A5 5 0 0 1 7 7Zm1 3v1.5H6.5V13H8v1.5h1.5V13H11v-1.5H9.5V10H8Zm7.5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z";

/**
 * A game in progress, laid out the way people know from Discord: the game's
 * logo or Rich Presence art large, the app's own logo as a small badge, the
 * Rich Presence lines, a running clock, and any buttons the game offers.
 */
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
    : elapsed(activity.started_at, now);
  const buttons = (activity.buttons ?? []).filter((b) => safeImageUrl(b.url));
  const heading = activity.kind === "playing" ? "Playing" : ACTIVITY_VERB[activity.kind];

  return (
    <section aria-label={`${heading} ${activity.name}`} className="min-w-0 rounded-lg bg-bg-secondary p-3">
      <h3 className="mb-2.5 text-[12px] font-semibold text-header-secondary">{heading}</h3>
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0">
          {large ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={large} alt={activity.large_text ?? activity.name} title={activity.large_text ?? undefined} className="h-[72px] w-[72px] rounded-[10px] object-cover" />
          ) : (
            <span aria-hidden className="flex h-[72px] w-[72px] items-center justify-center rounded-[10px] bg-bg-tertiary text-interactive-normal">
              <svg width="34" height="34" viewBox="0 0 24 24"><path fill="currentColor" d={CONTROLLER} /></svg>
            </span>
          )}
          {small && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={small} alt={activity.small_text ?? ""} title={activity.small_text ?? undefined} className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full border-[3px] border-bg-secondary bg-bg-secondary object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1 text-[14px] leading-[18px]">
          <p className="truncate font-bold text-header-primary" title={activity.name}>{activity.name}</p>
          {activity.details && <p className="truncate text-text-normal" title={activity.details}>{activity.details}</p>}
          {activity.state && <p className="truncate text-text-normal" title={activity.state}>{activity.state}</p>}
          {clock && (
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[13px] tabular-nums text-status-online">
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d={CONTROLLER} /></svg>
              {clock}
            </p>
          )}
        </div>
      </div>
      {buttons.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {buttons.map((b) => (
            <a key={b.url} href={b.url} target="_blank" rel="noopener noreferrer" className="flex h-8 items-center justify-center rounded-[4px] bg-button-secondary px-3 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover">
              {b.label}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
