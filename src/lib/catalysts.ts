/**
 * Catalysts: Disband's answer to Discord Boosts.
 *
 * - Aero subscribers get MONTHLY_GRANT catalyst credits per calendar month
 *   (UTC). Credits are spend-only inside the month: allocating writes a row
 *   to `server_catalysts`; the app derives the balance, nothing is stored.
 * - Anyone can also BUY catalysts one-time (any quantity) for a server;
 *   those fulfill via Stripe webhook and never expire.
 * - A server's level is its catalyst row count and unlocks perks server-wide:
 *     L1 (1+): custom vanity invite code
 *     L2 (3+): +50 custom emoji slots for the whole server
 *     L3 (6+): animated gradient role styling
 */

export const MONTHLY_GRANT = 4;

/**
 * Display fallback for the per-catalyst price, in cents. The charge itself
 * always comes from the Stripe catalogue price (STRIPE_CATALYST_PRICE_ID);
 * the modal fetches the live unit amount and only falls back to this.
 */
export const CATALYST_PRICE_CENTS = 299;

export interface CatalystLevel {
  level: 0 | 1 | 2 | 3;
  /** Catalysts needed to reach this level. */
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

/** Bonus emoji slots a server grants its members at its level. */
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

/** UTC start of the current calendar month (grant window). */
export function monthStartIso(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/**
 * Monthly credits left: grant minus this month's allocations. Never negative.
 * Non-Aero members have no grant (isAero=false → 0).
 */
export function monthlyRemaining(isAero: boolean, allocatedThisMonth: number): number {
  if (!isAero) return 0;
  return Math.max(0, MONTHLY_GRANT - allocatedThisMonth);
}

/** Vanity codes: 3-24 chars, lowercase letters/digits/hyphens. */
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
