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

import { apiFetch } from "@/lib/api";

export type ListeningSource = "spotify" | "soundcloud";
export type Listening = NonNullable<NonNullable<Profile["listening"]>>;

/* -------------------------------------------------- Connection state */

const SPOTIFY_TOKENS_KEY = "disband:spotify-tokens";

export function readSpotifyTokens(): SpotifyTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SPOTIFY_TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifyTokens>;
    if (!parsed.access_token || !parsed.refresh_token || typeof parsed.expires_at !== "number") {
      return null;
    }
    return parsed as SpotifyTokens;
  } catch {
    return null;
  }
}

export function writeSpotifyTokens(tokens: SpotifyTokens): void {
  try {
    window.localStorage.setItem(SPOTIFY_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Private mode etc: the connection lasts this session only.
  }
}

export function clearSpotifyTokens(): void {
  try {
    window.localStorage.removeItem(SPOTIFY_TOKENS_KEY);
  } catch {
    // Nothing to do.
  }
}

/* ------------------------------------------- Last.fm (SoundCloud, etc.) */

/**
 * Last.fm is the transport for players whose "now playing" can't be read by
 * apps — SoundCloud being the one that matters here. SoundCloud scrobbles to
 * Last.fm when linked in its own settings (Settings → Connections), and
 * Last.fm exposes the currently-scrobbling track over a plain public API.
 * The SoundCloud title parser below still runs over the names Last.fm hands
 * back, so messy "Artist - Title (feat. …)" uploads come out clean.
 */

const LASTFM_USER_KEY = "disband:lastfm-user:";

export function lastfmConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_LASTFM_API_KEY);
}

export function readLastfmUsername(uid: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LASTFM_USER_KEY + uid);
  } catch {
    return null;
  }
}

export function writeLastfmUsername(uid: string, username: string | null): void {
  try {
    if (username) window.localStorage.setItem(LASTFM_USER_KEY + uid, username);
    else window.localStorage.removeItem(LASTFM_USER_KEY + uid);
  } catch {
    // Private mode etc: the connection lasts this session only.
  }
}

/** One-click connect lands here so a closed settings modal still adopts the
 *  account on its next open. Cleared the moment it's picked up. */
const LASTFM_PENDING_KEY = "disband:lastfm-pending";

export function readLastfmPending(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LASTFM_PENDING_KEY);
  } catch {
    return null;
  }
}

export function writeLastfmPending(username: string): void {
  try {
    window.localStorage.setItem(LASTFM_PENDING_KEY, username);
  } catch {
    // Private mode: the opener message still carries it across.
  }
}

export function clearLastfmPending(): void {
  try {
    window.localStorage.removeItem(LASTFM_PENDING_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Finish the one-click connect: swap last.fm's approved token for the
 *  username. The API secret stays server-side. */
export async function fetchLastfmSession(token: string): Promise<string> {
  const res = await fetch("/api/music/lastfm/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json().catch(() => null)) as { username?: string } | null;
  if (!res.ok || !data?.username) throw new Error("Last.fm session exchange failed");
  return data.username;
}

interface LastfmTrack {
  name?: string;
  artist?: { "#text"?: string } | string;
  url?: string;
  image?: Array<{ "#text"?: string; size?: string }>;
  "@attr"?: { nowplaying?: string };
}

/** Latest "now playing" scrobble for a public Last.fm user, or null. */
export async function fetchLastfmNowPlaying(username: string): Promise<Listening | null> {
  const apiKey = process.env.NEXT_PUBLIC_LASTFM_API_KEY;
  if (!apiKey || !username) return null;
  const url =
    `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&format=json` +
    `&limit=1&user=${encodeURIComponent(username)}&api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm error: ${res.status}`);
  const json = (await res.json()) as {
    recenttracks?: { track?: LastfmTrack | LastfmTrack[] };
    error?: number;
  };
  if (json.error) throw new Error(`Last.fm error ${json.error}`);
  const raw = json.recenttracks?.track;
  const track = Array.isArray(raw) ? raw[0] : raw;
  if (!track || track["@attr"]?.nowplaying !== "true") return null;

  const rawTitle = track.name ?? "";
  const uploader = typeof track.artist === "object" ? track.artist?.["#text"] : track.artist;
  // Reuse the SoundCloud cleanup on titles Last.fm passes through verbatim.
  const parsed = parseSoundCloudTitle(rawTitle, uploader);
  const images = track.image ?? [];
  const artwork =
    [...images].reverse().find((img) => img?.["#text"])?.["#text"] ?? null;

  return {
    source: "lastfm",
    track: parsed.title || rawTitle,
    artists: parsed.artist ?? uploader ?? "",
    artwork,
    track_url: track.url ?? null,
    // Last.fm doesn't report a start instant; "first seen by us" is close
    // enough and keeps the freshness check meaningful.
    started_at: new Date().toISOString(),
  };
}

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
  const res = await apiFetch("/api/music/spotify/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: spotifyRedirectUri() }),
  });
  if (!res.ok) throw new Error("Spotify token exchange failed");
  return (await res.json()) as SpotifyTokens;
}

async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokens> {
  const res = await apiFetch("/api/music/spotify/token", {
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
  let res = await fetch(SPOTIFY_PLAYER_URL, {
    headers: { Authorization: `Bearer ${current.access_token}` },
  });
  // The clock isn't proof the token is good (sleep, skew, a token revoked
  // elsewhere). On a 401, rebuild once and retry before giving up.
  if (res.status === 401) {
    current = await refreshSpotifyToken(current.refresh_token);
    res = await fetch(SPOTIFY_PLAYER_URL, {
      headers: { Authorization: `Bearer ${current.access_token}` },
    });
  }
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
