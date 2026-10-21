import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  SpotifyConfigError,
  SpotifyTokenError,
  deleteSpotifyConnection,
  exchangeSpotifyCode,
  loadSpotifyConnection,
  refreshSpotifyTokens,
  saveSpotifyConnection,
} from "@/lib/spotify.server";

export const dynamic = "force-dynamic";

/**
 * Spotify connection state and code exchange.
 *
 * Tokens are stored server-side so the connection follows the account to the
 * desktop app and every other device. This route never returns a token: the
 * browser only learns whether the account is connected, and asks
 * /api/music/spotify/now-playing for the current track.
 *
 * POST accepts either:
 *   { code, redirect_uri }  — finish a normal OAuth connection
 *   { refresh_token }       — import a connection from the old localStorage
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`spotify-token:user:${user.id}:${ip}`, 20, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as {
    code?: unknown;
    redirect_uri?: unknown;
    refresh_token?: unknown;
  };
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri.trim() : "";
  const legacyRefreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";

  if (!code && !legacyRefreshToken) {
    return NextResponse.json({ error: "Missing Spotify authorization." }, { status: 400 });
  }
  if (code && !/^https:\/\//i.test(redirectUri)) {
    return NextResponse.json({ error: "Missing Spotify redirect URI." }, { status: 400 });
  }

  try {
    const tokens = code
      ? await exchangeSpotifyCode(code, redirectUri)
      : await refreshSpotifyTokens(legacyRefreshToken);
    await saveSpotifyConnection(user.id, tokens);
    return NextResponse.json({ connected: true });
  } catch (error) {
    if (error instanceof SpotifyConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof SpotifyTokenError) {
      return NextResponse.json({ error: "Spotify rejected the connection." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save the Spotify connection." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const connection = await loadSpotifyConnection(user.id);
    return NextResponse.json({ connected: Boolean(connection) });
  } catch {
    return NextResponse.json({ error: "Could not load the Spotify connection." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    await deleteSpotifyConnection(user.id);
    return NextResponse.json({ connected: false });
  } catch {
    return NextResponse.json({ error: "Could not remove the Spotify connection." }, { status: 500 });
  }
}
