import "server-only";

import { getServiceSupabase } from "@/lib/supabase/server";

/*
 Server-side Spotify connections.

 The browser used to hold the tokens, which meant a connection made in the
 web app did not exist for the desktop app (different storage origin) and did
 not follow the account to another device. Tokens now live in
 public.spotify_connections, which only the service role can read. API routes
 exchange the code, refresh the access token and hand the browser a track —
 never the tokens themselves.
*/

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const EXPIRY_SKEW_MS = 30_000;

export interface StoredSpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export class SpotifyConfigError extends Error {}
export class SpotifyTokenError extends Error {}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SpotifyConfigError("Spotify is not configured on this server.");
  }
  return { clientId, clientSecret };
}

async function requestTokens(body: URLSearchParams): Promise<StoredSpotifyTokens> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new SpotifyTokenError(json?.error ?? "Spotify rejected the token request.");
  }
  return {
    access_token: json.access_token,
    // Spotify omits refresh_token on refresh responses; the caller merges the
    // existing one back in.
    refresh_token: json.refresh_token ?? "",
    expires_at: Date.now() + Math.max(0, Number(json.expires_in) || 3600) * 1000,
  };
}

/** Exchange a one-use OAuth code. */
export async function exchangeSpotifyCode(code: string, redirectUri: string): Promise<StoredSpotifyTokens> {
  const tokens = await requestTokens(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  );
  if (!tokens.refresh_token) throw new SpotifyTokenError("Spotify did not return a refresh token.");
  return tokens;
}

/** Refresh an access token, keeping the old refresh token when Spotify omits it. */
export async function refreshSpotifyTokens(refreshToken: string): Promise<StoredSpotifyTokens> {
  const tokens = await requestTokens(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
  return { ...tokens, refresh_token: tokens.refresh_token || refreshToken };
}

export function accessTokenExpired(tokens: StoredSpotifyTokens): boolean {
  return Date.now() >= tokens.expires_at - EXPIRY_SKEW_MS;
}

export async function saveSpotifyConnection(userId: string, tokens: StoredSpotifyTokens): Promise<void> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Database unavailable.");
  const now = new Date().toISOString();
  const { error } = await service.from("spotify_connections").upsert(
    {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at).toISOString(),
      connected_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error("Could not save the Spotify connection.");
}

export async function loadSpotifyConnection(userId: string): Promise<StoredSpotifyTokens | null> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Database unavailable.");
  const { data, error } = await service
    .from("spotify_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load the Spotify connection.");
  if (!data) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(data.expires_at).getTime(),
  };
}

export async function deleteSpotifyConnection(userId: string): Promise<void> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Database unavailable.");
  const { error } = await service.from("spotify_connections").delete().eq("user_id", userId);
  if (error) throw new Error("Could not remove the Spotify connection.");
}
