"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildScreenConstraints, clearActiveScreenShare, setActiveScreenShare, tuneActiveScreenShare } from "@/lib/stream-quality";
import type { SubscriptionPlan } from "@/lib/subscription";
import {
  attachRemoteTrack, ensureLanes, laneOfTransceiver, openLanesForSending, setLaneTrack, tuneOpus,
  LANE_AUDIO, LANE_CAMERA, LANE_SCREEN, LANE_SCREEN_AUDIO, receivingVideo,
} from "@/lib/webrtc";
import { getDisbandUserMedia } from "@/lib/media";
import { VoiceMixer, setActiveVoiceMixer } from "@/lib/voice-mixer";
import { playCallConnected, playCallJoin, playCallLeave } from "@/lib/call-sounds";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import type { Profile, VoicePresence } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { preloadAiNoiseSuppression } from "@/lib/noise-suppression";
import { fetchIceServers, fetchIceServersQuick, refreshIceServers } from "@/lib/ice-servers";
import { useVoiceMinutes } from "@/hooks/useVoiceMinutes";
import { PUBLIC_ENV } from "@/lib/public-env";
import { receiveSoundboard, setSoundboardSender } from "@/lib/soundboard";
import { SfuSeat, sfuAvailable, type SfuTrackName } from "@/lib/voice-sfu";

interface SignalPayload {
  type: "offer" | "answer" | "ice" | "leave" | "screen" | "hello" | "soundboard";

  sharing?: boolean;
  /** A soundboard clip (soundboard.ts). */
  url?: string;
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Supabase's broadcast channel is not ready when `subscribe()` returns. A
 * presence row written before SUBSCRIBED makes the other side send its offer
 * into a channel that is not listening yet, and the offer is gone forever.
 */
function waitForSubscribed(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Voice connection timed out"));
    }, 8_000);

    channel.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        window.clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error("Voice connection failed"));
      }
    });
  });
}

/** Everyone else on the SFU, and what each of them is sending. */
function sfuRemotes(list: VoicePresence[], selfId: string | null) {
  return list
    .filter((p) => p.user_id !== selfId && p.transport === "sfu" && p.sfu_session_id)
    .map((p) => ({ userId: p.user_id, sessionId: p.sfu_session_id as string, tracks: p.sfu_tracks ?? [] }));
}

export function useVoiceChannel(
  channelId: string | null,
  userId: string | null,
  profile: Profile | null,
  micMuted: boolean,
  deafened: boolean,

  plan: SubscriptionPlan = "free",
) {
  const [joined, setJoined] = useState(false);

  useVoiceMinutes(joined);
  const [participants, setParticipants] = useState<(VoicePresence & { profile?: Profile })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  // Peers whose ICE/DTLS handshake has finished. `joined` only means our mic
  // is live and presence is written; audio cannot flow until at least one of
  // these exists. The call UI uses this to show "Connecting…" honestly.
  const [connectedPeerIds, setConnectedPeerIds] = useState<Set<string>>(new Set());
  const connectedSoundRef = useRef(false);

  const [remoteScreens, setRemoteScreens] = useState<Map<string, MediaStream>>(new Map());
  // Screen-share sound per sharer, apart from their mic so it can be muted alone.
  const [remoteScreenAudio, setRemoteScreenAudio] = useState<Map<string, MediaStream>>(new Map());
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  // My mic plus my camera while it's on, for my own tile. The mic-only
  // stream left my tile on my avatar with the camera running.
  const [localView, setLocalView] = useState<MediaStream | null>(null);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const pendingLocalRef = useRef<Map<string, MediaStreamTrack | null>>(new Map());
  const planRef = useRef<SubscriptionPlan>(plan);
  useEffect(() => { planRef.current = plan; }, [plan]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // A TURN fetch can take seconds. Without a promise guard, two presence
  // updates (or an offer racing the presence effect) both pass the empty
  // `peersRef` check and build two peer connections for one person.
  const peerPromisesRef = useRef<Map<string, Promise<RTCPeerConnection | null>>>(new Map());
  const peerGenerationRef = useRef<Map<string, number>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const offerRetryTimersRef = useRef<Map<string, number>>(new Map());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const signalRef = useRef<RealtimeChannel | null>(null);
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const presenceLoadRef = useRef(0);
  // Set while this seat sends and receives through Cloudflare Realtime. People
  // on older apps ("mesh" transport) still get a direct connection.
  const sfuRef = useRef<SfuSeat | null>(null);
  const transportsRef = useRef<Map<string, "sfu" | "mesh">>(new Map());

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
  }, [micMuted]);

  const deafenedRef = useRef(deafened);
  useEffect(() => {
    deafenedRef.current = deafened;
    audioRefsRef.current.forEach((el) => { el.muted = deafened; });
  }, [deafened]);

  // My soundboard clips go to the room as events while I'm in the channel.
  useEffect(() => {
    if (!joined || !userId) return;
    const send = (url: string) => {
      void signalRef.current?.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "soundboard", from: userId, url } satisfies SignalPayload,
      });
    };
    setSoundboardSender(send);
    return () => setSoundboardSender(null);
  }, [joined, userId]);

  useEffect(() => {
    if (!channelId || !userId || !joined) return;
    void getSupabaseClient()
      .from("voice_presence")
      .update({ muted: micMuted, deafened })
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      // A Supabase query is only sent once something awaits it; `void` alone sent nothing.
      .then(() => {}, () => {});
  }, [channelId, userId, joined, micMuted, deafened]);

  const prevPresenceRef = useRef<Set<string>>(new Set());
  // Membership-proofed sender set for the signal handler: presence insert
  // requires server membership (voice_insert_own), so anyone listed is a
  // verified member of this server — unlike the raw `from` field, which any
  // holder of the anon key can forge.
  const participantIdsRef = useRef<Set<string>>(new Set());
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantIdsRef.current = new Set(participants.map((p) => p.user_id));
    participantsRef.current = participants;
  }, [participants]);
  useEffect(() => {
    if (!joined) {
      prevPresenceRef.current = new Set();
      return;
    }
    const ids = new Set(participants.map((p) => p.user_id));
    const prev = prevPresenceRef.current;
    const joinedIds = [...ids].filter((id) => !prev.has(id) && id !== userId);
    const leftIds = [...prev].filter((id) => !ids.has(id) && id !== userId);
    if (joinedIds.length > 0) playCallJoin();
    if (leftIds.length > 0) playCallLeave();
    prevPresenceRef.current = ids;
  }, [participants, joined, userId]);

  const loadPresence = useCallback(async (strict = false) => {
    if (!channelId) return [];
    const generation = ++presenceLoadRef.current;
    const supabase = getSupabaseClient();
    const { data: rows, error } = await supabase
      .from("voice_presence_live")
      .select("*")
      .eq("channel_id", channelId);
    if (error) {
      // A failed poll must not erase the participant allowlist: doing so
      // makes the signal handler reject every incoming offer until the next
      // successful poll. Only a successful empty result means the room is
      // actually empty.
      if (strict) throw new Error("Could not load voice channel");
      return [];
    }
    if (!rows?.length) {
      if (presenceLoadRef.current === generation) setParticipants([]);
      return [];
    }

    // Presence IDs are all the peer setup needs. Resolve profiles after they
    // are on screen so a slow profile fetch cannot hold up audio/video for
    // everyone already in the channel.
    const loaded = rows.map((r) => ({ ...r }));
    if (presenceLoadRef.current !== generation) return loaded;
    // Update the signal allowlist now, not after the next render, so an
    // offer that arrives right behind this read is accepted.
    participantIdsRef.current = new Set(loaded.map((p) => p.user_id));
    transportsRef.current = new Map(loaded.map((p) => [p.user_id, p.transport ?? "mesh"]));
    setParticipants((prev) => {
      const profiles = new Map(prev.map((p) => [p.user_id, p.profile]));
      return loaded.map((p) => ({ ...p, profile: profiles.get(p.user_id) }));
    });

    void fetchProfilesByIds(supabase, rows.map((r) => r.user_id)).then((map) => {
      if (presenceLoadRef.current !== generation) return;
      setParticipants((prev) => prev.map((p) => ({
        ...p,
        profile: p.profile ?? map.get(p.user_id),
      })));
    }).catch(() => {
      // Names and avatars are decoration; the call is already connected.
    });

    return loaded;
  }, [channelId]);

  /** Both of us are on the SFU, so no direct connection is needed. */
  const viaSfu = useCallback((remoteId: string) => (
    !!sfuRef.current && transportsRef.current.get(remoteId) === "sfu"
  ), []);

  const dropPeer = useCallback((remoteId: string) => {
    const pc = peersRef.current.get(remoteId);
    peersRef.current.delete(remoteId);
    pc?.close();
    // Invalidates a createPeer() that is still waiting on TURN credentials.
    peerGenerationRef.current.set(remoteId, (peerGenerationRef.current.get(remoteId) ?? 0) + 1);

    pendingIceRef.current.delete(remoteId);
    const offerTimer = offerRetryTimersRef.current.get(remoteId);
    if (offerTimer) window.clearTimeout(offerTimer);
    offerRetryTimersRef.current.delete(remoteId);
    const reconnectTimer = reconnectTimersRef.current.get(remoteId);
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimersRef.current.delete(remoteId);

    const drop = (prev: Map<string, MediaStream>) => {
      if (!prev.has(remoteId)) return prev;
      const next = new Map(prev);
      next.delete(remoteId);
      return next;
    };
    setRemoteStreams(drop);
    setRemoteScreens(drop);
    setRemoteScreenAudio(drop);
    setConnectedPeerIds((prev) => {
      if (!prev.has(remoteId)) return prev;
      const next = new Set(prev);
      next.delete(remoteId);
      return next;
    });
  }, []);

  const flushQueuedIce = useCallback(async (pc: RTCPeerConnection, remoteId: string) => {
    const queued = pendingIceRef.current.get(remoteId);
    if (!queued?.length) return;
    pendingIceRef.current.delete(remoteId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // A candidate for an m-line the answer dropped is harmless.
      }
    }
  }, []);

  const createPeer = useCallback(
    (remoteId: string, initiator: boolean): Promise<RTCPeerConnection | null> => {
      if (!userId || !channelId || remoteId === userId) return Promise.resolve(null);
      const existing = peersRef.current.get(remoteId);
      if (existing && existing.signalingState !== "closed") return Promise.resolve(existing);
      if (existing) peersRef.current.delete(remoteId);
      const pending = peerPromisesRef.current.get(remoteId);
      if (pending) return pending;

      const generation = (peerGenerationRef.current.get(remoteId) ?? 0) + 1;
      peerGenerationRef.current.set(remoteId, generation);

      const promise: Promise<RTCPeerConnection | null> = (async () => {
        let pc: RTCPeerConnection;
        try {
          pc = new RTCPeerConnection({ iceServers: await fetchIceServersQuick(), iceCandidatePoolSize: 4, bundlePolicy: "max-bundle" });
        } catch {
          pc = new RTCPeerConnection();
        }

        // The request may have been cancelled (left, failed, or a newer
        // createPeer won) while TURN credentials were loading.
        if (peerGenerationRef.current.get(remoteId) !== generation ||
            !participantIdsRef.current.has(remoteId)) {
          pc.close();
          return null;
        }
        const raced = peersRef.current.get(remoteId);
        if (raced && raced.signalingState !== "closed") {
          pc.close();
          return raced;
        }
        peersRef.current.set(remoteId, pc);

        // Lanes must exist on BOTH sides. The initiator always used to get them,
        // but a responder with zero transceivers had to hope createAnswer()
        // auto-created matching ones — browser-dependent, i.e. "sometimes works".
        ensureLanes(pc);

        const local = localStreamRef.current;
        if (local) {
          const mic = local.getAudioTracks()[0] ?? null;
          if (initiator) {
            await setLaneTrack(pc, LANE_AUDIO, mic);
            await setLaneTrack(pc, LANE_CAMERA, cameraTrackRef.current);
            await setLaneTrack(pc, LANE_SCREEN, screenTrackRef.current);
            await setLaneTrack(pc, LANE_SCREEN_AUDIO, screenAudioTrackRef.current);
          } else {
            pendingLocalRef.current.set(remoteId, mic);
          }
        }

        pc.ontrack = (ev) => {
          const track = ev.track;
          const lane = laneOfTransceiver(pc, ev.transceiver);
          const sync = () => {
            if (lane === LANE_SCREEN_AUDIO) {
              setRemoteScreenAudio((prev) => {
                const next = new Map(prev);
                if (track.readyState === "live") next.set(remoteId, new MediaStream([track]));
                else next.delete(remoteId);
                return next;
              });
              return;
            }
            if (lane === LANE_SCREEN) {
              // A sendrecv m-line with no sender track still exposes a
              // receiver track. It is live but muted, and used to draw a
              // phantom "sharing" tile before the person ever shared. Only
              // show it once real frames decode: bandwidth probes unmute the
              // track too, which put a "sharing" tile on everyone.
              const hide = () => setRemoteScreens((prev) => {
                if (!prev.has(remoteId)) return prev;
                const next = new Map(prev);
                next.delete(remoteId);
                return next;
              });
              if (track.readyState !== "live" || track.muted) {
                hide();
                return;
              }
              void receivingVideo(ev.receiver).then((real) => {
                if (!real || track.readyState !== "live" || track.muted) return;
                setRemoteScreens((prev) => new Map(prev).set(remoteId, new MediaStream([track])));
              });
              return;
            }
            // `replaceTrack` adds no MSID to the SDP, so `ev.streams` is empty
            // for mic/camera. Merge the track into the peer's stream by kind;
            // without this, remote audio never reached the <audio> element and
            // camera video never reached the tile.
            setRemoteStreams((prev) => attachRemoteTrack(prev, remoteId, track, ev.streams[0]));
          };
          track.addEventListener("ended", sync);
          track.addEventListener("mute", sync);
          track.addEventListener("unmute", sync);
          sync();
        };

        pc.onicecandidate = (ev) => {
          if (ev.candidate && signalRef.current) {
            void signalRef.current.send({
              type: "broadcast",
              event: "signal",
              payload: {
                type: "ice",
                from: userId,
                to: remoteId,
                candidate: ev.candidate.toJSON(),
              } satisfies SignalPayload,
            });
          }
        };

        const reconnectLater = (delay: number) => {
          if (reconnectTimersRef.current.has(remoteId)) return;
          const timer = window.setTimeout(() => {
            reconnectTimersRef.current.delete(remoteId);
            if (participantIdsRef.current.has(remoteId) && !peersRef.current.has(remoteId)) {
              void createPeer(remoteId, userId < remoteId);
            }
          }, delay);
          reconnectTimersRef.current.set(remoteId, timer);
        };

        pc.onconnectionstatechange = () => {
          // dropPeer() closes the connection, which fires "closed" again.
          if (peersRef.current.get(remoteId) !== pc) return;
          if (pc.connectionState === "connected") {
            const timer = reconnectTimersRef.current.get(remoteId);
            if (timer) window.clearTimeout(timer);
            reconnectTimersRef.current.delete(remoteId);
            setConnectedPeerIds((prev) => {
              if (prev.has(remoteId)) return prev;
              const next = new Set(prev);
              next.add(remoteId);
              return next;
            });
            if (!connectedSoundRef.current) {
              connectedSoundRef.current = true;
              playCallConnected();
            }
            void tuneActiveScreenShare();
          } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            dropPeer(remoteId);
            reconnectLater(1_200);
          } else if (pc.connectionState === "disconnected") {
            // ICE can recover from a transient blip. Give it a few seconds
            // before tearing down, then rebuild the peer from scratch.
            const timer = window.setTimeout(() => {
              if (peersRef.current.get(remoteId) !== pc) return;
              if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                dropPeer(remoteId);
                reconnectLater(1_200);
              }
            }, 5_000);
            const previous = reconnectTimersRef.current.get(remoteId);
            if (previous) window.clearTimeout(previous);
            reconnectTimersRef.current.set(remoteId, timer);
          }
        };

        const sendOffer = (attempt: number) => {
          if (peersRef.current.get(remoteId) !== pc || pc.signalingState !== "have-local-offer") return;
          const description = pc.localDescription;
          if (!description || !signalRef.current) return;
          void signalRef.current.send({
            type: "broadcast",
            event: "signal",
            payload: {
              type: "offer",
              from: userId,
              to: remoteId,
              sdp: { type: description.type, sdp: description.sdp },
            } satisfies SignalPayload,
          });
          if (attempt >= 2) return;
          const previous = offerRetryTimersRef.current.get(remoteId);
          if (previous) window.clearTimeout(previous);
          const timer = window.setTimeout(() => {
            offerRetryTimersRef.current.delete(remoteId);
            sendOffer(attempt + 1);
          }, 1_200 * (attempt + 1));
          offerRetryTimersRef.current.set(remoteId, timer);
        };

        const startOffer = async () => {
          if (peersRef.current.get(remoteId) !== pc) return;
          if (pc.signalingState !== "stable" || pc.remoteDescription) return;
          const offer = tuneOpus(await pc.createOffer());
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);
          sendOffer(0);
        };

        if (initiator) {
          await startOffer();
        } else {
          // The lower-ID peer normally offers. If it was slow to load our
          // presence and its retries ran out, this peer would sit in
          // "stable" forever with no remote description. Take over after a
          // short grace period; the glare guard handles a crossed offer.
          window.setTimeout(() => {
            if (peersRef.current.get(remoteId) !== pc) return;
            if (pc.signalingState === "stable" && !pc.remoteDescription) {
              void startOffer().catch(() => {
                dropPeer(remoteId);
                reconnectLater(1_200);
              });
            }
          }, 1_500);
        }

        return pc;
      })()
        .catch(() => {
          dropPeer(remoteId);
          return null;
        })
        .finally(() => {
          if (peerPromisesRef.current.get(remoteId) === promise) {
            peerPromisesRef.current.delete(remoteId);
          }
        });

      peerPromisesRef.current.set(remoteId, promise);
      return promise;
    },
    [channelId, userId, dropPeer],
  );

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (!userId || payload.from === userId) return;
      if (payload.to && payload.to !== userId) return;
      // A joiner announces itself the moment its presence row is written.
      // Re-reading presence here starts negotiation straight away instead of
      // waiting on the postgres_changes feed, which can lag by seconds. The
      // payload itself is never trusted: only the database row counts.
      if (payload.type === "hello") {
        if (!participantIdsRef.current.has(payload.from)) void loadPresence();
        return;
      }
      // Drop signals from anyone outside voice presence without a negotiated
      // peer: forged `leave`s would otherwise drop live tiles, and forged
      // offers would harvest srflx (IP-revealing) candidates. An offer can
      // beat our presence read, so check the database once before dropping it.
      if (!participantIdsRef.current.has(payload.from) && !peersRef.current.has(payload.from)) {
        if (payload.type !== "offer") return;
        await loadPresence();
        if (!participantIdsRef.current.has(payload.from)) return;
      }

      if (payload.type === "soundboard") {
        receiveSoundboard(payload.from, payload.url, deafenedRef.current);
        return;
      }

      // A stop signal can arrive before the track's ended event (or instead
      // of it when the sharer's tab was closed). Clear the tile immediately.
      if (payload.type === "screen" && !payload.sharing) {
        const drop = (prev: Map<string, MediaStream>) => {
          if (!prev.has(payload.from)) return prev;
          const next = new Map(prev);
          next.delete(payload.from);
          return next;
        };
        setRemoteScreens(drop);
        setRemoteScreenAudio(drop);
      }

      if ((payload.type === "offer" || payload.type === "answer" || payload.type === "ice") && viaSfu(payload.from)) return;

      let pc = peersRef.current.get(payload.from);
      if (!pc && (payload.type === "offer" || payload.type === "answer")) {
        pc = await createPeer(payload.from, false) ?? peersRef.current.get(payload.from);
      }
      if (!pc) return;

      if (payload.type === "offer" && payload.sdp) {
        // A retry can deliver the same offer twice. Re-answering a second
        // copy after the first answer already stabilised the connection puts
        // the initiator into the wrong signaling state, so ignore it.
        if (pc.signalingState === "stable" && pc.remoteDescription?.sdp === payload.sdp.sdp) return;
        // A duplicate that lands while the first copy is still being answered
        // would be an illegal second remote offer.
        if (pc.signalingState === "have-remote-offer" || pc.signalingState === "closed") return;

        // Glare guard: roll back our own pending offer before accepting theirs.
        if (pc.signalingState === "have-local-offer") {
          const retry = offerRetryTimersRef.current.get(payload.from);
          if (retry) window.clearTimeout(retry);
          offerRetryTimersRef.current.delete(payload.from);
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch {
            // Nothing pending to roll back.
          }
        }
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushQueuedIce(pc, payload.from);

        openLanesForSending(pc);
        if (pendingLocalRef.current.has(payload.from)) {
          const mic = pendingLocalRef.current.get(payload.from) ?? null;
          pendingLocalRef.current.delete(payload.from);
          await setLaneTrack(pc, LANE_AUDIO, mic);
          await setLaneTrack(pc, LANE_CAMERA, cameraTrackRef.current);
          await setLaneTrack(pc, LANE_SCREEN, screenTrackRef.current);
          await setLaneTrack(pc, LANE_SCREEN_AUDIO, screenAudioTrackRef.current);
        }
        const answer = tuneOpus(await pc.createAnswer());
        await pc.setLocalDescription(answer);
        signalRef.current?.send({
          type: "broadcast",
          event: "signal",
          payload: {
            type: "answer",
            from: userId,
            to: payload.from,
            sdp: answer,
          } satisfies SignalPayload,
        });
      } else if (payload.type === "answer" && payload.sdp) {
        // Ignore a duplicate answer. It arrives after our first one put the
        // connection into "stable", where setRemoteDescription(answer) throws.
        if (pc.signalingState !== "have-local-offer") return;
        const retry = offerRetryTimersRef.current.get(payload.from);
        if (retry) window.clearTimeout(retry);
        offerRetryTimersRef.current.delete(payload.from);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        await flushQueuedIce(pc, payload.from);
      } else if (payload.type === "ice" && payload.candidate) {
        // Candidates routinely beat the offer/answer through the broadcast
        // channel. addIceCandidate before the remote description is set
        // throws, and the candidate used to be lost forever.
        if (!pc.remoteDescription) {
          const queued = pendingIceRef.current.get(payload.from) ?? [];
          queued.push(payload.candidate);
          pendingIceRef.current.set(payload.from, queued);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            // A late candidate for a dropped m-line is harmless.
          }
        }
      } else if (payload.type === "leave") {
        dropPeer(payload.from);
        // Their presence row is deleted right behind this; show it now
        // rather than waiting for the change feed.
        void loadPresence();
      }
    },
    [createPeer, dropPeer, flushQueuedIce, loadPresence, userId, viaSfu],
  );

  /** A track arrived from someone through the SFU: show or play it like a mesh one. */
  const applySfuTrack = useCallback((remoteId: string, name: SfuTrackName, track: MediaStreamTrack | null) => {
    const setOne = (prev: Map<string, MediaStream>) => {
      const next = new Map(prev);
      if (track && track.readyState === "live") next.set(remoteId, new MediaStream([track]));
      else next.delete(remoteId);
      return next;
    };
    if (name === "screen") {
      setRemoteScreens(setOne);
      return;
    }
    if (name === "screenaudio") {
      setRemoteScreenAudio(setOne);
      return;
    }
    if (track) {
      setRemoteStreams((prev) => attachRemoteTrack(prev, remoteId, track, undefined));
      if (name === "audio") {
        setConnectedPeerIds((prev) => (prev.has(remoteId) ? prev : new Set(prev).add(remoteId)));
        if (!connectedSoundRef.current) {
          connectedSoundRef.current = true;
          playCallConnected();
        }
      }
      return;
    }
    // Gone: keep their other track (mic without camera, or the reverse).
    const kind = name === "audio" ? "audio" : "video";
    setRemoteStreams((prev) => {
      const stream = prev.get(remoteId);
      if (!stream) return prev;
      const next = new Map(prev);
      const rest = stream.getTracks().filter((t) => t.kind !== kind);
      if (rest.length) next.set(remoteId, new MediaStream(rest));
      else next.delete(remoteId);
      return next;
    });
    if (name === "audio") {
      setConnectedPeerIds((prev) => {
        if (!prev.has(remoteId)) return prev;
        const next = new Set(prev);
        next.delete(remoteId);
        return next;
      });
    }
  }, []);

  /** Tell the room what I'm sending through the SFU, so they pull exactly that. */
  const publishSfuTracks = useCallback((tracks: SfuTrackName[]) => {
    if (!channelId || !userId) return;
    void getSupabaseClient()
      .from("voice_presence")
      .update({ sfu_tracks: tracks })
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .then(() => {}, () => {});
  }, [channelId, userId]);

  /*
   The link to the voice server can drop: a network change, a laptop
   waking, or a relay whose credentials ran out mid-call. Nothing used to
   notice, so audio stopped both ways until people rejoined, about every
   half hour for anyone on a relay. Now a failed link (or one disconnected
   for 5 seconds) is rebuilt with fresh credentials: a new session, my
   tracks sent again, everyone pulled again.
  */
  const sfuWatchTimerRef = useRef<number | null>(null);
  const sfuRebuildingRef = useRef(false);
  const rebuildSfuRef = useRef<(failed: SfuSeat) => void>(() => {});

  const watchSfu = useCallback((seat: SfuSeat, state: RTCPeerConnectionState) => {
    if (sfuRef.current !== seat) return;
    if (sfuWatchTimerRef.current !== null) {
      window.clearTimeout(sfuWatchTimerRef.current);
      sfuWatchTimerRef.current = null;
    }
    if (state === "failed") {
      rebuildSfuRef.current(seat);
    } else if (state === "disconnected") {
      sfuWatchTimerRef.current = window.setTimeout(() => {
        sfuWatchTimerRef.current = null;
        const now = seat.connectionState;
        if (sfuRef.current === seat && (now === "disconnected" || now === "failed")) rebuildSfuRef.current(seat);
      }, 5_000);
    }
  }, []);

  const newSfuSeat = useCallback((id: string) => {
    const seat: SfuSeat = new SfuSeat(id, {
      onTrack: (remoteId, name, track) => applySfuTrack(remoteId, name, track),
      onTrackGone: (remoteId, name) => applySfuTrack(remoteId, name, null),
      onState: (state) => watchSfu(seat, state),
    });
    return seat;
  }, [applySfuTrack, watchSfu]);

  useEffect(() => {
    rebuildSfuRef.current = (failed: SfuSeat) => {
      if (!channelId || sfuRebuildingRef.current || sfuRef.current !== failed) return;
      sfuRebuildingRef.current = true;
      console.warn("[voice] SFU link lost, reconnecting");
      // The old seat stays in sfuRef (closed) until the new one is ready, so
      // nobody on the SFU gets a direct connection in the meantime.
      failed.close();
      void (async () => {
        const seat = newSfuSeat(channelId);
        try {
          await refreshIceServers();
          await Promise.race([
            seat.start(localStreamRef.current?.getAudioTracks()[0] ?? null),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error("Voice server took too long")), 10_000)),
          ]);
          let tracks: SfuTrackName[] = ["audio"];
          if (cameraTrackRef.current) tracks = await seat.setTrack("camera", cameraTrackRef.current);
          if (screenTrackRef.current) {
            await seat.setTrack("screen", screenTrackRef.current);
            tracks = await seat.setTrack("screenaudio", screenAudioTrackRef.current);
          }
          if (sfuRef.current !== failed) {
            seat.close();  // left the channel while reconnecting
            return;
          }
          sfuRef.current = seat;
          publishSfuTracks(tracks);
          void seat.sync(sfuRemotes(participantsRef.current, userId)).catch(() => {});
          void tuneActiveScreenShare();
          console.info("[voice] SFU reconnected");
        } catch (e) {
          console.warn("[voice] SFU reconnect failed, trying again", e);
          seat.close();
          if (sfuRef.current === failed) {
            sfuWatchTimerRef.current = window.setTimeout(() => {
              sfuWatchTimerRef.current = null;
              rebuildSfuRef.current(failed);
            }, 5_000);
          }
        } finally {
          sfuRebuildingRef.current = false;
        }
      })();
    };
  });

  const cleanup = useCallback(async () => {
    clearActiveScreenShare(screenTrackRef.current);
    if (sfuWatchTimerRef.current !== null) {
      window.clearTimeout(sfuWatchTimerRef.current);
      sfuWatchTimerRef.current = null;
    }
    sfuRef.current?.close();
    sfuRef.current = null;
    [...peersRef.current.keys()].forEach(dropPeer);
    // Also cancel peers that are still waiting on TURN credentials.
    [...peerPromisesRef.current.keys()].forEach(dropPeer);
    peerPromisesRef.current.clear();
    pendingLocalRef.current.clear();
    pendingIceRef.current.clear();
    offerRetryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    offerRetryTimersRef.current.clear();
    reconnectTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reconnectTimersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    // Leaving ends my camera and screen share too; they used to keep running
    // (camera light on) and carry over into the next channel.
    for (const ref of [cameraTrackRef, screenTrackRef, screenAudioTrackRef]) {
      ref.current?.stop();
      ref.current = null;
    }
    setCameraEnabled(false);
    setScreenEnabled(false);
    setLocalView(null);
    setLocalScreen(null);
    setActiveVoiceMixer(null);
    setRemoteStreams(new Map());
    setRemoteScreens(new Map());
    setRemoteScreenAudio(new Map());
    setConnectedPeerIds(new Set());
    connectedSoundRef.current = false;
    audioRefsRef.current.clear();

    if (signalRef.current) {
      try {
        await signalRef.current.unsubscribe();
      } catch {
        // The socket may already be gone; presence cleanup still has to run.
      }
      signalRef.current = null;
    }

    if (channelId && userId) {
      const supabase = getSupabaseClient();
      await supabase.from("voice_presence").delete().eq("channel_id", channelId).eq("user_id", userId);
    }
    setJoined(false);
  }, [channelId, userId, dropPeer]);

  useEffect(() => {
    if (!joined || !channelId || !userId) return;
    const supabase = getSupabaseClient();
    const beat = () => {
      // Must be awaited or .then'd to actually send: this heartbeat never ran
      // before, so the prune job dropped everyone after two minutes in a room.
      void supabase.rpc("touch_voice_presence", { p_channel: channelId }).then(() => {}, () => {});
    };
    beat();
    const timer = window.setInterval(beat, 30_000);
    return () => window.clearInterval(timer);
  }, [joined, channelId, userId]);

  // Closing the tab or app skips cleanup(), so the row used to linger until
  // it aged out of voice_presence_live (90 seconds) and the room showed a
  // ghost. A keepalive request survives the page unloading.
  useEffect(() => {
    if (!joined || !channelId || !userId) return;
    const onPageHide = () => {
      void signalRef.current?.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "leave", from: userId } satisfies SignalPayload,
      });
      void getSupabaseClient().auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        void fetch(
          `${PUBLIC_ENV.supabaseUrl}/rest/v1/voice_presence?channel_id=eq.${channelId}&user_id=eq.${userId}`,
          { method: "DELETE", keepalive: true, headers: { apikey: PUBLIC_ENV.supabaseAnonKey, Authorization: `Bearer ${token}` } },
        ).catch(() => {});
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [joined, channelId, userId]);

  const join = useCallback(async () => {
    if (!channelId || !userId) return;
    setError(null);
    try {
      // Start minting TURN credentials while the mic and audio graph spin up.
      // The first `/api/turn` call can take seconds; peers must not wait for
      // it serially after presence says we've joined.
      void fetchIceServers();
      preloadAiNoiseSuppression();
      const raw = await getDisbandUserMedia({ audio: true, video: false });
      const rawMic = raw.getAudioTracks()[0] ?? null;
      const mixer = new VoiceMixer(rawMic, {
        micMuted,
      });
      localStreamRef.current = new MediaStream([mixer.audioTrack]);
      setActiveVoiceMixer(mixer);

      const supabase = getSupabaseClient();
      const ch = supabase.channel(`voice:${channelId}`, {
        config: { broadcast: { self: false } },
      });

      ch.on("broadcast", { event: "signal" }, ({ payload }) => {
        void handleSignal(payload as SignalPayload);
      });
      signalRef.current = ch;

      // Subscribe before writing presence. The old order let the room see us
      // and send an offer before this socket was listening, which is why the
      // first join often sat in "Connecting…" with no media.
      await waitForSubscribed(ch);

      const useSfu = await sfuAvailable();
      const { error: presenceError } = await supabase.from("voice_presence").upsert({
        channel_id: channelId,
        user_id: userId,
        muted: micMuted,
        deafened,
        transport: useSfu ? "sfu" : "mesh",
        sfu_tracks: [],
      });
      // A full or locked channel refuses the row (0197); say why.
      if (presenceError) throw new Error(presenceError.message || "Could not join the voice channel");

      if (useSfu) {
        const seat = newSfuSeat(channelId);
        try {
          // Never let the voice server hold the join: after 8 seconds, go direct.
          await Promise.race([
            seat.start(rawMic ? localStreamRef.current.getAudioTracks()[0] : null),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error("Voice server took too long")), 8_000)),
          ]);
          sfuRef.current = seat;
          publishSfuTracks(["audio"]);
        } catch (sfuError) {
          // Cloudflare unreachable: carry on with direct connections.
          console.warn("Voice server unavailable, using direct connections", sfuError);
          seat.close();
          await supabase.from("voice_presence").update({ transport: "mesh" })
            .eq("channel_id", channelId).eq("user_id", userId);
        }
      }
      void ch.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "hello", from: userId } satisfies SignalPayload,
      });

      // loadPresence returns the presence rows before it resolves names and
      // avatars, so flipping joined here starts peer negotiation immediately
      // instead of waiting on a profile fetch.
      const loaded = await loadPresence(true);
      setJoined(true);

      const others = loaded.filter((p) => p.user_id !== userId);
      if (others.length === 0) {
        connectedSoundRef.current = true;
        playCallConnected();
      }
    } catch (e) {
      setError((e as Error).message || "Could not access microphone");
      await cleanup();
    }
  }, [channelId, userId, cleanup, handleSignal, loadPresence, micMuted, deafened, newSfuSeat, publishSfuTracks]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraTrackRef.current;
    if (!next) {
      cameraTrackRef.current?.stop();
      cameraTrackRef.current = null;
      for (const pc of peersRef.current.values()) await setLaneTrack(pc, LANE_CAMERA, null);
      if (sfuRef.current) publishSfuTracks(await sfuRef.current.setTrack("camera", null));
      setCameraEnabled(false);
      setLocalView(null);
      return;
    }
    try {
      const cam = await getDisbandUserMedia({ video: true });
      const track = cam.getVideoTracks()[0];
      cameraTrackRef.current = track;
      for (const pc of peersRef.current.values()) await setLaneTrack(pc, LANE_CAMERA, track);
      if (sfuRef.current) publishSfuTracks(await sfuRef.current.setTrack("camera", track));
      setCameraEnabled(true);
      setLocalView(new MediaStream([...(localStreamRef.current?.getAudioTracks() ?? []), track]));
    } catch {
      setCameraEnabled(false);
    }
  }, [publishSfuTracks]);

  const announceSharing = useCallback((sharing: boolean) => {
    if (!userId) return;
    void signalRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "screen", from: userId, sharing } satisfies SignalPayload,
    });
  }, [userId]);

  const toggleScreenShare = useCallback(async () => {
    const next = !screenTrackRef.current;
    if (!next) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      screenAudioTrackRef.current?.stop();
      screenAudioTrackRef.current = null;
      for (const pc of peersRef.current.values()) {
        await setLaneTrack(pc, LANE_SCREEN, null);
        await setLaneTrack(pc, LANE_SCREEN_AUDIO, null);
      }
      clearActiveScreenShare(null);
      if (sfuRef.current) {
        await sfuRef.current.setTrack("screen", null);
        publishSfuTracks(await sfuRef.current.setTrack("screenaudio", null));
      }
      setLocalScreen(null);
      setScreenEnabled(false);
      announceSharing(false);
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia(
        buildScreenConstraints((planRef.current ?? "free") as SubscriptionPlan),
      );
      const track = display.getVideoTracks()[0];
      track.addEventListener("ended", () => { void toggleScreenShare(); });
      screenTrackRef.current = track;
      screenAudioTrackRef.current = display.getAudioTracks()[0] ?? null;
      for (const pc of peersRef.current.values()) {
        await setLaneTrack(pc, LANE_SCREEN, track);
        await setLaneTrack(pc, LANE_SCREEN_AUDIO, screenAudioTrackRef.current);
      }
      if (sfuRef.current) {
        await sfuRef.current.setTrack("screen", track);
        publishSfuTracks(await sfuRef.current.setTrack("screenaudio", screenAudioTrackRef.current));
      }
      setActiveScreenShare({
        track,
        plan: (planRef.current ?? "free") as SubscriptionPlan,
        connections: () => [...peersRef.current.values(), sfuRef.current?.peerConnection],
      });
      setLocalScreen(new MediaStream([track]));
      setScreenEnabled(true);
      announceSharing(true);
    } catch {
      setScreenEnabled(false);
    }
  }, [announceSharing, publishSfuTracks]);

  const leave = useCallback(async () => {
    if (userId && signalRef.current) {
      try {
        await signalRef.current.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "leave", from: userId } satisfies SignalPayload,
        });
      } catch {
        // A dead socket must not trap us in the channel with a stale row.
      }
    }
    await cleanup();
    await loadPresence();
  }, [cleanup, loadPresence, userId]);

  useEffect(() => {
    if (!channelId) return;
    void loadPresence();
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`presence:${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_presence", filter: `channel_id=eq.${channelId}` },
        () => void loadPresence(),
      )
      // Realtime cannot filter DELETE events, so the filtered listener above
      // never heard anyone leave; the room only caught up on the 20-second
      // poll. The old row carries the key, so match the channel here.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "voice_presence" },
        (change) => {
          const old = change.old as { channel_id?: string };
          if (!old.channel_id || old.channel_id === channelId) void loadPresence();
        },
      )
      .subscribe();
    return () => {
      void sub.unsubscribe();
    };
  }, [channelId, loadPresence]);

  useEffect(() => {
    if (!joined || !userId) return;
    const active = new Set(participants.map((p) => p.user_id));
    active.delete(userId);

    // Presence is the source of truth for who is still in the room. Close
    // peers for people who vanished without their `leave` broadcast, and
    // leave transient empty snapshots alone so a bad fetch does not tear
    // down a working call.
    if (participants.length > 0) {
      for (const id of [...peersRef.current.keys()]) {
        if (!active.has(id)) dropPeer(id);
      }
      for (const id of [...peerPromisesRef.current.keys()]) {
        if (!active.has(id)) dropPeer(id);
      }
    }

    for (const id of active) {
      if (viaSfu(id)) {
        if (peersRef.current.has(id) || peerPromisesRef.current.has(id)) dropPeer(id);
        continue;
      }
      if (!peersRef.current.has(id) && !peerPromisesRef.current.has(id)) {
        void createPeer(id, userId < id);
      }
    }

    // Everyone else on the SFU: pull what each of them is sending.
    const seat = sfuRef.current;
    if (seat) void seat.sync(sfuRemotes(participants, userId)).catch(() => {});
  }, [participants, joined, userId, createPeer, dropPeer, viaSfu]);

  // Realtime presence can silently stop delivering on a sleeping laptop or a
  // dropped websocket. Poll while joined so a dead peer is eventually
  // reconciled even when no postgres_changes event arrives.
  useEffect(() => {
    if (!joined || !channelId) return;
    const timer = window.setInterval(() => void loadPresence(), 20_000);
    return () => window.clearInterval(timer);
  }, [joined, channelId, loadPresence]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  return {
    joined,
    participants,
    connectedPeerIds,
    remoteStreams,
    remoteScreens,
    remoteScreenAudio,
    localScreen,
    cameraEnabled,
    screenEnabled,
    toggleCamera,
    toggleScreenShare,
    error,
    join,
    leave,
    localStream: localView ?? localStreamRef.current,
    profile,
  };
}
