import { NextResponse } from "next/server";
import { addNewsletterContact, getNewsletterSegmentId } from "@/lib/resend";
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

  if (!process.env.RESEND_API_KEY || !getNewsletterSegmentId()) {
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
