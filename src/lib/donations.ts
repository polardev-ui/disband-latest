/** Shared rules for /donate, used by the form and the API alike. */

export const DONATION_MIN_CENTS = 200;
export const DONATION_MAX_CENTS = 50_000;
export const DONATION_PRESETS_CENTS = [300, 500, 1000, 2500, 5000, 10000] as const;
export const DONATION_MESSAGE_MAX = 200;

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|gg|io|dev|xyz|me|co|app|link|ly)\b|discord\.gg)/i;

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Returns an error message, or null when the amount is fine. */
export function validateDonationAmount(cents: unknown): string | null {
  if (typeof cents !== "number" || !Number.isInteger(cents)) return "Enter an amount.";
  if (cents < DONATION_MIN_CENTS) return `The smallest donation is ${formatUsd(DONATION_MIN_CENTS)}.`;
  if (cents > DONATION_MAX_CENTS) return `The largest donation is ${formatUsd(DONATION_MAX_CENTS)}. Email legal@disband.dev to give more.`;
  return null;
}

/** Trims and checks a wall message. Links aren't allowed, so the wall can't be used for spam. */
export function cleanDonationMessage(raw: unknown): { message: string | null; error: string | null } {
  if (raw == null) return { message: null, error: null };
  if (typeof raw !== "string") return { message: null, error: "That message isn't valid." };
  const message = raw.replace(/\s+/g, " ").trim();
  if (!message) return { message: null, error: null };
  if (message.length > DONATION_MESSAGE_MAX) {
    return { message: null, error: `Keep your message under ${DONATION_MESSAGE_MAX} characters.` };
  }
  if (LINK_RE.test(message)) return { message: null, error: "Messages can't include links." };
  return { message, error: null };
}

export interface DonationWallEntry {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  amountCents: number;
  message: string | null;
  paidAt: string;
}

export interface DonationWall {
  totalCents: number;
  donorCount: number;
  entries: DonationWallEntry[];
}
