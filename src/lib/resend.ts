const RESEND_API = "https://api.resend.com";

export interface ResendContactResult {
  id: string;
}

function resendHeaders(): HeadersInit {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export function getMobileWaitlistSegmentId(): string | null {
  return (
    process.env.RESEND_MOBILE_WAITLIST_SEGMENT_ID
    ?? process.env.RESEND_MOBILE_WAITLIST_AUDIENCE_ID
    ?? null
  );
}

export const NEWSLETTER_SEGMENT_ENV_NAMES = [
  "RESEND_NEWSLETTER_SEGMENT_ID",
  "RESEND_NEWSLETTER_AUDIENCE_ID",

  "RESEND_SEGMENT_ID",
  "RESEND_AUDIENCE_ID",
] as const;

export function getNewsletterSegmentId(): string | null {
  for (const name of NEWSLETTER_SEGMENT_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export async function addMobileWaitlistContact(email: string): Promise<ResendContactResult | null> {
  return addContactToSegment(email, getMobileWaitlistSegmentId());
}

export async function addNewsletterContact(email: string): Promise<ResendContactResult | null> {
  return addContactToSegment(email, getNewsletterSegmentId());
}

export async function addContactToSegment(
  email: string,
  segmentId: string | null,
): Promise<ResendContactResult | null> {
  if (!segmentId || !process.env.RESEND_API_KEY) return null;

  const res = await fetch(`${RESEND_API}/contacts`, {
    method: "POST",
    headers: resendHeaders(),
    body: JSON.stringify({
      email,
      unsubscribed: false,
      segments: [{ id: segmentId }],
    }),
  });

  if (res.status === 409) {

    const addRes = await fetch(`${RESEND_API}/contacts/${encodeURIComponent(email)}/segments/${segmentId}`, {
      method: "POST",
      headers: resendHeaders(),
    });
    if (!addRes.ok && addRes.status !== 409) {
      const body = await addRes.text().catch(() => "");
      throw new Error(body || `Resend add-to-segment failed (${addRes.status})`);
    }
    return { id: "existing" };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Resend contact failed (${res.status})`);
  }

  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? "unknown" };
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendResendEmail(options: SendEmailOptions): Promise<void> {
  const from = options.from ?? process.env.RESEND_FROM_EMAIL ?? "Disband <onboarding@resend.dev>";
  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: resendHeaders(),
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Resend send failed (${res.status})`);
  }
}

// ---------------------------------------------------------------------------
// Tracked send
//
// sendResendEmail above throws away the provider's message id, which is the
// only handle on the eventual delivery outcome. For anything that must be
// confirmed as *received* — the raffle winner, for instance — an accepted send
// is not proof of anything: the address can bounce minutes later. These two
// helpers keep the id and let the real outcome be polled back later.
// ---------------------------------------------------------------------------

export type ResendDeliveryStatus =
  | "not_sent"
  | "queued"
  | "sent"
  | "accepted"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "failed"
  | "unknown";

export interface ResendEmailStatus {
  id: string;
  /** Resend's `last_event`, normalised. "unknown" when absent or unrecognised. */
  lastEvent: Exclude<ResendDeliveryStatus, "not_sent">;
  to: string[];
  createdAt?: string;
}

/** Sends an email and returns the provider's message id for later status checks. */
export async function sendTrackedResendEmail(options: SendEmailOptions): Promise<string> {
  const from = options.from ?? process.env.RESEND_FROM_EMAIL ?? "Disband <onboarding@resend.dev>";
  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: resendHeaders(),
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Resend send failed (${res.status})`);
  }

  const json = (await res.json().catch(() => ({}))) as { id?: string };
  if (!json.id) throw new Error("Resend accepted the email but returned no id to track it with.");
  return json.id;
}

const KNOWN_EVENTS = new Set<ResendDeliveryStatus>([
  "queued",
  "sent",
  "accepted",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "opened",
  "clicked",
  "failed",
]);

/**
 * Reads the provider's current view of a sent email. This is the only way to
 * answer "did it actually arrive?" without a webhook.
 *
 * Returns null when the id is unknown to the provider (or the API is
 * unreachable) rather than throwing, so a status check can never be the thing
 * that breaks a draw.
 */
export async function getResendEmailStatus(emailId: string): Promise<ResendEmailStatus | null> {
  let res: Response;
  try {
    res = await fetch(`${RESEND_API}/emails/${encodeURIComponent(emailId)}`, {
      headers: resendHeaders(),
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as {
    id?: string;
    last_event?: string;
    to?: string[] | string;
    created_at?: string;
  } | null;
  if (!json?.id) return null;

  const raw = typeof json.last_event === "string" ? json.last_event.toLowerCase() : "";
  return {
    id: json.id,
    lastEvent: (KNOWN_EVENTS.has(raw as ResendDeliveryStatus) ? raw : "unknown") as ResendEmailStatus["lastEvent"],
    to: Array.isArray(json.to) ? json.to : json.to ? [json.to] : [],
    createdAt: json.created_at,
  };
}
