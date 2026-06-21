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

/** Segment ID for the mobile waitlist (Resend renamed Audiences → Segments). */
export function getMobileWaitlistSegmentId(): string | null {
  return (
    process.env.RESEND_MOBILE_WAITLIST_SEGMENT_ID
    ?? process.env.RESEND_MOBILE_WAITLIST_AUDIENCE_ID
    ?? null
  );
}

/** Create a global contact and add them to the mobile waitlist segment. */
export async function addMobileWaitlistContact(email: string): Promise<ResendContactResult | null> {
  const segmentId = getMobileWaitlistSegmentId();
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
    // Contact exists — ensure they are on the segment
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
