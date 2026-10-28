"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { startRingtone, stopRingtone } from "@/lib/ringtone";
import { playCallConnected, playCallEnd, playCallLeave } from "@/lib/call-sounds";
import { displayName } from "@/lib/utils";
import { getDisbandUserMedia, warmUpMediaDevices } from "@/lib/media";
import { VoiceMixer, setActiveVoiceMixer } from "@/lib/voice-mixer";
import { isNoiseCancellationEnabled, getNoiseCancellationStrength } from "@/lib/audio-settings";
import { buildVideoConstraints } from "@/lib/audio-settings";
import { notifyUser, requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { broadcastOnChannel, subscribeChannel } from "@/lib/realtime";
import {
  bindRemoteTrack, bindLaneStream, streamWithoutEndedTracks,
  ensureLanes, laneOfTransceiver, openLanesForSending, setLaneTrack, LANE_AUDIO, LANE_CAMERA, LANE_SCREEN, LANE_SCREEN_AUDIO,
} from "@/lib/webrtc";
import { buildScreenConstraints } from "@/lib/stream-quality";
import type { SubscriptionPlan } from "@/lib/subscription";
import type { Profile } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallPhase = "idle" | "outgoing" | "incoming" | "active";

interface CallSignal {
  type: "ring" | "accept" | "reject" | "cancel" | "offer" | "answer" | "ice" | "leave" | "handled" | "screen";

  sharing?: boolean;
  from: string;
  to?: string;
  callId?: string;
  callerName?: string;
  rejecterName?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

import { fetchIceServers, getIceServers, hasTurnConfigured, refreshIceServers } from "@/lib/ice-servers";
import { useVoiceMinutes } from "@/hooks/useVoiceMinutes";

export interface IncomingCallInfo {
  fromId: string;
  callerName: string;
  callId: string;
  profile?: Profile;
}

export function useCallManager(
  userId: string | null,
  profile: Profile | null,
  micMuted: boolean,
  deafened: boolean,
  isBlocked?: (id: string) => boolean,
  plan?: string,
) {
  const isBlockedRef = useRef(isBlocked);
  isBlockedRef.current = isBlocked;
  const planRef = useRef(plan);
  useEffect(() => { planRef.current = plan; }, [plan]);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [incoming, setIncoming] = useState<IncomingCallInfo | null>(null);
  const [activePeer, setActivePeer] = useState<Profile | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [remoteScreen, setRemoteScreen] = useState<MediaStream | null>(null);
  const [remoteScreenAudio, setRemoteScreenAudio] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const [peerSharing, setPeerSharing] = useState(false);
  const screenTrackByLaneRef = useRef<MediaStreamTrack | null>(null);
  const pendingLocalRef = useRef<{ mic: MediaStreamTrack | null; cam: MediaStreamTrack | null } | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  // `phase === "active"` starts when the call is answered, before ICE/DTLS
  // finishes. The UI must not claim you're connected until this flips.
  const [rtcConnected, setRtcConnected] = useState(false);
  const mediaConnectedRef = useRef(false);

  useVoiceMinutes(phase === "active");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const signalRef = useRef<RealtimeChannel | null>(null);
  const listenRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const activePeerIdRef = useRef<string | null>(null);

  const iceRetryRef = useRef(0);
  const disconnectTimerRef = useRef<number | null>(null);
  const offerRetryRef = useRef<number | null>(null);
  const callerRef = useRef(false);
  const lastPeerRef = useRef<Profile | null>(null);
  const reconnectingRef = useRef(false);

  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const phaseRef = useRef<CallPhase>("idle");
  const cameraRef = useRef(false);
  const screenShareRef = useRef(false);
  const trackCleanupsRef = useRef<Array<() => void>>([]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { cameraRef.current = cameraEnabled; }, [cameraEnabled]);
  useEffect(() => { screenShareRef.current = screenShareEnabled; }, [screenShareEnabled]);

  const applyMic = useCallback((muted: boolean) => {
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }, []);

  const applyDeafen = useCallback((deaf: boolean) => {
    if (remoteAudioRef.current) remoteAudioRef.current.muted = deaf;
  }, []);

  useEffect(() => { applyMic(micMuted); }, [micMuted, applyMic]);
  useEffect(() => { applyDeafen(deafened); }, [deafened, applyDeafen]);

  const cleanupRtc = useCallback(async () => {
    trackCleanupsRef.current.forEach((cleanup) => cleanup());
    trackCleanupsRef.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setActiveVoiceMixer(null);
    setRemoteStream(null);
    if (signalRef.current) {
      await signalRef.current.unsubscribe();
      signalRef.current = null;
    }
  }, []);

  const reset = useCallback(async () => {
    setPeerSharing(false);
    setRemoteScreen(null);
    setRemoteScreenAudio(null);
    setLocalScreen(null);
    stopRingtone();
    await cleanupRtc();
    if (disconnectTimerRef.current !== null) {
      window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    if (offerRetryRef.current !== null) {
      window.clearTimeout(offerRetryRef.current);
      offerRetryRef.current = null;
    }
    iceRetryRef.current = 0;
    reconnectingRef.current = false;
    pendingIceRef.current = [];
    setPhase("idle");
    setIncoming(null);
    setActivePeer(null);
    setError(null);
    setCameraEnabled(false);
    cameraRef.current = false;
    setConnectedAt(null);
    setRtcConnected(false);
    mediaConnectedRef.current = false;
    activeCallIdRef.current = null;
    activePeerIdRef.current = null;
  }, [cleanupRtc]);

  const sendToUser = useCallback(async (targetId: string, payload: CallSignal) => {
    await broadcastOnChannel(getSupabaseClient(), `call-user:${targetId}`, "call", payload);
  }, []);

  /**
   * Tell this account's other clients (web, desktop, phone) that the ring was
   * answered or declined here, so they stop ringing.
   *
   * Goes out on the listener channel we already hold. `sendToUser(userId, …)`
   * used to do this, but `supabase.channel(topic)` hands back the existing
   * channel for a topic we're already subscribed to — so the helper's
   * cleanup unsubscribed our own call listener, and the message often never
   * left. The other client kept ringing after the call was answered.
   */
  const notifyOwnClients = useCallback(async (callId: string) => {
    if (!userId) return;
    const payload: CallSignal = { type: "handled", from: userId, to: userId, callId };
    const ch = listenRef.current;
    if (ch) {
      await ch.send({ type: "broadcast", event: "call", payload });
    }
  }, [userId]);

  const notifyPeerLeave = useCallback(async (peerId: string, callId: string | null) => {
    if (!userId) return;
    const payload: CallSignal = { type: "leave", from: userId, to: peerId, callId: callId ?? undefined };
    if (signalRef.current) {
      await signalRef.current.send({ type: "broadcast", event: "call", payload });
    }
    await sendToUser(peerId, payload);
  }, [userId, sendToUser]);

  const setupRtc = useCallback(async (callId: string, peerId: string, asCaller: boolean) => {
    if (!userId) return;
    setRtcConnected(false);
    mediaConnectedRef.current = false;
    try {
      const supabase = getSupabaseClient();
      const ch = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } });
      // Publish this channel to reset() now, so a failure while the mic or
      // relay credentials are loading still unsubscribes it.
      signalRef.current = ch;

      // The offer can arrive while getUserMedia and /api/turn are still
      // running. Keep it until the peer connection has its handlers, instead
      // of dropping it and waiting for the caller's 2.5-second retry.
      let handlePayload: ((payload: CallSignal) => void) | null = null;
      const earlyPayloads: CallSignal[] = [];
      ch.on("broadcast", { event: "call" }, ({ payload }) => {
        const signal = payload as CallSignal;
        if (!handlePayload) {
          // Offers are retried every 2.5s until answered. If the mic prompt
          // kept us busy, replay only the latest one instead of feeding
          // several setRemoteDescription offers into the same connection.
          if (signal.type === "offer") {
            const previous = earlyPayloads.findIndex((queued) => queued.type === "offer");
            if (previous !== -1) earlyPayloads.splice(previous, 1);
          }
          earlyPayloads.push(signal);
          return;
        }
        handlePayload(signal);
      });
      // Subscribe in parallel with media setup. This is the slowest part of
      // a desktop call after a cold start, and it does not need the mic.
      const subscribeResult = subscribeChannel(ch)
        .then(() => null)
        .catch((err: unknown) => err instanceof Error ? err : new Error("Call signaling failed"));

      const iceServersPromise = fetchIceServers();
      const iceServers = await iceServersPromise;
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      });
      pcRef.current = pc;
      callerRef.current = asCaller;

      pc.ontrack = (ev) => {
        if (laneOfTransceiver(pc, ev.transceiver) === LANE_SCREEN_AUDIO) {
          // Kept apart from the mic so the listener can mute it on its own.
          setRemoteScreenAudio(new MediaStream([ev.track]));
          return;
        }
        if (laneOfTransceiver(pc, ev.transceiver) === LANE_SCREEN) {

          screenTrackByLaneRef.current = ev.track;
          setRemoteScreen(new MediaStream([ev.track]));
          return;
        }
        const cleanup = bindRemoteTrack(setRemoteStream, ev.track);
        trackCleanupsRef.current.push(cleanup);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void ch.send({
            type: "broadcast",
            event: "call",
            payload: { type: "ice", from: userId, to: peerId, candidate: ev.candidate.toJSON() } satisfies CallSignal,
          });
        }
      };

      // Acquire the mic while ICE candidates are already being gathered.
      const raw = await getDisbandUserMedia({
        audio: true,
        video: cameraRef.current ? buildVideoConstraints(planRef.current) : false,
      });
      const rawMic = raw.getAudioTracks()[0] ?? null;
      const cameraTracks = raw.getVideoTracks();
      const mixer = new VoiceMixer(rawMic, {
        micMuted,
        noiseCancellation: isNoiseCancellationEnabled(),
        noiseStrength: getNoiseCancellationStrength(),
      });
      const stream = new MediaStream([mixer.audioTrack, ...cameraTracks]);
      localRef.current = stream;
      setLocalStream(stream);
      setActiveVoiceMixer(mixer);
      applyMic(micMuted);

      const mic0 = stream.getAudioTracks()[0] ?? null;
      const cam0 = stream.getVideoTracks()[0] ?? null;
      // Both sides need the lane transceivers up front: the callee used to
      // rely on the browser auto-creating them during createAnswer(), which is
      // implementation-dependent and broke calls on some desktop browsers.
      ensureLanes(pc);
      if (asCaller) {
        await setLaneTrack(pc, LANE_AUDIO, mic0);
        await setLaneTrack(pc, LANE_CAMERA, cam0);
      } else {

        pendingLocalRef.current = { mic: mic0, cam: cam0 };
      }

      pc.onnegotiationneeded = () => {
        if (!callerRef.current || pc.signalingState !== "stable") return;
        void (async () => {
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            await ch.send({
              type: "broadcast",
              event: "call",
              payload: { type: "offer", from: userId, to: peerId, sdp: offer } satisfies CallSignal,
            });
          } catch {

          }
        })();
      };
      const clearDisconnectTimer = () => {
        if (disconnectTimerRef.current !== null) {
          window.clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
      };
      const giveUp = (notice: string) => {
        reconnectingRef.current = false;
        setCallNotice(notice);
        window.setTimeout(() => setCallNotice(null), 8000);
        void reset();
      };
      const retryIce = () => {

        if (iceRetryRef.current >= 2 || !pcRef.current) {
          giveUp(
            hasTurnConfigured()
              ? "Lost the connection to the other person."
              : "Couldn't connect audio. Calls between a phone and a desktop usually need a TURN relay.",
          );
          return;
        }
        iceRetryRef.current += 1;
        reconnectingRef.current = true;
        setCallNotice(`Connection lost. Reconnecting… (attempt ${iceRetryRef.current} of 2)`);
        // restartIce() alone reuses the same (possibly expired) TURN
        // credentials that just failed. Mint fresh ones and push them into
        // the live connection before restarting.
        void (async () => {
          try {
            const servers = await refreshIceServers();
            pcRef.current?.setConfiguration({ iceServers: servers });
            pcRef.current?.restartIce();
          } catch {
            giveUp("Lost the connection to the other person.");
          }
        })();
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {

          clearDisconnectTimer();
          iceRetryRef.current = 0;
          setRtcConnected(true);
          if (!mediaConnectedRef.current) {
            mediaConnectedRef.current = true;
            setConnectedAt(Date.now());
            playCallConnected();
          }
          if (reconnectingRef.current) {
            reconnectingRef.current = false;
            setCallNotice("Reconnected.");
            window.setTimeout(() => setCallNotice(null), 3000);
          }
          return;
        }
        if (state === "failed") {
          clearDisconnectTimer();
          setRtcConnected(false);
          mediaConnectedRef.current = false;
          retryIce();
          return;
        }
        if (state === "disconnected") {

          setRtcConnected(false);
          mediaConnectedRef.current = false;
          if (disconnectTimerRef.current !== null) return;
          disconnectTimerRef.current = window.setTimeout(() => {
            disconnectTimerRef.current = null;
            const cur = pcRef.current?.connectionState;
            if (cur === "disconnected" || cur === "failed") retryIce();
          }, 5000);
          return;
        }
        if (state === "closed") {
          clearDisconnectTimer();
          void reset();
        }
      };

      const onCallPayload = (p: CallSignal) => {
        if (p.from === userId || (p.to && p.to !== userId)) return;
        // The `from` field is sender-controlled: only the peer this call was
        // set up with may drive it. Call IDs used to be deterministic
        // (`min:max` of the two user ids), so anyone who knew both ids could
        // join the channel and inject offers/answers/ICE (or harvest srflx
        // candidates, i.e. IPs). IDs are random per call now, and anything
        // not from the peer is dropped on the floor.
        if (p.from !== peerId) return;
        const addIce = async (candidate: RTCIceCandidateInit) => {
          try {
            if (!pc.remoteDescription) {
              pendingIceRef.current.push(candidate);
              return;
            }
            await pc.addIceCandidate(candidate);
          } catch {

          }
        };
        const drainIce = async () => {
          const queued = pendingIceRef.current;
          pendingIceRef.current = [];
          for (const candidate of queued) {
            try {
              await pc.addIceCandidate(candidate);
            } catch {

            }
          }
        };
        void (async () => {
          if (p.type === "offer" && p.sdp) {
            await pc.setRemoteDescription(p.sdp);
            await drainIce();
            openLanesForSending(pc);
            const pending = pendingLocalRef.current;
            if (pending) {
              pendingLocalRef.current = null;
              await setLaneTrack(pc, LANE_AUDIO, pending.mic);
              await setLaneTrack(pc, LANE_CAMERA, pending.cam);
              await setLaneTrack(pc, LANE_SCREEN, screenTrackRef.current);
              await setLaneTrack(pc, LANE_SCREEN_AUDIO, screenAudioTrackRef.current);
            }

            if (screenShareRef.current) announceSharing(true);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            setRemoteStream((prev) => streamWithoutEndedTracks(prev));
            void ch.send({ type: "broadcast", event: "call", payload: { type: "answer", from: userId, to: p.from, sdp: ans } });
          } else if (p.type === "answer" && p.sdp) {
            await pc.setRemoteDescription(p.sdp);
            await drainIce();
            setRemoteStream((prev) => streamWithoutEndedTracks(prev));
            // The offer landed: no more retransmits.
            if (offerRetryRef.current !== null) {
              window.clearTimeout(offerRetryRef.current);
              offerRetryRef.current = null;
            }
          } else if (p.type === "screen") {
            setPeerSharing(!!p.sharing);
          } else if (p.type === "ice" && p.candidate) {
            await addIce(p.candidate);
          } else if (p.type === "leave") {
            await reset();
          }
        })();
      };
      handlePayload = onCallPayload;
      for (const signal of earlyPayloads.splice(0)) onCallPayload(signal);

      const subscribeError = await subscribeResult;
      if (subscribeError) throw subscribeError;

      if (asCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await ch.send({ type: "broadcast", event: "call", payload: { type: "offer", from: userId, to: peerId, sdp: offer } });
        // Broadcast doesn't persist: if the callee hasn't joined call:{id}
        // yet (media permission prompt on iOS), the first offer is lost and
        // nothing ever retransmits it. Re-send the current local offer until
        // the answer arrives or the call ends.
        let attempts = 0;
        const resend = () => {
          offerRetryRef.current = null;
          const live = pcRef.current;
          if (!live || live.signalingState === "closed" || live.remoteDescription) return;
          if (attempts >= 4 || signalRef.current !== ch) return;
          attempts += 1;
          void (async () => {
            try {
              await ch.send({ type: "broadcast", event: "call", payload: { type: "offer", from: userId, to: peerId, sdp: live.localDescription } });
            } catch {
              // Next tick retries while attempts remain.
            }
            if (!live.remoteDescription) {
              offerRetryRef.current = window.setTimeout(resend, 1000);
            }
          })();
        };
        offerRetryRef.current = window.setTimeout(resend, 1000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start call";
      setError(message);
      await reset();
      throw err;
    }
  }, [userId, micMuted, applyMic, reset]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraRef.current;
    const pc = pcRef.current;
    const stream = localRef.current;
    // Before the call is live there is nothing to send on yet: just record the
    // intent, and setupRtc picks it up when the lanes open.
    if (!pc || !stream || phaseRef.current !== "active") {
      cameraRef.current = next;
      setCameraEnabled(next);
      return;
    }

    const existing = stream.getVideoTracks()[0];
    try {
      if (next) {
        let track = existing;
        if (track) {
          track.enabled = true;
        } else {
          const cam = await getDisbandUserMedia({
            video: buildVideoConstraints(planRef.current),
          });
          track = cam.getVideoTracks()[0];
          stream.addTrack(track);
        }
        await setLaneTrack(pc, LANE_CAMERA, track);
      } else if (existing) {
        existing.stop();
        stream.removeTrack(existing);
        await setLaneTrack(pc, LANE_CAMERA, null);
      }
      // Only light the button once the camera is actually flowing.
      cameraRef.current = next;
      setCameraEnabled(next);
    } catch (err) {
      setError(err instanceof Error ? `Camera unavailable: ${err.message}` : "Camera unavailable");
    }
    setLocalStream(new MediaStream(stream.getTracks()));
  }, []);

  const reapplyCameraConstraints = useCallback(async (nextPlan: string | undefined) => {
    const pc = pcRef.current;
    const stream = localRef.current;
    if (!pc || !stream || phaseRef.current !== "active" || !cameraRef.current) return;
    const peerId = activePeerIdRef.current;
    try {
      const cam = await getDisbandUserMedia({
        video: buildVideoConstraints(nextPlan),
      });
      const track = cam.getVideoTracks()[0];
      const existing = stream.getVideoTracks()[0];
      if (existing) {
        existing.stop();
        stream.removeTrack(existing);
      }
      stream.addTrack(track);
      await setLaneTrack(pc, LANE_CAMERA, track);
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch {

    }
  }, [userId]);

  const prevPlanRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (plan && plan !== prevPlanRef.current) {
      prevPlanRef.current = plan;
      void reapplyCameraConstraints(plan);
    }
  }, [plan, reapplyCameraConstraints]);

  const announceSharing = useCallback((sharing: boolean) => {
    const peerId = activePeerIdRef.current;
    if (!peerId || !signalRef.current || !userId) return;
    void signalRef.current.send({
      type: "broadcast",
      event: "call",
      payload: { type: "screen", from: userId, to: peerId, sharing } satisfies CallSignal,
    });
  }, [userId]);

  const toggleScreenShare = useCallback(async () => {
    const next = !screenShareRef.current;
    const pc = pcRef.current;
    if (!pc || phaseRef.current !== "active") return;

    if (!next) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      screenAudioTrackRef.current?.stop();
      screenAudioTrackRef.current = null;
      await setLaneTrack(pc, LANE_SCREEN, null);
      await setLaneTrack(pc, LANE_SCREEN_AUDIO, null);
      setLocalScreen(null);
      setScreenShareEnabled(false);
      screenShareRef.current = false;
      announceSharing(false);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing isn't supported here. Try the web app in Chrome, Edge or Safari.");
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia(
        buildScreenConstraints((planRef.current ?? "free") as SubscriptionPlan),
      );
      const track = display.getVideoTracks()[0];
      // The browser's own "Stop sharing" bar ends the track; go through the
      // ref so this never calls a stale copy of the toggle.
      track.addEventListener("ended", () => {
        if (screenTrackRef.current === track) void toggleScreenShareRef.current();
      });
      screenTrackRef.current = track;
      screenAudioTrackRef.current = display.getAudioTracks()[0] ?? null;
      await setLaneTrack(pc, LANE_SCREEN, track);
      await setLaneTrack(pc, LANE_SCREEN_AUDIO, screenAudioTrackRef.current);
      setLocalScreen(new MediaStream([track]));
      setScreenShareEnabled(true);
      screenShareRef.current = true;
      announceSharing(true);
    } catch (err) {
      setScreenShareEnabled(false);
      screenShareRef.current = false;
      // Dismissing the picker is a choice, not an error.
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setError(err instanceof Error ? `Couldn't share screen: ${err.message}` : "Couldn't share screen");
    }
  }, [announceSharing]);
  const toggleScreenShareRef = useRef(toggleScreenShare);
  toggleScreenShareRef.current = toggleScreenShare;


  const startCall = useCallback(async (peer: Profile) => {
    if (!userId || !profile) return;
    setError(null);
    void requestNotificationPermissionFromGesture();
    // Ring immediately. Device enumeration and relay credentials are warmed
    // in parallel and reused by setupRtc after the call is answered; awaiting
    // either here delayed the callee's phone for no reason.
    void warmUpMediaDevices();
    void fetchIceServers();
    const callId = crypto.randomUUID();
    activeCallIdRef.current = callId;
    activePeerIdRef.current = peer.id;
    lastPeerRef.current = peer;
    setActivePeer(peer);
    setPhase("outgoing");
    startRingtone();
    try {
      await sendToUser(peer.id, {
        type: "ring",
        from: userId,
        to: peer.id,
        callId,
        callerName: displayName(profile),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach caller");
      await reset();
      return;
    }

    void getSupabaseClient().functions.invoke("send-call-push", {
      body: { calleeId: peer.id, callId, callerName: displayName(profile) },
    }).then(({ data }) => {
      const result = data as { sent?: number; registered?: number; statuses?: number[] } | null;
      console.log("[send-call-push]", result);
      if (result && result.registered === 0) {
        setCallNotice("Their phone isn't registered for call push yet — open Disband on it once.");
      } else if (result && result.sent === 0 && result.statuses?.length) {
        setCallNotice(`Push rejected by Apple (${result.statuses.join(",")}) — see console for details.`);
      }
    }).catch((err) => {
      console.error("[send-call-push] invoke failed", err);
    });
  }, [userId, profile, sendToUser, reset]);

  const acceptCall = useCallback(async () => {
    if (!incoming || !userId) return;
    const call = incoming;
    stopRingtone();
    void requestNotificationPermissionFromGesture();
    const supabase = getSupabaseClient();

    // The ring already carried the profile in the common case. Never block
    // answering — and therefore the caller's offer — on a second profile
    // query; fill it in afterwards if the ring did not have one.
    setActivePeer(call.profile ?? null);
    if (call.profile) lastPeerRef.current = call.profile;
    activeCallIdRef.current = call.callId;
    activePeerIdRef.current = call.fromId;
    setPhase("active");
    setIncoming(null);

    void supabase.from("profiles").select("*").eq("id", call.fromId).maybeSingle().then(({ data }) => {
      if (!data || activeCallIdRef.current !== call.callId) return;
      setActivePeer(data as Profile);
      lastPeerRef.current = data as Profile;
    });

    // Start local media/TURN/subscription while the accept is in flight.
    // Waiting for that extra Realtime subscribe/send used to leave the caller
    // retrying offers against a callee that had not even opened its mic.
    const rtc = setupRtc(call.callId, call.fromId, false).catch(() => {
      // setupRtc sets the visible error and resets the call itself.
    });
    void notifyOwnClients(call.callId);
    try {
      await sendToUser(call.fromId, { type: "accept", from: userId, to: call.fromId, callId: call.callId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not answer the call");
      await reset();
      return;
    }
    await rtc;
  }, [incoming, userId, sendToUser, setupRtc, notifyOwnClients, reset]);

  const rejectCall = useCallback(async () => {
    if (!incoming || !userId || !profile) return;
    stopRingtone();
    await sendToUser(incoming.fromId, {
      type: "reject",
      from: userId,
      to: incoming.fromId,
      callId: incoming.callId,
      rejecterName: displayName(profile),
    });

    void notifyOwnClients(incoming.callId);
    setIncoming(null);
    setPhase("idle");
  }, [incoming, userId, profile, sendToUser, notifyOwnClients]);

  const endCall = useCallback(async () => {
    stopRingtone();
    const peerId = activePeerIdRef.current;
    const callId = activeCallIdRef.current;
    const currentPhase = phaseRef.current;
    if (userId && peerId) {
      if (currentPhase === "outgoing") {
        await sendToUser(peerId, { type: "cancel", from: userId, to: peerId, callId: callId ?? undefined });
      } else if (currentPhase === "active") {
        await notifyPeerLeave(peerId, callId);
      }
    }
    await reset();
  }, [userId, sendToUser, notifyPeerLeave, reset]);

  const retryCall = useCallback(async () => {
    const peer = lastPeerRef.current;
    if (!peer || phaseRef.current !== "idle" || incoming) return;
    await startCall(peer);
  }, [incoming, startCall]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call-user:${userId}`, { config: { broadcast: { self: false } } });
    let cancelled = false;

    ch.on("broadcast", { event: "call" }, ({ payload }) => {
      const p = payload as CallSignal;

      if (p.type === "handled") {
        if (phaseRef.current === "incoming") {
          stopRingtone();
          setIncoming(null);
          setPhase("idle");
        }
        return;
      }

      if (p.from === userId) return;

      void (async () => {
        if (p.type === "ring" && p.callId) {
          if (isBlockedRef.current?.(p.from)) return;
          if (phaseRef.current !== "idle") {
            await sendToUser(p.from, {
              type: "reject",
              from: userId!,
              to: p.from,
              callId: p.callId,
              rejecterName: profile ? displayName(profile) : "User",
            });
            return;
          }
          // Cache the relay credentials while the phone rings, and show the
          // overlay before the profile query: a slow profiles request used to
          // delay the ringtone and the first frame of the incoming call.
          void fetchIceServers();
          void warmUpMediaDevices();
          const callerName = p.callerName ?? "Someone";
          setIncoming({ fromId: p.from, callerName, callId: p.callId });
          setPhase("incoming");
          startRingtone();
          notifyUser(
            `Incoming call from ${callerName}`,
            "Open Disband to answer",
            { kind: "call", peerId: p.from },
          );
          void supabase.from("profiles").select("*").eq("id", p.from).maybeSingle().then(({ data }) => {
            if (!data) return;
            setIncoming((prev) => {
              if (!prev || prev.callId !== p.callId) return prev;
              return { ...prev, profile: data as Profile };
            });
          });
        } else if (p.type === "accept" && p.callId && phaseRef.current === "outgoing") {
          stopRingtone();
          setPhase("active");
          try {
            await setupRtc(p.callId, p.from, true);
          } catch {

          }
        } else if (p.type === "reject") {
          if (phaseRef.current === "outgoing") {
            setCallNotice(`${p.rejecterName ?? "They"} declined your call`);
            window.setTimeout(() => setCallNotice(null), 5000);
          }
          playCallEnd();
          await reset();
        } else if (p.type === "cancel" || p.type === "leave") {

          const fromActivePeer = activePeerIdRef.current === p.from;
          if (phaseRef.current === "active" ? fromActivePeer : phaseRef.current !== "idle") {
            if (phaseRef.current === "active") playCallLeave();
            else playCallEnd();
            await reset();
          }
        }
      })();
    });

    void subscribeChannel(ch)
      .then(() => {
        if (!cancelled) listenRef.current = ch;
        else void ch.unsubscribe();
      })
      .catch(() => {
        if (!cancelled) setError("Could not connect call signaling");
      });

    return () => {
      cancelled = true;
      void ch.unsubscribe();
      listenRef.current = null;
    };
  }, [userId, profile, sendToUser, setupRtc, reset]);

  useEffect(() => () => { void reset(); }, [reset]);

  return {
    phase,
    incoming,
    activePeer,
    localStream,
    remoteStream,

    remoteScreen: peerSharing ? remoteScreen : null,
    remoteScreenAudio: peerSharing ? remoteScreenAudio : null,
    localScreen,
    cameraEnabled,
    screenShareEnabled,
    remoteAudioRef,
    error,
    callNotice,
    connectedAt,
    rtcConnected,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    retryCall,

    canRetryCall: phase === "idle" && !incoming && lastPeerRef.current !== null,
    toggleCamera,
    toggleScreenShare,
  };
}
