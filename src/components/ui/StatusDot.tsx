"use client";

import type { UserStatus } from "@/lib/supabase/types";
import { statusLabel } from "@/lib/presence";

/*
 Classic status glyphs: online is a filled dot, idle a crescent, Do Not
 Disturb a bar, offline a ring, streaming a play triangle. Drawn on a 12px
 grid; the cut-out ring around them is the surface colour, so the dot reads
 as punched out of the avatar.
*/
const PATHS: Record<UserStatus | "streaming", string> = {
  online: "M12 6C12 9.314 9.314 12 6 12C2.686 12 0 9.314 0 6C0 2.686 2.686 0 6 0C9.314 0 12 2.686 12 6Z",
  idle: "M5.906 11.912C9.223 11.912 11.912 9.223 11.912 5.906C11.912 2.973 9.809 0.531 7.029 0.005C6.763 -0.045 6.598 0.277 6.749 0.504C7.224 1.218 7.501 2.075 7.501 2.997C7.501 5.485 5.485 7.501 2.997 7.501C2.075 7.501 1.218 7.224 0.504 6.749C0.277 6.598 -0.045 6.763 0.005 7.029C0.531 9.809 2.973 11.912 5.906 11.912Z",
  dnd: "M6 12C9.314 12 12 9.314 12 6C12 2.686 9.314 0 6 0C2.686 0 0 2.686 0 6C0 9.314 2.686 12 6 12ZM3.692 4.615C2.928 4.615 2.308 5.235 2.308 6C2.308 6.765 2.928 7.385 3.692 7.385H8.308C9.072 7.385 9.692 6.765 9.692 6C9.692 5.235 9.072 4.615 8.308 4.615H3.692Z",
  offline: "M6 12C9.314 12 12 9.314 12 6C12 2.686 9.314 0 6 0C2.686 0 0 2.686 0 6C0 9.314 2.686 12 6 12ZM6 3.231C4.471 3.231 3.231 4.471 3.231 6C3.231 7.529 4.471 8.769 6 8.769C7.529 8.769 8.769 7.529 8.769 6C8.769 4.471 7.529 3.231 6 3.231Z",
  streaming: "M6 12C9.314 12 12 9.314 12 6C12 2.686 9.314 0 6 0C2.686 0 0 2.686 0 6C0 9.314 2.686 12 6 12ZM4.085 8.495C4.085 8.691 4.297 8.814 4.468 8.716L8.807 6.221C8.977 6.123 8.977 5.877 8.807 5.779L4.468 3.284C4.297 3.186 4.085 3.309 4.085 3.505V8.495Z",
};

const COLOR: Record<UserStatus | "streaming", string> = {
  online: "var(--status-online)",
  idle: "var(--status-idle)",
  dnd: "var(--status-dnd)",
  offline: "var(--status-offline)",
  streaming: "#593695",
};

export function StatusGlyph({ status, size = 10, className = "" }: { status: UserStatus | "streaming"; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className={className} style={{ color: COLOR[status] }}>
      <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d={PATHS[status]} />
    </svg>
  );
}

/**
 * The dot that sits on an avatar's bottom-right. `ring` is the colour of the
 * surface behind the avatar so the cut-out matches it.
 */
export function StatusDot({
  status,
  size = 10,
  ring = "var(--bg-secondary)",
  className = "absolute -bottom-0.5 -right-0.5",
}: {
  status: UserStatus | "streaming";
  size?: number;
  ring?: string;
  className?: string;
}) {
  const box = size + 6;
  return (
    <span
      role="img"
      aria-label={status === "streaming" ? "Streaming" : statusLabel(status)}
      className={`flex items-center justify-center rounded-full ${className}`}
      style={{ width: box, height: box, background: ring }}
    >
      <StatusGlyph status={status} size={size} />
    </span>
  );
}
