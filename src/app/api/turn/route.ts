import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";

const CLOUDFLARE_TURN_API = "https://rtc.live.cloudflare.com/v1/turn/keys";

const TTL_SECONDS = 2 * 60 * 60;

let cached: { expiresAt: number; iceServers: unknown } | null = null;

const REFRESH_MARGIN_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;

  if (!keyId || !token) {
    return NextResponse.json({ iceServers: [], configured: false });
  }

  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return NextResponse.json({ iceServers: cached.iceServers, configured: true });
  }

  try {
    const res = await fetch(`${CLOUDFLARE_TURN_API}/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
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

    return NextResponse.json({ iceServers: [], configured: false });
  }
}
