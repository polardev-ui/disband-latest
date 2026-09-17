

export const MONTHLY_GRANT = 4;

export const CATALYST_PRICE_CENTS = 299;

export interface CatalystLevel {
  level: 0 | 1 | 2 | 3;

  min: number;
  name: string;
  perks: string[];
}

export const CATALYST_LEVELS: CatalystLevel[] = [
  { level: 0, min: 0, name: "No level", perks: [] },
  { level: 1, min: 1, name: "Level 1", perks: ["Custom vanity invite code"] },
  {
    level: 2,
    min: 3,
    name: "Level 2",
    perks: ["Custom vanity invite code", "+50 custom emoji slots for everyone"],
  },
  {
    level: 3,
    min: 6,
    name: "Level 3",
    perks: [
      "Custom vanity invite code",
      "+50 custom emoji slots for everyone",
      "Animated gradient role styling",
    ],
  },
];

export const EMOJI_SLOTS_BONUS = 50;

export function catalystLevel(count: number): CatalystLevel {
  let current = CATALYST_LEVELS[0];
  for (const l of CATALYST_LEVELS) {
    if (count >= l.min) current = l;
  }
  return current;
}

export function nextCatalystLevel(count: number): CatalystLevel | null {
  for (const l of CATALYST_LEVELS) {
    if (l.min > count) return l;
  }
  return null;
}

export function monthStartIso(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export function monthlyRemaining(isAero: boolean, allocatedThisMonth: number): number {
  if (!isAero) return 0;
  return Math.max(0, MONTHLY_GRANT - allocatedThisMonth);
}

const VANITY_RE = /^[a-z0-9-]{3,24}$/;

export function sanitizeVanity(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 24);
}

export function vanityError(code: string): string | null {
  if (!code) return "Enter a vanity code.";
  if (code.length < 3) return "At least 3 characters.";
  if (!VANITY_RE.test(code)) return "Letters, numbers, and hyphens only.";
  return null;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
