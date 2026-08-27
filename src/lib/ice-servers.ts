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
