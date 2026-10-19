/*
 Profile badge artwork.

 Each badge is a small flat emblem with its own shape and palette, drawn on a
 24px grid so it stays crisp at 18–22px — the way classic profile badges sit
 in a row under a name. Two or three tones per badge (a base, a shade and a
 highlight) give them weight without gradients or glows.
*/

import type { ReactNode } from "react";

const W = "#ffffff";

/** A darker copy of a shape's lower half, for a little depth. */
function Shade({ d, color = "#000", opacity = 0.18 }: { d: string; color?: string; opacity?: number }) {
  return <path d={d} fill={color} opacity={opacity} />;
}

const ART: Record<string, ReactNode> = {
  // Space owner — a gold crown with a ruby.
  owner: (
    <>
      <path d="M3 8.2 7.4 12 12 4.6 16.6 12 21 8.2 19.4 18.6H4.6Z" fill="#f0b232" />
      <path d="M4.6 18.6h14.8l-.4 2.4H5Z" fill="#c27c0e" />
      <Shade d="M12 4.6 16.6 12 21 8.2 19.4 18.6H12Z" />
      <circle cx="12" cy="13.6" r="1.9" fill="#ed4245" />
      <circle cx="11.4" cy="13" r=".6" fill={W} opacity={0.8} />
    </>
  ),
  // Staff — crossed hammer and wrench, in blurple.
  staff: (
    <>
      <path d="M6.2 19.6 4.4 17.8l8.9-8.9 1.8 1.8Z" fill="#5865f2" />
      <path d="M14.2 4.2a4 4 0 0 0-1 4.1l1.8 1.8a4 4 0 0 0 4.1-1L17 7l.4-1.6L19 5l2.1 2.1a4 4 0 0 0-1.1-4.2 4 4 0 0 0-5.8 1.3Z" fill="#5865f2" />
      <path d="M17.8 19.6 19.6 17.8 11.1 9.3l-1.8 1.8Z" fill="#4752c4" />
      <path d="M3.3 7.6 7.6 3.3l3.8 3.8-4.3 4.3Z" fill="#5865f2" />
      <path d="M5.4 5.5 7.6 3.3l3.8 3.8-2.2 2.2Z" fill="#7983f5" />
    </>
  ),
  // Moderator — a shield, half filled.
  moderator: (
    <>
      <path d="M12 3.2 19.2 6v5.4c0 4.4-3 7.6-7.2 9.4-4.2-1.8-7.2-5-7.2-9.4V6Z" fill="none" stroke="#5865f2" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M12 3.2V20.8c-4.2-1.8-7.2-5-7.2-9.4V6Z" fill="#5865f2" />
    </>
  ),
  // Partner — two blurple links.
  partner: (
    <>
      <path d="M10.4 13.6 7.9 16.1a2.7 2.7 0 0 1-3.8-3.8l3.4-3.4a2.7 2.7 0 0 1 3.8 0" fill="none" stroke="#5865f2" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M13.6 10.4l2.5-2.5a2.7 2.7 0 0 1 3.8 3.8l-3.4 3.4a2.7 2.7 0 0 1-3.8 0" fill="none" stroke="#5865f2" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M9.6 14.4l4.8-4.8" stroke="#7983f5" strokeWidth="2.8" strokeLinecap="round" />
    </>
  ),
  // OG — gold wings with a star, in the old events style.
  og: (
    <>
      <path d="M12 3.4 12.9 5.3 15 5.6 13.5 7 13.9 9.1 12 8.1 10.1 9.1 10.5 7 9 5.6 11.1 5.3Z" fill="#fbb848" />
      <path d="M2.6 9.6 7.4 12.2 12 17.4 16.6 12.2 21.4 9.6 19.4 15.4 12 20.6 4.6 15.4Z" fill="#f8a531" />
      <path d="M12 17.4 16.6 12.2 21.4 9.6 19.4 15.4 12 20.6Z" fill="#d98a14" />
      <path d="M7.4 12.2 12 17.4 16.6 12.2 12 14.6Z" fill="#fcd27a" />
    </>
  ),
  // Early supporter — a pink heart with a sparkle.
  early: (
    <>
      <path d="M12 20.4S3.6 15.4 3.6 9.6A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8.4 2.4c0 5.8-8.4 10.8-8.4 10.8Z" fill="#ff73fa" />
      <Shade d="M12 7.2a4.4 4.4 0 0 1 8.4 2.4c0 5.8-8.4 10.8-8.4 10.8Z" color="#8e1d8c" opacity={0.22} />
      <path d="M7.6 8.6a2 2 0 0 1 2.2-1" fill="none" stroke={W} strokeWidth="1.4" strokeLinecap="round" opacity={0.85} />
      <path d="M19.6 1.8 20.3 3.4 21.9 4.1 20.3 4.8 19.6 6.4 18.9 4.8 17.3 4.1 18.9 3.4Z" fill="#fee75c" />
    </>
  ),
  // Anniversary — a slice of birthday cake.
  anniv: (
    <>
      <path d="M3.6 12.6h16.8v7.2a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4Z" fill="#e8a76b" />
      <path d="M3.6 12.6h16.8v3c-1.4 0-1.4 1.4-2.8 1.4s-1.4-1.4-2.8-1.4-1.4 1.4-2.8 1.4-1.4-1.4-2.8-1.4-1.4 1.4-2.8 1.4-1.4-1.4-2.8-1.4Z" fill="#ff73fa" />
      <rect x="11" y="7.4" width="2" height="5.2" rx=".6" fill="#5865f2" />
      <path d="M12 2.6c1.6 1.6 1.4 3.4 0 4.2-1.4-.8-1.6-2.6 0-4.2Z" fill="#f0b232" />
    </>
  ),
  // Bot developer — the green angle-bracket emblem.
  bot_dev: (
    <>
      <path d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9Z" fill="#23a55a" />
      <Shade d="M12 1.8 20.8 6.9v10.2L12 22.2Z" color="#0b3d1f" opacity={0.25} />
      <path d="m9.2 9-3 3 3 3M14.8 9l3 3-3 3M13.1 7.8l-2.2 8.4" fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Verified bot developer — a blue hexagon with a robot.
  bot_ver: (
    <>
      <path d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9Z" fill="#3e70dd" />
      <Shade d="M12 1.8 20.8 6.9v10.2L12 22.2Z" />
      <rect x="7" y="9" width="10" height="7.6" rx="2.2" fill={W} />
      <path d="M12 9V6.6" stroke={W} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="6.2" r="1.1" fill={W} />
      <circle cx="9.9" cy="12.6" r="1.2" fill="#3e70dd" />
      <circle cx="14.1" cy="12.6" r="1.2" fill="#3e70dd" />
    </>
  ),
  // Contributor — a purple tile with braces.
  contrib: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#9b84ec" />
      <Shade d="M12 2.5h4.5a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H12Z" color="#3b2a7a" opacity={0.22} />
      <path d="M9.4 7.4c-1.6 0-1.6 1-1.6 2.2s-.8 2.4-1.8 2.4c1 0 1.8 1.2 1.8 2.4s0 2.2 1.6 2.2M14.6 7.4c1.6 0 1.6 1 1.6 2.2s.8 2.4 1.8 2.4c-1 0-1.8 1.2-1.8 2.4s0 2.2-1.6 2.2" fill="none" stroke={W} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Translator — a teal globe.
  translate: (
    <>
      <circle cx="12" cy="12" r="9.4" fill="#1abc9c" />
      <Shade d="M12 2.6a9.4 9.4 0 0 1 0 18.8Z" color="#0a4d40" opacity={0.22} />
      <path d="M2.8 12h18.4M12 2.6c2.6 2.7 3.8 5.9 3.8 9.4s-1.2 6.7-3.8 9.4c-2.6-2.7-3.8-5.9-3.8-9.4S9.4 5.3 12 2.6Z" fill="none" stroke={W} strokeWidth="1.5" />
    </>
  ),
  // Bug bounty — the bug-hunter tag in orange, with a sparkle.
  bounty: (
    <>
      <path d="M4.4 20.6a1.3 1.3 0 0 1 0-1.8l7.9-7.9 1.8 1.8-7.9 7.9a1.3 1.3 0 0 1-1.8 0Z" fill="#ffc2a1" />
      <path d="M11.3 6.2c2.6-2.6 6.4-3.1 8.4-1.1s1.5 5.8-1.1 8.4l-1.4 1.4-7.3-7.3Z" fill="#f47b67" />
      <path d="M19.7 5.1c2 2 1.5 5.8-1.1 8.4l-1.4 1.4-3.6-3.6Z" fill="#d4563f" />
      <path d="M5.6 3 6.2 4.6 7.8 5.2 6.2 5.8 5.6 7.4 5 5.8 3.4 5.2 5 4.6Z" fill="#fee75c" />
    </>
  ),
  // Bug hunter — the green two-tone tag.
  hunter: (
    <>
      <path d="M4.4 20.6a1.3 1.3 0 0 1 0-1.8l7.9-7.9 1.8 1.8-7.9 7.9a1.3 1.3 0 0 1-1.8 0Z" fill="#a6e3bd" />
      <path d="M11.3 6.2c2.6-2.6 6.4-3.1 8.4-1.1s1.5 5.8-1.1 8.4l-1.4 1.4-7.3-7.3Z" fill="#5bd18f" />
      <path d="M19.7 5.1c2 2 1.5 5.8-1.1 8.4l-1.4 1.4-3.6-3.6Z" fill="#2f9e5f" />
    </>
  ),
  // Bug hunter, level 2 — the gold two-tone tag.
  hunter2: (
    <>
      <path d="M4.4 20.6a1.3 1.3 0 0 1 0-1.8l7.9-7.9 1.8 1.8-7.9 7.9a1.3 1.3 0 0 1-1.8 0Z" fill="#ffe0a3" />
      <path d="M11.3 6.2c2.6-2.6 6.4-3.1 8.4-1.1s1.5 5.8-1.1 8.4l-1.4 1.4-7.3-7.3Z" fill="#ffc861" />
      <path d="M19.7 5.1c2 2 1.5 5.8-1.1 8.4l-1.4 1.4-3.6-3.6Z" fill="#e09a1d" />
    </>
  ),
  // Security researcher — a navy shield with a keyhole.
  security: (
    <>
      <path d="M12 2.2 20 5.4v6.2c0 4.7-3.3 8-8 9.9-4.7-1.9-8-5.2-8-9.9V5.4Z" fill="#2f3b8c" />
      <Shade d="M12 2.2 20 5.4v6.2c0 4.7-3.3 8-8 9.9Z" color="#000" opacity={0.2} />
      <circle cx="12" cy="10.4" r="2.4" fill="#00a8fc" />
      <path d="M11 12h2l.6 4.4h-3.2Z" fill="#00a8fc" />
    </>
  ),
  // Feedback — a blue speech bubble with a star.
  feedback: (
    <>
      <path d="M4.6 3.4h14.8a2.2 2.2 0 0 1 2.2 2.2v9.6a2.2 2.2 0 0 1-2.2 2.2H10l-5 4.2v-4.2h-.4a2.2 2.2 0 0 1-2.2-2.2V5.6a2.2 2.2 0 0 1 2.2-2.2Z" fill="#00a8fc" />
      <Shade d="M12 3.4h7.4a2.2 2.2 0 0 1 2.2 2.2v9.6a2.2 2.2 0 0 1-2.2 2.2H12Z" color="#00395a" opacity={0.2} />
      <path d="M12 6.4 13.2 8.9l2.7.3-2 1.8.6 2.6L12 12.3l-2.5 1.3.6-2.6-2-1.8 2.7-.3Z" fill={W} />
    </>
  ),
  // Space founder — a red pennant on a pole.
  founder: (
    <>
      <rect x="5" y="2.4" width="2" height="19.4" rx="1" fill="#b5bac1" />
      <path d="M7 3.4h11.6l-3 4.4 3 4.4H7Z" fill="#ed4245" />
      <Shade d="M7 7.8h11.6l-3 4.4H7Z" color="#5c0d10" opacity={0.22} />
      <rect x="3.4" y="20.2" width="5.2" height="1.8" rx=".9" fill="#80848e" />
    </>
  ),
  // Verified space — a scalloped seal with a tick.
  server_v: (
    <>
      <path d="m12 1.8 2.3 1.9 3-.4 1.1 2.8 2.8 1.1-.4 3 1.9 2.3-1.9 2.3.4 3-2.8 1.1-1.1 2.8-3-.4L12 22.2l-2.3-1.9-3 .4-1.1-2.8-2.8-1.1.4-3L1.3 12l1.9-2.3-.4-3 2.8-1.1 1.1-2.8 3 .4Z" fill="#00a8fc" />
      <Shade d="m12 1.8 2.3 1.9 3-.4 1.1 2.8 2.8 1.1-.4 3 1.9 2.3-1.9 2.3.4 3-2.8 1.1-1.1 2.8-3-.4L12 22.2Z" color="#00395a" opacity={0.2} />
      <path d="m8 12.2 2.8 2.8 5.2-5.6" fill="none" stroke={W} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Catalyst booster — Disband's own: a pink hexagon with rising chevrons.
  boost: (
    <>
      <path d="M12 2 20.7 7v10L12 22l-8.7-5V7Z" fill="#ff73fa" />
      <path d="M12 2 20.7 7v10L12 22Z" fill="#d94fd6" />
      <path d="m8 12.4 4-3.8 4 3.8M8 16.4l4-3.8 4 3.8" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Recruiter — an orange figure with a plus.
  recruit: (
    <>
      <circle cx="9.6" cy="7.6" r="3.8" fill="#f47b67" />
      <path d="M2.6 20.6c0-3.9 3.1-6.8 7-6.8s7 2.9 7 6.8Z" fill="#f47b67" />
      <Shade d="M9.6 13.8c3.9 0 7 2.9 7 6.8h-7Z" color="#5c1d12" opacity={0.22} />
      <circle cx="18" cy="15.6" r="4.2" fill="#23a55a" />
      <path d="M18 13.6v4M16 15.6h4" stroke={W} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // Emoji artist — a yellow smiley.
  emoji: (
    <>
      <circle cx="12" cy="12" r="9.4" fill="#fee75c" />
      <Shade d="M12 2.6a9.4 9.4 0 0 1 0 18.8Z" color="#8a6d00" opacity={0.18} />
      <ellipse cx="9" cy="10" rx="1.3" ry="1.7" fill="#3b2a00" />
      <ellipse cx="15" cy="10" rx="1.3" ry="1.7" fill="#3b2a00" />
      <path d="M7.4 13.6c1.1 2.2 2.8 3.2 4.6 3.2s3.5-1 4.6-3.2Z" fill="#3b2a00" />
    </>
  ),
  // Gifter — a red present with a gold ribbon.
  gift: (
    <>
      <rect x="3" y="9.8" width="18" height="4" rx="1.2" fill="#ed4245" />
      <rect x="4.2" y="13.8" width="15.6" height="7.6" rx="1.2" fill="#c03537" />
      <rect x="10.6" y="9.8" width="2.8" height="11.6" fill="#f0b232" />
      <path d="M12 9.8S10.2 4.6 7.6 4.8c-2.6.2-2.2 4.4 4.4 5ZM12 9.8s1.8-5.2 4.4-5c2.6.2 2.2 4.4-4.4 5Z" fill="#f0b232" />
    </>
  ),
  // Beta tester — a flask of green liquid.
  beta: (
    <>
      <path d="M9.2 2.8h5.6v5.4l5.2 9.4a2.6 2.6 0 0 1-2.3 3.8H7.3A2.6 2.6 0 0 1 5 17.6l5.2-9.4V2.8" fill="#e3e5e8" />
      <path d="M7.6 13.6h8.8l3.6 4A2.6 2.6 0 0 1 17.7 21.4H6.3A2.6 2.6 0 0 1 4 17.6Z" fill="#57f287" />
      <rect x="8.4" y="1.8" width="7.2" height="2" rx="1" fill="#b5bac1" />
      <circle cx="10.4" cy="17.4" r="1" fill={W} opacity={0.8} />
      <circle cx="13.6" cy="15.8" r=".7" fill={W} opacity={0.8} />
    </>
  ),
  // Mobile — a phone with a blurple screen.
  mobile: (
    <>
      <rect x="5.8" y="1.8" width="12.4" height="20.4" rx="2.8" fill="#4e5058" />
      <rect x="7.4" y="4.4" width="9.2" height="13.6" rx="1" fill="#5865f2" />
      <path d="M12 7.6 13 9.7l2.3.3-1.7 1.6.4 2.3L12 12.8l-2 1.1.4-2.3-1.7-1.6 2.3-.3Z" fill={W} />
      <rect x="10.4" y="19.2" width="3.2" height="1.2" rx=".6" fill="#b5bac1" />
    </>
  ),
  // Voice regular — a microphone with sound arcs.
  voice: (
    <>
      <rect x="9" y="2.4" width="6" height="11.2" rx="3" fill="#23a55a" />
      <path d="M12 2.4h0a3 3 0 0 1 3 3v5.2a3 3 0 0 1-3 3Z" fill="#1a7f45" />
      <path d="M6 11.2a6 6 0 0 0 12 0M12 17.2v3.6M9 20.8h6" fill="none" stroke="#b5bac1" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.4 8.4v5.6M20.6 8.4v5.6" stroke="#57f287" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};

/** Full-colour badge art, or null when a badge has no drawing yet. */
export function BadgeArt({ badgeKey, size = 20 }: { badgeKey: string; size?: number }) {
  const art = ART[badgeKey];
  if (!art) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      {art}
    </svg>
  );
}

export function hasBadgeArt(badgeKey: string): boolean {
  return badgeKey in ART;
}
