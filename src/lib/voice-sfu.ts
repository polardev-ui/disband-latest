"use client";

import { apiFetch } from "@/lib/api";
import { fetchIceServersQuick } from "@/lib/ice-servers";
import { tuneOpus } from "@/lib/webrtc";

/*
 One voice seat on Cloudflare Realtime (an SFU).

 A single RTCPeerConnection to Cloudflare carries everything: the tracks I
 send ("audio", "camera", "screen", "screenaudio") go up once, and every
 track I pull from someone else comes down the same connection. Cloudflare
 forwards packets without decoding them, so it adds a few milliseconds rather
 than the extra hops and uploads of a mesh.

 Each change to the connection is an SDP exchange through /api/voice/sfu,
 and two exchanges must never overlap, so every operation runs through one
 queue in order.
*/

export type SfuTrackName = "audio" | "camera" | "screen" | "screenaudio";

export interface SfuRemote {
  userId: string;
  sessionId: string;
  tracks: string[];
}

interface Pulled {
  userId: string;
  sessionId: string;
  name: SfuTrackName;
  mid: string;
}

interface Callbacks {
  onTrack: (userId: string, name: SfuTrackName, track: MediaStreamTrack) => void;
  onTrackGone: (userId: string, name: SfuTrackName) => void;
  onState: (state: RTCPeerConnectionState) => void;
}

let enabledCache: Promise<boolean> | null = null;

/** Whether this deployment has Cloudflare Realtime set up. Asked once per page. */
export function sfuAvailable(): Promise<boolean> {
  enabledCache ??= apiFetch("/api/voice/sfu")
    .then((r) => r.json())
    .then((j: { enabled?: boolean }) => j.enabled === true)
    .catch(() => false);
  return enabledCache;
}

type Json = Record<string, unknown> & {
  error?: string;
  errorDescription?: string;
  sessionDescription?: RTCSessionDescriptionInit;
  requiresImmediateRenegotiation?: boolean;
  tracks?: { mid?: string; trackName?: string; sessionId?: string; errorCode?: string }[];
};

const key = (p: { userId: string; sessionId: string; name: string }) => `${p.userId}:${p.sessionId}:${p.name}`;
const NAMES: SfuTrackName[] = ["audio", "camera", "screen", "screenaudio"];

export class SfuSeat {
  private pc: RTCPeerConnection | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private senders = new Map<SfuTrackName, RTCRtpTransceiver>();
  private sending = new Set<SfuTrackName>();
  /** Pulled tracks by key, and by the mid the SFU gave them. */
  private pulled = new Map<string, Pulled>();
  private byMid = new Map<string, Pulled>();
  private closed = false;
  private retryTimer: number | null = null;
  private lastRemotes: SfuRemote[] = [];

  constructor(private channelId: string, private cb: Callbacks) {}

  get peerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  get connectionState(): RTCPeerConnectionState | "closed" {
    return this.pc?.connectionState ?? "closed";
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  private async api(action: string, body: Record<string, unknown> = {}): Promise<Json> {
    const res = await apiFetch("/api/voice/sfu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, channelId: this.channelId, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) throw new Error(json.error ?? json.errorDescription ?? `Voice server error (${res.status})`);
    return json;
  }

  /** Open the session and start sending the microphone. */
  start(mic: MediaStreamTrack | null): Promise<void> {
    return this.run(async () => {
      await this.api("session");
      console.info("[voice] SFU session open");
      const pc = new RTCPeerConnection({ iceServers: await fetchIceServersQuick(), bundlePolicy: "max-bundle" });
      this.pc = pc;
      pc.ontrack = (ev) => {
        const mid = ev.transceiver.mid;
        const p = mid ? this.byMid.get(mid) : undefined;
        if (p) this.cb.onTrack(p.userId, p.name, ev.track);
      };
      pc.onconnectionstatechange = () => this.cb.onState(pc.connectionState);
      if (mic) await this.pushNow("audio", mic);
      console.info("[voice] SFU mic sending");
    });
  }

  /** Send, swap or stop one of my tracks. Returns what I'm sending now. */
  setTrack(name: SfuTrackName, track: MediaStreamTrack | null): Promise<SfuTrackName[]> {
    return this.run(async () => {
      const existing = this.senders.get(name);
      if (existing) {
        // The track stays published on the SFU; an empty sender just goes quiet,
        // and others stop pulling it when it leaves my sfu_tracks.
        await existing.sender.replaceTrack(track);
        if (track) this.sending.add(name);
        else this.sending.delete(name);
      } else if (track) {
        await this.pushNow(name, track);
      }
      return NAMES.filter((n) => this.sending.has(n));
    });
  }

  private async pushNow(name: SfuTrackName, track: MediaStreamTrack) {
    const pc = this.pc;
    if (!pc) return;
    const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
    this.senders.set(name, transceiver);
    const offer = tuneOpus(await pc.createOffer());
    await pc.setLocalDescription(offer);
    const res = await this.api("push", {
      offer: { type: "offer", sdp: pc.localDescription?.sdp },
      tracks: [{ mid: transceiver.mid, trackName: name }],
    });
    console.info("[voice] SFU push answered", name, !!res.sessionDescription);
    if (res.sessionDescription) await pc.setRemoteDescription(res.sessionDescription);
    this.sending.add(name);
  }

  /** Pull exactly what the room is sending, and let go of anything that stopped. */
  sync(remotes: SfuRemote[]): Promise<void> {
    this.lastRemotes = remotes;
    return this.run(async () => {
      const pc = this.pc;
      if (!pc || this.closed) return;
      const want = new Map<string, Omit<Pulled, "mid">>();
      for (const r of remotes) {
        for (const t of r.tracks) {
          if (!NAMES.includes(t as SfuTrackName)) continue;
          const p = { userId: r.userId, sessionId: r.sessionId, name: t as SfuTrackName };
          want.set(key(p), p);
        }
      }

      const gone = [...this.pulled.values()].filter((p) => !want.has(key(p)));
      if (gone.length) await this.closeNow(gone);

      const fresh = [...want.values()].filter((p) => !this.pulled.has(key(p)));
      if (fresh.length) await this.pullNow(fresh);
    });
  }

  private async pullNow(fresh: Omit<Pulled, "mid">[]) {
    const pc = this.pc!;
    const res = await this.api("pull", { tracks: fresh.map((p) => ({ userId: p.userId, trackName: p.name })) });
    let failed = false;
    for (const t of res.tracks ?? []) {
      const p = fresh.find((f) => f.sessionId === t.sessionId && f.name === t.trackName);
      if (!p) continue;
      // A track whose owner hasn't finished publishing yet: try again shortly.
      if (t.errorCode || !t.mid) {
        failed = true;
        continue;
      }
      const pulled = { ...p, mid: t.mid };
      this.pulled.set(key(p), pulled);
      this.byMid.set(t.mid, pulled);
    }
    if (res.requiresImmediateRenegotiation && res.sessionDescription) {
      await pc.setRemoteDescription(res.sessionDescription);
      const answer = tuneOpus(await pc.createAnswer());
      await pc.setLocalDescription(answer);
      await this.api("renegotiate", { answer: { type: "answer", sdp: pc.localDescription?.sdp } });
    }
    if (failed) this.retrySoon();
  }

  private async closeNow(gone: Pulled[]) {
    const pc = this.pc!;
    for (const p of gone) {
      this.pulled.delete(key(p));
      this.byMid.delete(p.mid);
      this.cb.onTrackGone(p.userId, p.name);
      pc.getTransceivers().find((t) => t.mid === p.mid)?.stop();
    }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const res = await this.api("close", { offer: { type: "offer", sdp: pc.localDescription?.sdp }, mids: gone.map((p) => p.mid) });
      if (res.sessionDescription) await pc.setRemoteDescription(res.sessionDescription);
    } catch {
      // The person left and their session is gone: nothing to forward anyway.
      if (pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
    }
  }

  private retrySoon() {
    if (this.retryTimer !== null || this.closed) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.sync(this.lastRemotes);
    }, 1_500);
  }

  close() {
    this.closed = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.pc?.close();
    this.pc = null;
    this.pulled.clear();
    this.byMid.clear();
  }
}
