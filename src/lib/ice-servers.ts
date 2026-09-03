import { apiFetch } from "@/lib/api";
import { PUBLIC_ENV } from "@/lib/public-env";

/**
 * ICE servers for every peer connection.
 *
 * STUN only discovers your public address; it cannot carry media. When neither
 * peer can be reached directly — the common case when one side is on a mobile
 * network behind carrier-grade NAT — there is no working candidate pair and the
 * call reports itself connected while no audio flows in either direction.
 *
 * A TURN server relays the media and removes that failure mode. It is optional
 * so local development still works without one, but calls between a phone and a
 * desktop are unreliable until TURN is configured.
 */
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

/** True when a relay is available; calls across strict NATs need this. */
export function hasTurnConfigured(): boolean {
  return PUBLIC_ENV.turnUrls.trim().length > 0;
}

/**
 * ICE servers including a Cloudflare-issued relay.
 *
 * Cloudflare hands out time-limited credentials rather than a static
 * username/password, so they cannot live in `NEXT_PUBLIC_*` — /api/turn mints
 * them with a server-side token. Prefer this over `getIceServers()` anywhere a
 * peer connection is being created.
 *
 * Never throws: a relay that cannot be reached degrades to STUN, which still
 * connects most same-network calls, rather than failing the call outright.
 */
let inflight: Promise<RTCIceServer[]> | null = null;
let cached: { servers: RTCIceServer[]; fetchedAt: number } | null = null;

/** Well inside the credential TTL the server issues. */
const CACHE_MS = 45 * 60 * 1000;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.servers;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await apiFetch("/api/turn");
      if (!res.ok) return getIceServers();

      const data = (await res.json()) as { iceServers?: RTCIceServer[] };
      if (!data.iceServers?.length) return getIceServers();

      // Keep the static/STUN entries as well: a relay is a fallback path, not
      // a replacement for a direct connection, and direct is always cheaper
      // and lower latency.
      const servers = [...getIceServers(), ...data.iceServers];
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
