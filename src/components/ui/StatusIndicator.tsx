"use client";

import { statusLabel } from "@/lib/presence";
import type { UserStatus } from "@/lib/supabase/types";

interface StatusIndicatorProps {
  status: UserStatus;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

/** Discord-style status dot (online / idle / dnd / offline). */
export function StatusIndicator({ status, size = "md", showLabel = false, className = "" }: StatusIndicatorProps) {
  const dim = size === "sm" ? 12 : 16;
  const inner = size === "sm" ? 6 : 8;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: dim, height: dim }}>
        {status === "online" && (
          <span className="h-full w-full rounded-full bg-status-online" />
        )}
        {status === "idle" && (
          <>
            <span className="h-full w-full rounded-full bg-status-idle" />
            <span
              className="absolute rounded-full bg-bg-primary"
              style={{ width: inner, height: inner, bottom: -1, right: -1 }}
            />
          </>
        )}
        {status === "dnd" && (
          <>
            <span className="h-full w-full rounded-full bg-status-dnd" />
            <span
              className="absolute rounded-sm bg-white"
              style={{ width: inner, height: 2, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
            />
          </>
        )}
        {status === "offline" && (
          <span className="h-full w-full rounded-full border-[3px] border-status-offline bg-transparent" style={{ borderWidth: size === "sm" ? 2 : 3 }} />
        )}
      </span>
      {showLabel && <span className="text-sm text-text-muted">{statusLabel(status)}</span>}
    </span>
  );
}
