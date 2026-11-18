import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/*
 Device-held network restrictions.

 When a sign-in or sign-up is refused for being rate limited or for coming
 through a blocked VPN/proxy, the answer carries a signed marker saying "this
 device is restricted until <time>". The apps keep it (in several places, see
 network-restriction-client.ts and the iOS/Android equivalents) and send it
 with every later sign-in and sign-up attempt. While it's valid those are
 refused with the same message, whichever IP address they come from, so
 switching to another VPN server doesn't reset the clock.

 The marker is signed, so it can't be forged or extended; deleting it only
 returns a device to where it would have been anyway. It names no account,
 IP address or device, only an expiry and the reason.
*/

const HEADER = "x-disband-nr";
/** Longest a restriction is held on a device, whatever the trigger said. */
const MAX_MS = 24 * 3600_000;

export type RestrictionReason = "rate_limited" | "network_blocked";

interface Payload {
  /** Restricted until (ms since epoch). */
  u: number;
  r: RestrictionReason;
}

function secret(): string {
  return `${process.env.NETWORK_RESTRICTION_SECRET || process.env.IP_HASH_SALT || "disband-ip-salt"}:network-restriction:v1`;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function issueRestriction(reason: RestrictionReason, seconds: number): { token: string; until: string } {
  const until = Date.now() + Math.min(MAX_MS, Math.max(60_000, seconds * 1000));
  const body = Buffer.from(JSON.stringify({ u: until, r: reason } satisfies Payload)).toString("base64url");
  return { token: `${body}.${sign(body)}`, until: new Date(until).toISOString() };
}

/** The restriction a request carries, if it's genuine and still running. */
export function activeRestriction(request: Request, bodyToken?: unknown): Payload | null {
  const raw = (typeof bodyToken === "string" && bodyToken) || request.headers.get(HEADER) || "";
  // Several stores may each hold one; the client joins them with spaces and
  // the longest-running genuine one wins.
  let best: Payload | null = null;
  for (const token of raw.split(/\s+/).slice(0, 5)) {
    const [body, sig] = token.split(".");
    if (!body || !sig || body.length > 200) continue;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) continue;
    try {
      const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
      if (typeof p.u === "number" && p.u > Date.now() && p.u - Date.now() <= MAX_MS && (!best || p.u > best.u)) best = p;
    } catch {
      // Not ours.
    }
  }
  return best;
}

/** The refusal for a device that is still restricted. */
export function restrictedResponse(p: Payload): NextResponse {
  const seconds = Math.max(1, Math.ceil((p.u - Date.now()) / 1000));
  return NextResponse.json(
    {
      allowed: false,
      ok: false,
      code: p.r === "network_blocked" ? "NETWORK_RESTRICTED" : "RATE_LIMITED",
      error:
        p.r === "network_blocked"
          ? "This device can't sign in or sign up right now because of a network block. Try again later."
          : "Too many attempts from this device. Try again later.",
      restrictedUntil: new Date(p.u).toISOString(),
    },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

/**
 * Adds a restriction marker to a refusal: `json` is the body that was going
 * to be sent. The client stores `restriction` and sends it back.
 */
export function withRestriction(
  json: Record<string, unknown>,
  status: number,
  reason: RestrictionReason,
  seconds: number,
  headers: Record<string, string> = {},
): NextResponse {
  const { token, until } = issueRestriction(reason, seconds);
  return NextResponse.json({ ...json, restriction: token, restrictedUntil: until }, { status, headers });
}
