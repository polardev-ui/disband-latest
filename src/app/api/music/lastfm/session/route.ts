import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { lastfmCall, lastfmServerConfig } from "@/lib/lastfm.server";

/**
 * Finishes the one-click connect: the approved token becomes a username.
 * Only the username is kept client-side — reads never need the session key,
 * so nothing long-lived is stored.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const ip = getClientIp(request) || "unknown";
    const limit = rateLimit(`lastfm-session:user:${user.id}:${ip}`, 20, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const config = lastfmServerConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Last.fm connect is not configured on this server yet." },
        { status: 503 },
      );
    }

    let body: { token?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 128) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const data = await lastfmCall<{ session?: { name?: string } }>(
      "auth.getSession",
      { token },
      config,
    );
    const username = data.session?.name;
    if (!username) throw new Error("Last.fm returned no session");
    return NextResponse.json({ username });
  } catch {
    return NextResponse.json({ error: "Last.fm rejected the connection." }, { status: 502 });
  }
}
