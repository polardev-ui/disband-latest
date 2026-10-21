import { NextResponse } from "next/server";

interface SiteverifyResponse {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

async function siteverify(token: string, ip?: string): Promise<SiteverifyResponse | null> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    return (await res.json()) as SiteverifyResponse;
  } catch (err) {
    console.error("[turnstile] Verification request failed:", err);
    return { success: false, "error-codes": ["network"] };
  }
}

export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not set; rejecting all requests.");
    return false;
  }
  const data = await siteverify(token, ip);
  return data?.success === true;
}

/**
 * The strict gate for anything that creates or unlocks an anonymous account.
 *
 * Fails closed in every case: no token, a token Cloudflare rejects, a token
 * solved for a different form (`action`), and a server with no secret
 * configured. That last case used to wave everything through, which is how
 * accounts were being created with the widget broken or blocked (a skewed
 * device clock, content blockers, scripts). Only local development, where
 * there is deliberately no secret, is let past without one.
 *
 * Returns null when the request may proceed, otherwise the response to send.
 */
export async function requireTurnstile(
  token: unknown,
  opts: { action?: string; ip?: string } = {},
): Promise<NextResponse | null> {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[turnstile] No TURNSTILE_SECRET_KEY: allowing in development only.");
      return null;
    }
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not set; refusing.");
    return NextResponse.json(
      { error: "Verification isn't available right now. Please try again later.", code: "TURNSTILE_REQUIRED" },
      { status: 503 },
    );
  }

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return NextResponse.json(
      { error: "Please complete the verification first.", code: "TURNSTILE_REQUIRED" },
      { status: 403 },
    );
  }

  const data = await siteverify(token, opts.ip);
  const actionOk = !opts.action || data?.action === opts.action;
  if (!data?.success || !actionOk) {
    return NextResponse.json(
      { error: "Verification failed. Please try again.", code: "TURNSTILE_REQUIRED" },
      { status: 403 },
    );
  }
  return null;
}
