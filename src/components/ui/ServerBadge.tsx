/*
 The space badge beside a space's name: Verified beats Partner, Partner beats
 the Catalyst level badges. Flat, drawn for Disband.
*/

const SCALLOP = "M12.00 1.00 L14.48 2.73 L17.50 2.47 L18.79 5.21 L21.53 6.50 L21.27 9.52 L23.00 12.00 L21.27 14.48 L21.53 17.50 L18.79 18.79 L17.50 21.53 L14.48 21.27 L12.00 23.00 L9.52 21.27 L6.50 21.53 L5.21 18.79 L2.47 17.50 L2.73 14.48 L1.00 12.00 L2.73 9.52 L2.47 6.50 L5.21 5.21 L6.50 2.47 L9.52 2.73Z";

export type ServerBadgeKind = "verified" | "partner" | "level1" | "level2" | "level3";

export function serverBadgeFor(s: { verified?: boolean; partner?: boolean; catalystCount?: number }): ServerBadgeKind | null {
  if (s.verified) return "verified";
  if (s.partner) return "partner";
  const n = s.catalystCount ?? 0;
  if (n >= 6) return "level3";
  if (n >= 3) return "level2";
  if (n >= 1) return "level1";
  return null;
}

export const SERVER_BADGE_LABEL: Record<ServerBadgeKind, string> = {
  verified: "Verified by Disband",
  partner: "Disband Partner",
  level1: "Catalyst Level 1",
  level2: "Catalyst Level 2",
  level3: "Catalyst Level 3",
};

export function ServerBadge({ kind, size = 16 }: { kind: ServerBadgeKind; size?: number }) {
  const bg = kind === "verified" ? "#23a55a" : kind === "partner" ? "#5865f2" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d={SCALLOP} fill={bg} strokeLinejoin="round" stroke={bg} strokeWidth="1.2" />
      {kind === "verified" && (
        <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {kind === "partner" && (
        <g fill="none" stroke="#fff" strokeLinecap="round" transform="translate(4.4 4.4) scale(0.63)">
          <path strokeWidth="4" d="m10 7-3-1-4 4 4 4 3-1m4-2 3-1 4 4-4 4-3-1" />
          <path strokeWidth="3" d="m8 15 8-6" />
        </g>
      )}
      {kind.startsWith("level") && (
        <path
          d="M12 6.2l3.6 2.4v6.8L12 17.8l-3.6-2.4V8.6Z"
          fill={kind === "level1" ? "#f47fff" : "none"}
          stroke={kind === "level1" ? "#f47fff" : kind === "level2" ? "#060607" : "#80848e"}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
