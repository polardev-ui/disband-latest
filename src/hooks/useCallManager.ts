"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { directCallId, startRingtone, stopRingtone } from "@/lib/ringtone";
import { playCallConnected, playCallEnd, playCallLeave } from "@/lib/call-sounds";
import { displayName } from "@/lib/utils";
import { getDisbandUserMedia, warmUpMediaDevices } from "@/lib/media";
import { buildVideoConstraints } from "@/lib/audio-settings";
import { notifyUser, requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { broadcastOnChannel, subscribeChannel } from "@/lib/realtime";
import {
  bindRemoteTrack, bindLaneStream, streamWithoutEndedTracks,
  ensureLanes, laneOfTransceiver, openLanesForSending, setLaneTrack, LANE_AUDIO, LANE_CAMERA, LANE_SCREEN,
} from "@/lib/webrtc";
import { buildScreenConstraints } from "@/lib/stream-quality";
import type { SubscriptionPlan } from "@/lib/subscription";
import type { Profile } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallPhase = "idle" | "outgoing" | "incoming" | "active";

interface CallSignal {
  type: "ring" | "accept" | "reject" | "cancel" | "offer" | "answer" | "ice" | "leave" | "handled" | "screen";
  /** For "screen": whether the sender just started or stopped sharing. */
  sharing?: boolean;
  from: string;
  to?: string;
  callId?: string;
  callerName?: string;
  rejecterName?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

import { fetchIceServers, getIceServers, hasTurnConfigured } from "@/lib/ice-servers";
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
  // The share is its own track now, so it is its own tile rather than
  // something that evicts the other person's camera.
  const [remoteScreen, setRemoteScreen] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  /**
   * Whether the other side says it is sharing.
   *
   * Inferring this from the received track's `muted` flag looked reasonable
   * and is not reliable: a lane is negotiated up front, so the track exists
   * from the start, and whether it reports itself muted depends on packet
   * timing rather than on anyone's intent. The sharer knows the answer, so
   * the sharer says so.
   */
  const [peerSharing, setPeerSharing] = useState(false);
  const screenTrackByLaneRef = useRef<MediaStreamTrack | null>(null);
  const pendingLocalRef = useRef<{ mic: MediaStreamTrack | null; cam: MediaStreamTrack | null } | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  // Time in a call is what the Voice Veteran badge counts.
  useVoiceMinutes(phase === "active");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const signalRef = useRef<RealtimeChannel | null>(null);
  const listenRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const activePeerIdRef = useRef<string | null>(null);
  // Retry state: ICE-restart attempts for a failing peer connection, a grace
  // timer for transient disconnects, caller flag for renegotiation, and the
  // last peer so a dead call can be redialed manually.
  const iceRetryRef = useRef(0);
  const disconnectTimerRef = useRef<number | null>(null);
  const callerRef = useRef(false);
  const lastPeerRef = useRef<Profile | null>(null);
  const reconnectingRef = useRef(false);
  // ICE candidates routinely arrive before the offer/answer round-trip sets
  // the remote description (cross-device especially). Adding them early
  // throws InvalidStateError, so they queue here and drain once the remote
  // description lands.
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
    setRemoteStream(null);
    if (signalRef.current) {
      await signalRef.current.unsubscribe();
      signalRef.current = null;
    }
  }, []);

  const reset = useCallback(async () => {
    setPeerSharing(false);
    setRemoteScreen(null);
    setLocalScreen(null);
    stopRingtone();
    await cleanupRtc();
    if (disconnectTimerRef.current !== null) {
      window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
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
    activeCallIdRef.current = null;
    activePeerIdRef.current = null;
  }, [cleanupRtc]);

  const sendToUser = useCallback(async (targetId: string, payload: CallSignal) => {
    await broadcastOnChannel(getSupabaseClient(), `call-user:${targetId}`, "call", payload);
  }, []);

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
    try {
      await warmUpMediaDevices();
      const stream = await getDisbandUserMedia({
        audio: true,
        video: cameraRef.current ? buildVideoConstraints(planRef.current) : false,
      });
      localRef.current = stream;
      setLocalStream(stream);
      applyMic(micMuted);

      const supabase = getSupabaseClient();
      const ch = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } });
      const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() });
      pcRef.current = pc;

      const mic0 = stream.getAudioTracks()[0] ?? null;
      const cam0 = stream.getVideoTracks()[0] ?? null;
      if (asCaller) {
        ensureLanes(pc);
        await setLaneTrack(pc, LANE_AUDIO, mic0);
        await setLaneTrack(pc, LANE_CAMERA, cam0);
      } else {
        // The answering side has no lanes until the offer arrives.
        pendingLocalRef.current = { mic: mic0, cam: cam0 };
      }

      pc.ontrack = (ev) => {
        if (laneOfTransceiver(pc, ev.transceiver) === LANE_SCREEN) {
          // Hold the lane's track. Whether it is shown is decided by the
          // "screen" signal, not by the track's own mute state.
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
      callerRef.current = asCaller;
      // Caller-side renegotiation: fires after restartIce() so the re-offer
      // goes out over the still-subscribed signal channel. The callee's
      // existing `offer` handler answers renegotiations, completing the retry.
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
            /* renegotiation failed — the failed-state path below retries/resets */
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
        // At most 2 automatic ICE restarts per connection; then give up so a
        // truly dead path still ends the call instead of looping forever.
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
        try {
          pcRef.current.restartIce();
        } catch {
          giveUp("Lost the connection to the other person.");
        }
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          // Healthy again: reset the retry budget and any reconnect notice.
          clearDisconnectTimer();
          iceRetryRef.current = 0;
          if (reconnectingRef.current) {
            reconnectingRef.current = false;
            setCallNotice("Reconnected.");
            window.setTimeout(() => setCallNotice(null), 3000);
          }
          return;
        }
        if (state === "failed") {
          clearDisconnectTimer();
          retryIce();
          return;
        }
        if (state === "disconnected") {
          // Transient blips (Wi-Fi hop, brief signal loss) recover on their
          // own — only treat it as dead if it persists past a grace period.
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

      ch.on("broadcast", { event: "call" }, ({ payload }) => {
        const p = payload as CallSignal;
        if (p.from === userId || (p.to && p.to !== userId)) return;
        const addIce = async (candidate: RTCIceCandidateInit) => {
          try {
            if (!pc.remoteDescription) {
              pendingIceRef.current.push(candidate);
              return;
            }
            await pc.addIceCandidate(candidate);
          } catch {
            // Stale/duplicate candidates are normal on renegotiation — never
            // let one kill the signal handler.
          }
        };
        const drainIce = async () => {
          const queued = pendingIceRef.current;
          pendingIceRef.current = [];
          for (const candidate of queued) {
            try {
              await pc.addIceCandidate(candidate);
            } catch {
              /* drop stale entries */
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
            }
            // If we are already sharing when they connect, say so — they
            // missed the announcement that went out before they arrived.
            if (screenShareRef.current) announceSharing(true);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            setRemoteStream((prev) => streamWithoutEndedTracks(prev));
            void ch.send({ type: "broadcast", event: "call", payload: { type: "answer", from: userId, to: p.from, sdp: ans } });
          } else if (p.type === "answer" && p.sdp) {
            await pc.setRemoteDescription(p.sdp);
            await drainIce();
            setRemoteStream((prev) => streamWithoutEndedTracks(prev));
          } else if (p.type === "screen") {
            setPeerSharing(!!p.sharing);
          } else if (p.type === "ice" && p.candidate) {
            await addIce(p.candidate);
          } else if (p.type === "leave") {
            await reset();
          }
        })();
      });

      await subscribeChannel(ch);
      signalRef.current = ch;

      if (asCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await ch.send({ type: "broadcast", event: "call", payload: { type: "offer", from: userId, to: peerId, sdp: offer } });
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
    setCameraEnabled(next);
    cameraRef.current = next;
    const pc = pcRef.current;
    const stream = localRef.current;
    if (!pc || !stream || phaseRef.current !== "active") return;

    const peerId = activePeerIdRef.current;
    const existing = stream.getVideoTracks()[0];

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
    setLocalStream(new MediaStream(stream.getTracks()));
  }, [userId]);

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
      // Keep the existing camera track if re-acquisition fails.
    }
  }, [userId]);

  const prevPlanRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (plan && plan !== prevPlanRef.current) {
      prevPlanRef.current = plan;
      void reapplyCameraConstraints(plan);
    }
  }, [plan, reapplyCameraConstraints]);

  /** Tell the other side that sharing started or stopped. */
  const announceSharing = useCallback((sharing: boolean) => {
    const peerId = activePeerIdRef.current;
    if (!peerId || !signalRef.current || !userId) return;
    void signalRef.current.send({
      type: "broadcast",
      event: "call",
      payload: { type: "screen", from: userId, to: peerId, sharing } satisfies CallSignal,
    });
  }, [userId]);

  /**
   * Share without losing your camera, and without renegotiating.
   *
   * This stopped the camera, swapped the track, then sent a fresh offer
   * mid-call: the share replaced the person on the far side, and a
   * renegotiation the other end mishandled dropped the call outright. The
   * screen has its own lane now, so turning it on is a track swap on a
   * transceiver that already exists.
   */
  const toggleScreenShare = useCallback(async () => {
    const next = !screenShareRef.current;
    const pc = pcRef.current;
    if (!pc || phaseRef.current !== "active") return;

    if (!next) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      await setLaneTrack(pc, LANE_SCREEN, null);
      setLocalScreen(null);
      setScreenShareEnabled(false);
      screenShareRef.current = false;
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
      await setLaneTrack(pc, LANE_SCREEN, track);
      setLocalScreen(new MediaStream([track]));
      setScreenShareEnabled(true);
      screenShareRef.current = true;
      announceSharing(true);
    } catch {
      setScreenShareEnabled(false);
      screenShareRef.current = false;
    }
  }, []);

  const startCall = useCallback(async (peer: Profile) => {
    if (!userId || !profile) return;
    setError(null);
    void requestNotificationPermissionFromGesture();
    await warmUpMediaDevices();
    const callId = directCallId(userId, peer.id);
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
    // Best-effort VoIP push so the callee's phones ring like a real call even
    // if the app is backgrounded or killed. The call itself is the realtime
    // `ring` above; this only wakes their iOS devices.
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
    stopRingtone();
    void requestNotificationPermissionFromGesture();
    await warmUpMediaDevices();
    const supabase = getSupabaseClient();
    const { data: fp } = await supabase.from("profiles").select("*").eq("id", incoming.fromId).maybeSingle();
    if (fp) {
      setActivePeer(fp as Profile);
      lastPeerRef.current = fp as Profile;
    }
    activeCallIdRef.current = incoming.callId;
    activePeerIdRef.current = incoming.fromId;
    setPhase("active");
    setIncoming(null);
    setConnectedAt(Date.now());
    playCallConnected();
    try {
      await sendToUser(incoming.fromId, { type: "accept", from: userId, to: incoming.fromId, callId: incoming.callId });
      // Stop this account's other sessions ringing.
      void sendToUser(userId, { type: "handled", from: userId, to: userId, callId: incoming.callId });
      await setupRtc(incoming.callId, incoming.fromId, false);
    } catch {
      // setupRtc already sets error and resets
    }
  }, [incoming, userId, sendToUser, setupRtc]);

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
    // Declining on one device dismisses the ring on the rest of them.
    void sendToUser(userId, { type: "handled", from: userId, to: userId, callId: incoming.callId });
    setIncoming(null);
    setPhase("idle");
  }, [incoming, userId, profile, sendToUser]);

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

  /**
   * Manual retry: redial the last peer after a dead call. Only valid from
   * idle with no incoming call — the UI gates on `canRetryCall`.
   */
  const retryCall = useCallback(async () => {
    const peer = lastPeerRef.current;
    if (!peer || phaseRef.current !== "idle" || incoming) return;
    await startCall(peer);
  }, [incoming, startCall]);

  // Listen for incoming calls
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call-user:${userId}`, { config: { broadcast: { self: false } } });
    let cancelled = false;

    ch.on("broadcast", { event: "call" }, ({ payload }) => {
      const p = payload as CallSignal;

      // "handled" is the one signal a user sends to themselves: a ring goes to
      // `call-user:<id>`, so every session that account is signed into rings,
      // and the accept goes only to the caller. Without this the other
      // sessions keep ringing after the call has already been picked up
      // somewhere else.
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
          const { data: fp } = await supabase.from("profiles").select("*").eq("id", p.from).maybeSingle();
          setIncoming({
            fromId: p.from,
            callerName: p.callerName ?? "Someone",
            callId: p.callId,
            profile: fp as Profile | undefined,
          });
          setPhase("incoming");
          startRingtone();
          notifyUser(
            `Incoming call from ${p.callerName ?? "Someone"}`,
            "Open Disband to answer",
            { kind: "call", peerId: p.from },
          );
        } else if (p.type === "accept" && p.callId && phaseRef.current === "outgoing") {
          stopRingtone();
          setPhase("active");
          setConnectedAt(Date.now());
          playCallConnected();
          try {
            await setupRtc(p.callId, p.from, true);
          } catch {
            // setupRtc already sets error and resets
          }
        } else if (p.type === "reject") {
          if (phaseRef.current === "outgoing") {
            setCallNotice(`${p.rejecterName ?? "They"} declined your call`);
            window.setTimeout(() => setCallNotice(null), 5000);
          }
          playCallEnd();
          await reset();
        } else if (p.type === "cancel" || p.type === "leave") {
          // Treat both as "the other side is gone".
          //
          // The two can legitimately cross: if our `accept` never reached the
          // caller, they still believe the call is ringing and hang up with
          // `cancel` while we are already `active`. Keying each type to one
          // phase left us stuck in a call with nobody on the other end.
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
    // Only a share the other side has actually announced.
    remoteScreen: peerSharing ? remoteScreen : null,
    localScreen,
    cameraEnabled,
    screenShareEnabled,
    remoteAudioRef,
    error,
    callNotice,
    connectedAt,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    retryCall,
    /** True when a manual redial is possible (idle, no incoming, have a peer). */
    canRetryCall: phase === "idle" && !incoming && lastPeerRef.current !== null,
    toggleCamera,
    toggleScreenShare,
  };
}
