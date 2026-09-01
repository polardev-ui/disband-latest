import { NextResponse } from "next/server";
import {
  addNewsletterContact,
  getNewsletterSegmentId,
  NEWSLETTER_SEGMENT_ENV_NAMES,
} from "@/lib/resend";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Newsletter signup, backed by a Resend segment.
 *
 * Resend is the source of truth for subscribers, so unlike the mobile waitlist
 * there is no accompanying table — one less place for the two to disagree.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`newsletter:${ip}`, 5, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Name the missing variable in the server log. The client message stays
  // generic — which of our env vars is unset is not the visitor's business —
  // but a bare 503 gives whoever is deploying nothing to act on.
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!getNewsletterSegmentId()) missing.push("RESEND_NEWSLETTER_SEGMENT_ID");

  if (missing.length > 0) {
    console.error(
      `[newsletter] Not configured — missing ${missing.join(" and ")}. ` +
        "Set them in the deployment environment and redeploy; Next inlines " +
        "server env at build time, so a value added after the last build is " +
        "not picked up until the next one.",
    );
    return NextResponse.json(
      { error: "Newsletter signup isn’t set up yet. Try again later." },
      { status: 503 },
    );
  }

  try {
    await addNewsletterContact(email);
  } catch (err) {
    console.error("[newsletter] Resend error:", err);
    return NextResponse.json(
      { error: "Could not subscribe right now. Please try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, message: "You’re subscribed. Watch your inbox." });
}

/**
 * Configuration probe.
 *
 * A 503 from the POST cannot tell you whether the API key or the segment id is
 * the problem, and reading a deployment's env is otherwise a guessing game.
 * Reports presence only — never a value — and lists the names it looked for,
 * so a near-miss variable name is obvious.
 */
export async function GET() {
  const segmentId = getNewsletterSegmentId();
  return NextResponse.json({
    configured: Boolean(process.env.RESEND_API_KEY) && Boolean(segmentId),
    resendApiKey: process.env.RESEND_API_KEY ? "set" : "missing",
    newsletterSegmentId: segmentId ? "set" : "missing",
    segmentIdNamesChecked: NEWSLETTER_SEGMENT_ENV_NAMES,
  });
}
