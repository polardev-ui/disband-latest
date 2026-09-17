import { apiFetch } from "@/lib/api";
import { PUBLIC_ENV } from "@/lib/public-env";

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
