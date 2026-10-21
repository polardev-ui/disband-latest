import type { Profile } from "@/lib/supabase/types";

/** The profile "listening" object shared by Spotify, Last.fm and SoundCloud. */
export type Listening = NonNullable<Profile["listening"]>;

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  /** Unix milliseconds, as stored by the API. */
  expires_at: number;
}

export interface SpotifyPlayerResponse {
  is_playing: boolean;
  progress_ms?: number;
  item?: {
    name: string;
    duration_ms: number;
    external_urls?: { spotify?: string };
    artists?: { name: string }[];
    album?: { name?: string; images?: { url: string }[] };
  } | null;
}

export const SPOTIFY_PLAYER_URL = "https://api.spotify.com/v1/me/player/currently-playing";

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
    album: data.item.album?.name ?? null,
    duration_ms: Number.isFinite(data.item.duration_ms) && data.item.duration_ms > 0 ? data.item.duration_ms : null,
    started_at: new Date(Date.now() - (data.progress_ms ?? 0)).toISOString(),
  };
}
