import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

/**
 * Spotify token exchange / refresh. The client secret never leaves the
 * server: the client sends its auth code (or refresh token) here and gets
 * back short-lived tokens. Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET
 * in the server environment — without them music presence stays disconnected.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const ip = getClientIp(request) || "unknown";
    const limit = rateLimit(`spotify-token:user:${user.id}:${ip}`, 20, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Spotify is not configured on this server yet." },
        { status: 503 },
      );
    }

    let body: { code?: string; redirect_uri?: string; refresh_token?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const params = new URLSearchParams({
      client_id: clientId,
    });
    if (body.code && body.redirect_uri) {
      params.set("grant_type", "authorization_code");
      params.set("code", body.code);
      params.set("redirect_uri", body.redirect_uri);
    } else if (body.refresh_token) {
      params.set("grant_type", "refresh_token");
      params.set("refresh_token", body.refresh_token);
    } else {
      return NextResponse.json({ error: "Missing code or refresh_token." }, { status: 400 });
    }

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: params.toString(),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Spotify rejected the token request." }, { status: 502 });
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    return NextResponse.json({
      access_token: json.access_token,
      // Refresh responses don't include a new refresh token; keep the old one.
      refresh_token: json.refresh_token ?? body.refresh_token ?? null,
      expires_at: Date.now() + json.expires_in * 1000,
    });
  } catch {
    return NextResponse.json({ error: "Spotify token request failed." }, { status: 500 });
  }
}
