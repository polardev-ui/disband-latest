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
