import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";

/**
 * Short-lived TURN credentials for the calling clients.
 *
 * STUN alone cannot carry media: a phone on a mobile network sits behind
 * carrier-grade NAT, so a phone-to-desktop call often has no direct candidate
 * pair and connects with no audio in either direction. A relay fixes exactly
 * that case.
 *
 * Cloudflare issues time-limited credentials rather than a static
 * username/password, which is why this endpoint exists at all — the API token
 * that mints them must never reach a client, so the clients ask us instead.
 */
const CLOUDFLARE_TURN_API = "https://rtc.live.cloudflare.com/v1/turn/keys";

/** Long enough to outlast any realistic call, short enough to be worth leaking. */
const TTL_SECONDS = 2 * 60 * 60;

/**
 * Credentials are per-key, not per-user, so one set can serve every caller
 * until it nears expiry. Re-minting on every call setup would add a round trip
 * to Cloudflare in the most latency-sensitive moment there is.
 */
let cached: { expiresAt: number; iceServers: unknown } | null = null;

/** Refresh with time to spare, so a call never starts on credentials about to die. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;

  // Not configured is not an error: the clients fall back to STUN, which works
  // for most same-network calls. Saying so plainly beats a 500 that looks like
  // an outage.
  if (!keyId || !token) {
    return NextResponse.json({ iceServers: [], configured: false });
  }

  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return NextResponse.json({ iceServers: cached.iceServers, configured: true });
  }

  try {
    const res = await fetch(`${CLOUDFLARE_TURN_API}/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });

    if (!res.ok) {
      console.error("turn: cloudflare responded", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ iceServers: [], configured: false }, { status: 200 });
    }

    const data = (await res.json()) as { iceServers?: unknown };
    if (!data.iceServers) {
      return NextResponse.json({ iceServers: [], configured: false });
    }

    cached = { expiresAt: Date.now() + TTL_SECONDS * 1000, iceServers: data.iceServers };
    return NextResponse.json({ iceServers: data.iceServers, configured: true });
  } catch (err) {
    console.error("turn: could not mint credentials", err);
    // Again: degrade to STUN rather than failing the call outright.
    return NextResponse.json({ iceServers: [], configured: false });
  }
}
