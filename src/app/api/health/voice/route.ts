import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CLOUDFLARE_TURN_API = "https://rtc.live.cloudflare.com/v1/turn/keys";

/**
 * Public health check for the voice relay.
 *
 * Voice is peer-to-peer over WebRTC; the one central dependency that can take
 * calls down is TURN credential minting. This mints a short-lived credential
 * set and immediately throws it away, so the status probe can prove the
 * Cloudflare relay is reachable without putting a usable secret on the
 * status page. Only a boolean outcome and latency are returned.
 */
export async function GET() {
  const started = Date.now();
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;

  if (!keyId || !token) {
    return NextResponse.json(
      { status: "error", service: "voice", turn: "not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const res = await fetch(`${CLOUDFLARE_TURN_API}/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: 120 }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[health/voice] TURN responded", res.status);
      return NextResponse.json(
        { status: "error", service: "voice", turn: "unavailable" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const data = (await res.json().catch(() => null)) as { iceServers?: unknown } | null;
    if (!Array.isArray(data?.iceServers) || data.iceServers.length === 0) {
      console.error("[health/voice] TURN returned no ICE servers");
      return NextResponse.json(
        { status: "error", service: "voice", turn: "unavailable" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        service: "voice",
        turn: "ok",
        latency_ms: Date.now() - started,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("[health/voice] TURN request failed", cause instanceof Error ? cause.message : "unknown");
    return NextResponse.json(
      { status: "error", service: "voice", turn: "unreachable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
