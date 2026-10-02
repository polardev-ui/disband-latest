import { apiFetch } from "@/lib/api";
import { PUBLIC_ENV } from "@/lib/public-env";
import { getSupabaseClient } from "@/lib/supabase/client";

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  const urls = PUBLIC_ENV.turnUrls
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length > 0) {
    servers.push({
      urls,
      username: PUBLIC_ENV.turnUsername || undefined,
      credential: PUBLIC_ENV.turnCredential || undefined,
    });
  }

  return servers;
}

export function hasTurnConfigured(): boolean {
  return PUBLIC_ENV.turnUrls.trim().length > 0;
}

let inflight: Promise<RTCIceServer[]> | null = null;
let cached: { servers: RTCIceServer[]; fetchedAt: number } | null = null;

// 30 minutes. /api/turn mints 2h Cloudflare credentials but its server
// cache used to hand out credentials up to 1h50m old, so a 45-minute
// client cache could start a call on already-expired TURN credentials —
// working on open networks, failing exactly when a relay was needed.
// The server now only serves credentials with >1h of life left and the
// client cache stays well inside that.
const CACHE_MS = 30 * 60 * 1000;

async function loadIceServers(): Promise<RTCIceServer[]> {
  let res = await apiFetch("/api/turn");
  if (res.status === 401) {
    // Long-idle tab: autoRefreshToken is off, so the stored access token
    // may have expired. One explicit refresh, then a single retry, before
    // falling back to static servers.
    try {
      const { data } = await getSupabaseClient().auth.refreshSession();
      if (data.session) res = await apiFetch("/api/turn");
    } catch {
      // Fall through to static servers below.
    }
  }
  if (!res.ok) return getIceServers();

  const data = (await res.json()) as { iceServers?: RTCIceServer[] };
  if (!data.iceServers?.length) return getIceServers();

  return [...getIceServers(), ...data.iceServers];
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.servers;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const servers = await loadIceServers();
      cached = { servers, fetchedAt: Date.now() };
      return servers;
    } catch {
      return getIceServers();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Bypass the cache: ICE retry paths call this so a restart never reuses
 *  the credentials that just failed. */
export function refreshIceServers(): Promise<RTCIceServer[]> {
  cached = null;
  return fetchIceServers();
}
