"use client";

import { statusLabel } from "@/lib/presence";
import type { UserStatus } from "@/lib/supabase/types";
import { StatusGlyph } from "./StatusDot";

interface StatusIndicatorProps {
  status: UserStatus;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

export function StatusIndicator({ status, size = "md", showLabel = false, className = "" }: StatusIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <StatusGlyph status={status} size={size === "sm" ? 10 : 14} className="shrink-0" />
      {showLabel && <span className="text-sm text-text-muted">{statusLabel(status)}</span>}
    </span>
  );
}
