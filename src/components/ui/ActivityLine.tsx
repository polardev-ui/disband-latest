"use client";

import { activityHeadline, type Activity } from "@/lib/activity";

/** The one-line "Playing Roblox" under a name in the member list. */
export function ActivityLine({ activity, className = "" }: { activity: Activity; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-1 text-[12px] leading-tight text-text-muted ${className}`} title={[activityHeadline(activity), activity.details, activity.state].filter(Boolean).join(" · ")}>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-status-online">
        <path fill="currentColor" d="M7 7h10a5 5 0 0 1 4.6 7l-1.5 3.5a2.6 2.6 0 0 1-4.3.7L13.6 16h-3.2l-2.2 2.2a2.6 2.6 0 0 1-4.3-.7L2.4 14A5 5 0 0 1 7 7Zm1 3v1.5H6.5V13H8v1.5h1.5V13H11v-1.5H9.5V10H8Zm7.5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
      </svg>
      <span className="truncate">{activityHeadline(activity)}</span>
    </span>
  );
}
