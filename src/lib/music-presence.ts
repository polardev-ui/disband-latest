"use client";

/**
 * Music presence ("listening to") for Spotify and SoundCloud.
 *
 * Data model: the connected integration polls the provider and writes a
 * `listening` object onto the profile; ListeningCard renders it. Polling
 * only runs while Disband itself is running — on desktop the tray keeps the
 * process alive in the background, so music keeps showing. True
 * play-even-when-quit display needs a server-side polling worker holding
 * the refresh tokens (follow-up, not this file).
 */

import type { Profile } from "@/lib/supabase/types";

export type ListeningSource = "spotify" | "soundcloud";
export type Listening = NonNullable<NonNullable<Profile["listening"]>>;

/* ------------------------------------------------------------ Spotify */

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_PLAYER_URL = "https://api.spotify.com/v1/me/player/currently-playing";

export function spotifyClientId(): string | null {
  return process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? null;
}

export function spotifyRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "https://disband.dev");
  return `${base.replace(/\/$/, "")}/connect/spotify/callback`;
}

/** OAuth URL for "Connect Spotify". Scopes are read-only playback state. */
export function spotifyConnectUrl(state: string): string | null {
  const clientId = spotifyClientId();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    scope: "user-read-currently-playing user-read-playback-state",
    state,
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/** Exchange an auth code for tokens. The client secret lives server-side:
 *  this hits our own API route, never Spotify directly. */
export async function exchangeSpotifyCode(code: string): Promise<SpotifyTokens> {
  const res = await fetch("/api/music/spotify/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: spotifyRedirectUri() }),
  });
  if (!res.ok) throw new Error("Spotify token exchange failed");
  return (await res.json()) as SpotifyTokens;
}

async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokens> {
  const res = await fetch("/api/music/spotify/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error("Spotify token refresh failed");
  return (await res.json()) as SpotifyTokens;
}

interface SpotifyPlayerResponse {
  is_playing: boolean;
  progress_ms?: number;
  item?: {
    name: string;
    duration_ms: number;
    external_urls?: { spotify?: string };
    artists?: { name: string }[];
    album?: { images?: { url: string }[] };
  } | null;
}

/** Map one Spotify player response onto our Listening shape (or null). */
export function spotifyToListening(data: SpotifyPlayerResponse | null): Listening | null {
  if (!data?.is_playing || !data.item) return null;
  const artists = (data.item.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const artwork = data.item.album?.images?.[0]?.url ?? null;
  return {
    source: "spotify",
    track: data.item.name,
    artists,
    artwork,
    track_url: data.item.external_urls?.spotify ?? null,
    started_at: new Date(Date.now() - (data.progress_ms ?? 0)).toISOString(),
  };
}

/** Fetch current playback, refreshing the token once when expired. */
export async function fetchSpotifyNowPlaying(tokens: SpotifyTokens): Promise<{ listening: Listening | null; tokens: SpotifyTokens }> {
  let current = tokens;
  if (Date.now() >= current.expires_at - 30_000) {
    current = await refreshSpotifyToken(current.refresh_token);
  }
  const res = await fetch(SPOTIFY_PLAYER_URL, {
    headers: { Authorization: `Bearer ${current.access_token}` },
  });
  // 204 = nothing playing.
  if (res.status === 204) return { listening: null, tokens: current };
  if (!res.ok) throw new Error(`Spotify player error: ${res.status}`);
  const data = (await res.json()) as SpotifyPlayerResponse;
  return { listening: spotifyToListening(data), tokens: current };
}

/* ---------------------------------------------------------- SoundCloud */

/**
 * Track-title parsing below is adapted from the PreMiD SoundCloud presence
 * (https://github.com/PreMiD/Activities/tree/main/websites/S/SoundCloud,
 * MIT-licensed, by the PreMiD contributors) — credit to its authors. Their
 * script runs as a browser-extension content script reading the SoundCloud
 * page DOM; Disband reuses only the pure title-parsing half here, which
 * splits messy "Artist - Title (feat. X) [prod. Y]" strings without any DOM.
 */

const SC_VERSION_LABEL =
  /\b(?:slow(?:ed)?|sped[\s-]*up|speed[\s-]*up|nightcore|daycore|reverb|remix|mix|edit|version|remaster(?:ed)?|live|instrumental|acoustic|demo|cover|extended|radio|original|bass[\s-]*boosted|8d)\b/iu;
const SC_FEATURE_LABEL =
  /^(?:(?:ft|feat|featuring)\.?\s|(?:w\/(?!o\b)|with\/)\s*|with\.\s+)/iu;

export function parseSoundCloudTitle(
  title: string | undefined,
  uploader?: string,
): { artist?: string; title?: string } {
  let normalizedTitle = title?.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  let previousTitle: string | undefined;
  do {
    previousTitle = normalizedTitle;
    normalizedTitle = normalizedTitle
      ?.replace(/\([^()]*\)/gu, (credit) => {
        const text = credit.slice(1, -1).trim();
        return SC_VERSION_LABEL.test(text) || SC_FEATURE_LABEL.test(text) || /^w\/o\b/iu.test(text)
          ? credit
          : "";
      })
      .replace(/\s{2,}/gu, " ")
      .trim();
  } while (normalizedTitle !== previousTitle);
  const separatorIndex = normalizedTitle?.search(/\s[-\u2010-\u2015\u2212]\s/u) ?? -1;

  if (!normalizedTitle) return { title };

  let artist = separatorIndex > 0 ? normalizedTitle.slice(0, separatorIndex).trim() : undefined;
  let song = separatorIndex > 0 ? normalizedTitle.slice(separatorIndex + 3).trim() : normalizedTitle;
  if (!song) return { title };

  if (separatorIndex > 0 && artist) {
    const collaborators = artist.split("+").map((name) => name.trim());
    if (collaborators.length > 1 && collaborators.every(Boolean)) {
      artist = `${collaborators[0]} feat. ${collaborators.slice(1).join(", ")}`;
    }
  }

  const producerCredit = /\s\[prod(?:uced)?\.?\s[^()[\]]+\]$/iu;
  song = song.replace(producerCredit, "").trim();

  const feature = /\s[([]?(?:(?:ft|feat|featuring)\.?\s+|(?:w\/(?!o\b)|with\/)\s*|with\.\s+)/iu.exec(song);
  if (feature) {
    const credit = song.slice(feature.index + feature[0].length).trim();
    const baseTitle = song.slice(0, feature.index).trim();
    const mainArtist = artist || uploader;
    if (baseTitle && credit && mainArtist) {
      song = baseTitle;
      artist = `${mainArtist}${mainArtist.includes(" feat. ") ? ", " : " feat. "}${credit}`;
    }
  }

  return { artist: artist ?? uploader, title: song };
}
