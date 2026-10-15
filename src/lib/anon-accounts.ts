/**
 * Shared anonymous-account constants and formatting.
 *
 * No Node built-ins live here: this module is imported by both the client
 * (AuthScreen, AppContext) and the server routes. Crypto and Supabase lookups
 * live in `anon-accounts.server.ts`.
 */

export const ANON_TIERS = {
  "1d": { label: "1 day", days: 1 },
  "3d": { label: "3 days", days: 3 },
  "1w": { label: "1 week", days: 7 },
  "2w": { label: "2 weeks", days: 14 },
  "1m": { label: "1 month", days: 30 },
} as const;

export type AnonTier = keyof typeof ANON_TIERS;

export const ANON_TIER_ORDER: AnonTier[] = ["1d", "3d", "1w", "2w", "1m"];

/** How long the export stays available after the account expires. */
export const ANON_DOWNLOAD_GRACE_DAYS = 30;

export function isAnonTier(value: unknown): value is AnonTier {
  return typeof value === "string" && value in ANON_TIERS;
}

/** Keep only the digits of whatever the user pasted. */
export function normalizeAccountNumber(input: string): string {
  return input.replace(/\D/g, "").slice(0, 16);
}

export function isValidAccountNumber(input: string): boolean {
  return /^\d{16}$/.test(normalizeAccountNumber(input));
}

/** 1234567890123456 → "1234 5678 9012 3456" */
export function formatAccountNumber(input: string): string {
  return normalizeAccountNumber(input).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Progressively groups digits while typing. */
export function formatAccountNumberTyping(input: string): string {
  return formatAccountNumber(input);
}

export interface AnonExpiredInfo {
  status: "expired";
  /** False once the 30-day window has closed. */
  canDownload: boolean;
  /** True once the data copy has been permanently deleted. */
  purged: boolean;
  expiresAt: string | null;
  purgeAfter: string | null;
}

export interface AnonSessionPayload {
  access_token: string;
  refresh_token: string;
}

/**
 * Flat result shape for every anonymous auth/export/purge call, so the UI can
 * branch on presence rather than on a discriminated union across the wire.
 */
export interface AnonAuthResult {
  ok?: boolean;
  error?: string;
  /** Control-flow sentinel ("TURNSTILE_REQUIRED"); never shown verbatim. */
  code?: string;
  session?: AnonSessionPayload;
  /** The formatted 16-digit number, returned once on creation. */
  number?: string;
  tier?: AnonTier;
  expiresAt?: string;
  purgeAfter?: string;
  /** Present when login hit an expired account. */
  status?: "expired";
  canDownload?: boolean;
  purged?: boolean;
}

