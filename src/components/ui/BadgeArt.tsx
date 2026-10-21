import type { ReactNode } from "react";

/* Original Disband emblems, drawn on a 24px grid. Flat fills, generous negative
   space and a shared optical size keep the small profile row legible. */
const ART: Record<string, ReactNode> = {
  owner: <><path fill="#f0b232" d="m2 7 5 4 5-7 5 7 5-4-3 12H5Z" /><path fill="#ffe09a" d="m12 4 5 7-5 5-5-5Z" /><path fill="#ce8d28" d="M5 19h14v2H5z" /></>,
  staff: <><path fill="#5865f2" d="m4 3 5 5-2 2-5-5Zm5 7 2-2 10 11-2 2Z" /><path fill="#5865f2" d="m3 19 11-11-2-2 2-2 3 1 2 2 2 4-2 2-2-2L5 21Z" /><path fill="#8b94ff" d="m12 3 2-1 6 6-1 2Z" /></>,
  moderator: <><path fill="#5865f2" d="M8 2h8l2 3h3v7c0 4-5 8-9 10C8 20 3 16 3 12V5h3Z" /><path fill="#b4baff" d="M12 5h3l1 3h2v4c0 2-3 5-6 7Z" /></>,
  partner: <><path fill="none" stroke="#5865f2" strokeWidth="4" strokeLinecap="round" d="m10 7-3-1-4 4 4 4 3-1m4-2 3-1 4 4-4 4-3-1" /><path fill="none" stroke="#8b94ff" strokeWidth="3" strokeLinecap="round" d="m8 15 8-6" /></>,
  og: <><path fill="#f0b232" d="m12 1 1.2 3 3.3.3-2.5 2 .8 3.2L12 8l-2.8 1.5.8-3.2-2.5-2 3.3-.3ZM2 10l7 4 3 7-7-4Zm20 0-7 4-3 7 7-4Z" /><path fill="#ffd985" d="m7 11 5 4 5-4-5 10Z" /></>,
  early: <><path fill="#f47b91" d="M12 21 3 12C-2 5 7 1 12 7c5-6 14-2 9 5Z" /><path fill="#ffd1dc" d="m12 7 3 4-3 7-3-7Z" /></>,
  anniv: <><path fill="#f4c683" d="M3 11h18v10H3Z" /><path fill="#f47b91" d="M3 11h18v4H3z" /><path fill="#ffeed2" d="M5 17h14v2H5z" /><path fill="#5865f2" d="M11 7h2v4h-2z" /><path fill="#f0b232" d="M12 1c4 4 1 6 0 6s-4-2 0-6Z" /></>,
  bot_dev: <><path fill="#45c7ad" d="m12 2 10 10-10 10L2 12Z" /><path fill="none" stroke="#173d39" strokeWidth="2.2" strokeLinejoin="miter" d="m9 9-3 3 3 3m6-6 3 3-3 3m-2-7-2 8" /></>,
  bot_ver: <><path fill="#4878e8" d="m6 2-5 10 5 10h12l5-10-5-10Zm1.5 3h9L20 12l-3.5 7h-9L4 12Z" fillRule="evenodd" /><path fill="none" stroke="#4878e8" strokeWidth="2.3" d="m9 8-3 4 3 4m6-8 3 4-3 4m-2-9-2 10" /></>,
  contrib: <><path fill="#a58be5" d="M2 3h20v13l-10 6L2 16Z" /><path fill="#342b50" d="m6 9 6 4 6-4v5l-6 4-6-4Z" /></>,
  translate: <><path fill="#45c7ad" d="M2 3h14v12H8l-6 4Z" /><path fill="#a3e6d6" d="M17 8h5v13l-6-3h-5v-2h6Z" /><path fill="none" stroke="#173d39" strokeWidth="1.8" d="M5 7h8M9 5v2m3 0c-1 4-4 5-6 6m1-5 5 5" /></>,
  bounty: <><path fill="#f47b67" d="M8 3h8l5 7-4 10H7L3 10Z" /><path fill="#ffe0c7" d="m12 6 1.5 4L18 12l-4.5 1.5L12 18l-1.5-4.5L6 12l4.5-2Z" /></>,
  hunter: <><path fill="#a5dfc0" d="m3 20 2 2 8-9-2-2Z" /><path fill="#47b980" d="M12 3c4-3 9 0 9 5 0 4-3 8-7 9l-5-5c-1-4 0-7 3-9Z" /><path fill="#a5dfc0" d="M12 3c3-2 6-1 7 1l-8 9-2-1c-1-4 0-7 3-9Z" /></>,
  hunter2: <><path fill="#ffe5ab" d="m3 20 2 2 8-9-2-2Z" /><path fill="#f0b232" d="M12 3c4-3 9 0 9 5 0 4-3 8-7 9l-5-5c-1-4 0-7 3-9Z" /><path fill="#ffe5ab" d="M12 3c3-2 6-1 7 1l-8 9-2-1c-1-4 0-7 3-9Z" /></>,
  security: <><path fill="#7185d9" d="m12 2 9 4v6c0 4-5 8-9 10-4-2-9-6-9-10V6Z" /><path fill="#c6d2ff" d="M15 10a3 3 0 1 0-5 2l-1 5h6l-1-5a3 3 0 0 0 1-2Z" /></>,
  feedback: <><path fill="#6ab7ed" d="M2 3h20v14H9l-7 5Z" /><path fill="#183a52" d="M6 7h12v2H6zm0 5h8v2H6z" /></>,
  founder: <><path fill="#b5bac1" d="M4 2h2v20H4z" /><path fill="#ed777c" d="M6 3h15l-4 5 4 5H6Z" /><path fill="#ffc1bc" d="M6 3h7v10H6z" /></>,
  server_v: <><path fill="#5bb8e8" d="m12 1 3 3h5v5l3 3-3 3v5h-5l-3 3-3-3H4v-5l-3-3 3-3V4h5Z" /><path fill="none" stroke="#153d52" strokeWidth="2.5" d="m7 12 3.5 3.5L17 9" /></>,
  // Catalyst uses three rising bars in an open orbit, never a Boost gem.
  boost: <><path fill="none" stroke="#e88ace" strokeWidth="2.5" d="M20 7a9 9 0 1 0 1 8" /><path fill="#f5b4e4" d="M7 12h3v6H7zm5-4h3v10h-3zm5-5h3v9h-3z" /></>,
  recruit: <><circle fill="#f47b67" cx="8" cy="7" r="4" /><path fill="#f47b67" d="M1 21v-3a7 7 0 0 1 14 0v3Z" /><path fill="#ffd1bc" d="M18 9h3v4h3v3h-3v4h-3v-4h-4v-3h4Z" /></>,
  emoji: <><circle fill="#f3cc60" cx="12" cy="12" r="10" /><path fill="#654e23" d="M6 8h3v3H6zm9 0h3v3h-3zM6 14h12c-1 7-11 7-12 0Z" /><path fill="#fff0bd" d="M8 14h8v2H8z" /></>,
  gift: <><path fill="#ed777c" d="M2 8h20v5H2zm2 6h16v8H4z" /><path fill="#ffe0a3" d="M10 8h4v14h-4z" /><path fill="none" stroke="#ffe0a3" strokeWidth="2.5" d="M12 8C2 8 5-1 9 3Zm0 0c10 0 7-9 3-5Z" /></>,
  beta: <><path fill="#c7d3d7" d="M8 2h8v3h-1v4l6 10c1 2-1 3-3 3H6c-2 0-4-1-3-3L9 9V5H8Z" /><path fill="#59c993" d="m8 13-4 7h16l-4-7Z" /><path fill="#d4f6e4" d="M8 16h2v2H8zm5-2h2v2h-2z" /></>,
  mobile: <><path fill="#9ba6de" d="M6 1h12v22H6Z" /><path fill="#4352a2" d="M8 4h8v14H8Z" /><path fill="#e0e4ff" d="M10 20h4v1h-4z" /></>,
  voice: <><rect fill="#59c993" x="8" y="1" width="8" height="13" rx="4" /><path fill="none" stroke="#a6dfc0" strokeWidth="2.2" d="M4 10v1a8 8 0 0 0 16 0v-1M12 19v3m-5 0h10" /></>,
};

export function BadgeArt({ badgeKey, size = 20 }: { badgeKey: string; size?: number }) {
  const art = ART[badgeKey];
  if (!art) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">{art}</svg>;
}

export function hasBadgeArt(badgeKey: string): boolean {
  return Object.hasOwn(ART, badgeKey);
}
