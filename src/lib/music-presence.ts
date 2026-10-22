"use client";

/**
 * Music presence ("listening to") for Spotify and SoundCloud.
 *
 * Data model: the connected integration polls Spotify through our API and
 * writes a `listening` object onto the profile; ListeningCard renders it.
 * Spotify tokens live server-side (public.spotify_connections), so the
 * connection follows the account across web, desktop and devices. Polling
 * only runs while Disband itself is running — on desktop the tray keeps the
 * process alive in the background, so music keeps showing.
 */

import type { Listening } from "@/lib/spotify";

import { apiFetch } from "@/lib/api";

export type ListeningSource = "spotify" | "soundcloud";
export type { Listening };

/* -------------------------------------------------- Connection state */

/**
 * Connections made by older builds live under this key. The key was never
 * bound to a Disband account, so it must not be imported automatically: on a
 * shared browser that could attach one person's Spotify to another account.
 * Settings offers an explicit "Import old connection" action instead.
 */
const LEGACY_SPOTIFY_TOKENS_KEY = "disband:spotify-tokens";

interface LegacySpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function readLegacySpotifyTokens(): LegacySpotifyTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_SPOTIFY_TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LegacySpotifyTokens>;
    if (!parsed.access_token || !parsed.refresh_token || typeof parsed.expires_at !== "number") {
      return null;
    }
    return parsed as LegacySpotifyTokens;
  } catch {
    return null;
  }
}

function clearLegacySpotifyTokens(): void {
  try {
    window.localStorage.removeItem(LEGACY_SPOTIFY_TOKENS_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Whether this browser still holds a pre-server-storage connection. */
export function hasLegacySpotifyConnection(): boolean {
  return readLegacySpotifyTokens() !== null;
}

/**
 * Explicitly move an old browser-only connection onto the signed-in account.
 * Returns false when there is nothing to import or the grant has expired; an
 * expired grant is removed so Settings can offer Connect again.
 */
export async function importLegacySpotifyConnection(): Promise<boolean> {
  const legacy = readLegacySpotifyTokens();
  if (!legacy) return false;
  try {
    const res = await apiFetch("/api/music/spotify/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: legacy.refresh_token }),
    });
    if (res.ok) {
      clearLegacySpotifyTokens();
      return true;
    }
    if (res.status === 400) clearLegacySpotifyTokens();
  } catch {
    // Offline: keep the legacy tokens for another explicit attempt.
  }
  return false;
}

/** Whether this account has a Spotify connection stored on the server. */
export async function getSpotifyConnection(): Promise<boolean> {
  const res = await apiFetch("/api/music/spotify/token", { method: "GET" });
  if (!res.ok) return false;
  const data = (await res.json().catch(() => null)) as { connected?: boolean } | null;
  return data?.connected === true;
}

/** Remove the server-side connection for this account. */
export async function disconnectSpotify(): Promise<void> {
  const res = await apiFetch("/api/music/spotify/token", { method: "DELETE" });
  if (!res.ok) throw new Error("Could not disconnect Spotify.");
  clearLegacySpotifyTokens();
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
  // Use apiFetch so the desktop WebView talks to the deployed API origin and
  // carries the signed-in user's bearer token. A relative fetch under
  // `tauri://localhost` cannot reach the Next.js route at all.
  const res = await apiFetch("/api/music/lastfm/session", {
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

/** Exchange an auth code. Tokens are stored server-side and never returned. */
export async function exchangeSpotifyCode(code: string): Promise<void> {
  const res = await apiFetch("/api/music/spotify/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: spotifyRedirectUri() }),
  });
  if (!res.ok) throw new Error("Spotify token exchange failed");
  // A fresh server connection supersedes any old browser-only one.
  clearLegacySpotifyTokens();
}

/**
 * Ask our API for the connected account's current track. The server owns the
 * tokens and refreshes them, so this works identically on any device.
 */
export async function fetchSpotifyNowPlaying(): Promise<{
  connected: boolean;
  listening: Listening | null;
}> {
  const res = await apiFetch("/api/music/spotify/now-playing", { method: "POST" });
  if (!res.ok) throw new Error(`Spotify player error: ${res.status}`);
  const data = (await res.json().catch(() => null)) as {
    connected?: boolean;
    listening?: Listening | null;
  } | null;
  return { connected: data?.connected === true, listening: data?.listening ?? null };
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
