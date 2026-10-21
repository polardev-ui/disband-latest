import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  SpotifyConfigError,
  SpotifyTokenError,
  accessTokenExpired,
  deleteSpotifyConnection,
  loadSpotifyConnection,
  refreshSpotifyTokens,
  saveSpotifyConnection,
  type StoredSpotifyTokens,
} from "@/lib/spotify.server";
import { SPOTIFY_PLAYER_URL, spotifyToListening, type SpotifyPlayerResponse } from "@/lib/spotify";

export const dynamic = "force-dynamic";

async function requestPlayer(accessToken: string): Promise<Response> {
  return fetch(SPOTIFY_PLAYER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}

async function refresh(userId: string, refreshToken: string): Promise<StoredSpotifyTokens> {
  const tokens = await refreshSpotifyTokens(refreshToken);
  await saveSpotifyConnection(userId, tokens);
  return tokens;
}

/**
 * Read the connected account from Spotify. Returns:
 *   { connected: false, listening: null }  — no connection (or revoked)
 *   { connected: true, listening: null }   — connected, nothing playing
 *   { connected: true, listening: {...} }  — a track is playing
 *
 * A Spotify outage returns 502 rather than pretending playback stopped, so
 * clients keep the last known track instead of clearing it.
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`spotify-now:user:${user.id}:${ip}`, 120, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  try {
    let connection = await loadSpotifyConnection(user.id);
    if (!connection) return NextResponse.json({ connected: false, listening: null });

    if (accessTokenExpired(connection)) {
      connection = await refresh(user.id, connection.refresh_token);
    }

    let res = await requestPlayer(connection.access_token);

    // The clock is not proof the token is valid: it may have been revoked or
    // refreshed by another device. Rebuild once and retry.
    if (res.status === 401) {
      connection = await refresh(user.id, connection.refresh_token);
      res = await requestPlayer(connection.access_token);
    }

    if (res.status === 401) {
      // Spotify has revoked the grant; forget it so the UI offers Connect.
      await deleteSpotifyConnection(user.id);
      return NextResponse.json({ connected: false, listening: null });
    }
    if (res.status === 204) {
      return NextResponse.json({ connected: true, listening: null });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Spotify is unavailable right now." }, { status: 502 });
    }

    const data = (await res.json().catch(() => null)) as SpotifyPlayerResponse | null;
    return NextResponse.json({ connected: true, listening: spotifyToListening(data) });
  } catch (error) {
    if (error instanceof SpotifyConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof SpotifyTokenError) {
      await deleteSpotifyConnection(user.id).catch(() => {});
      return NextResponse.json({ connected: false, listening: null });
    }
    return NextResponse.json({ error: "Could not reach Spotify." }, { status: 502 });
  }
}
