"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildScreenConstraints } from "@/lib/stream-quality";
import type { SubscriptionPlan } from "@/lib/subscription";
import {
  attachRemoteTrack, ensureLanes, laneOfTransceiver, openLanesForSending, setLaneTrack,
  LANE_AUDIO, LANE_CAMERA, LANE_SCREEN, LANE_SCREEN_AUDIO,
} from "@/lib/webrtc";
import { getDisbandUserMedia } from "@/lib/media";
import { VoiceMixer, setActiveVoiceMixer } from "@/lib/voice-mixer";
import { playCallConnected, playCallJoin, playCallLeave } from "@/lib/call-sounds";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import type { Profile, VoicePresence } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { fetchIceServers } from "@/lib/ice-servers";
import { useVoiceMinutes } from "@/hooks/useVoiceMinutes";
import { isNoiseCancellationEnabled, getNoiseCancellationStrength } from "@/lib/audio-settings";

interface SignalPayload {
  type: "offer" | "answer" | "ice" | "leave" | "screen";

  sharing?: boolean;
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

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
  }, [micMuted]);

  useEffect(() => {
    audioRefsRef.current.forEach((el) => { el.muted = deafened; });
  }, [deafened]);

  useEffect(() => {
    if (!channelId || !userId || !joined) return;
    void getSupabaseClient()
      .from("voice_presence")
      .update({ muted: micMuted, deafened })
      .eq("channel_id", channelId)
      .eq("user_id", userId);
  }, [channelId, userId, joined, micMuted, deafened]);

  const prevPresenceRef = useRef<Set<string>>(new Set());
  // Membership-proofed sender set for the signal handler: presence insert
  // requires server membership (voice_insert_own), so anyone listed is a
  // verified member of this server — unlike the raw `from` field, which any
  // holder of the anon key can forge.
  const participantIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    participantIdsRef.current = new Set(participants.map((p) => p.user_id));
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
          pc = new RTCPeerConnection({ iceServers: await fetchIceServers() });
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
              // show it while media is actually flowing; unmute re-adds it.
              const carrying = track.readyState === "live" && !track.muted;
              setRemoteScreens((prev) => {
                if (carrying) {
                  const next = new Map(prev);
                  next.set(remoteId, new MediaStream([track]));
                  return next;
                }
                if (!prev.has(remoteId)) return prev;
                const next = new Map(prev);
                next.delete(remoteId);
                return next;
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
          const offer = await pc.createOffer();
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
          }, 2_500);
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
      // Drop signals from anyone outside voice presence without a negotiated
      // peer: forged `leave`s would otherwise drop live tiles, and forged
      // offers would harvest srflx (IP-revealing) candidates. Joiners
      // bootstrap through the presence-driven initiator path below.
      if (!participantIdsRef.current.has(payload.from) && !peersRef.current.has(payload.from)) return;

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
        const answer = await pc.createAnswer();
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
      }
    },
    [createPeer, dropPeer, flushQueuedIce, userId],
  );

  const cleanup = useCallback(async () => {
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
      void supabase.rpc("touch_voice_presence", { p_channel: channelId });
    };
    beat();
    const timer = window.setInterval(beat, 30_000);
    return () => window.clearInterval(timer);
  }, [joined, channelId, userId]);

  const join = useCallback(async () => {
    if (!channelId || !userId) return;
    setError(null);
    try {
      // Start minting TURN credentials while the mic and audio graph spin up.
      // The first `/api/turn` call can take seconds; peers must not wait for
      // it serially after presence says we've joined.
      void fetchIceServers();
      const raw = await getDisbandUserMedia({ audio: true, video: false });
      const rawMic = raw.getAudioTracks()[0] ?? null;
      const mixer = new VoiceMixer(rawMic, {
        micMuted,
        noiseCancellation: isNoiseCancellationEnabled(),
        noiseStrength: getNoiseCancellationStrength(),
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

      await supabase.from("voice_presence").upsert({
        channel_id: channelId,
        user_id: userId,
        muted: micMuted,
        deafened,
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
  }, [channelId, userId, cleanup, handleSignal, loadPresence, micMuted, deafened]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraTrackRef.current;
    if (!next) {
      cameraTrackRef.current?.stop();
      cameraTrackRef.current = null;
      for (const pc of peersRef.current.values()) await setLaneTrack(pc, LANE_CAMERA, null);
      setCameraEnabled(false);
      return;
    }
    try {
      const cam = await getDisbandUserMedia({ video: true });
      const track = cam.getVideoTracks()[0];
      cameraTrackRef.current = track;
      for (const pc of peersRef.current.values()) await setLaneTrack(pc, LANE_CAMERA, track);
      setCameraEnabled(true);
    } catch {
      setCameraEnabled(false);
    }
  }, []);

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
      setLocalScreen(new MediaStream([track]));
      setScreenEnabled(true);
      announceSharing(true);
    } catch {
      setScreenEnabled(false);
    }
  }, [announceSharing]);

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
      if (!peersRef.current.has(id) && !peerPromisesRef.current.has(id)) {
        void createPeer(id, userId < id);
      }
    }
  }, [participants, joined, userId, createPeer, dropPeer]);

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
    localStream: localStreamRef.current,
    profile,
  };
}
