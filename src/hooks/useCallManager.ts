"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { directCallId, startRingtone, stopRingtone } from "@/lib/ringtone";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallPhase = "idle" | "outgoing" | "incoming" | "active";

interface CallSignal {
  type: "ring" | "accept" | "reject" | "cancel" | "offer" | "answer" | "ice" | "leave";
  from: string;
  to?: string;
  callId?: string;
  callerName?: string;
  rejecterName?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

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
) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [incoming, setIncoming] = useState<IncomingCallInfo | null>(null);
  const [activePeer, setActivePeer] = useState<Profile | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const signalRef = useRef<RealtimeChannel | null>(null);
  const listenRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const activePeerIdRef = useRef<string | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const applyMic = useCallback((muted: boolean) => {
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }, []);

  const applyDeafen = useCallback((deaf: boolean) => {
    if (remoteAudioRef.current) remoteAudioRef.current.muted = deaf;
  }, []);

  useEffect(() => { applyMic(micMuted); }, [micMuted, applyMic]);
  useEffect(() => { applyDeafen(deafened); }, [deafened, applyDeafen]);

  const cleanupRtc = useCallback(async () => {
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setRemoteStream(null);
    if (signalRef.current) {
      await signalRef.current.unsubscribe();
      signalRef.current = null;
    }
  }, []);

  const reset = useCallback(async () => {
    stopRingtone();
    await cleanupRtc();
    setPhase("idle");
    setIncoming(null);
    setActivePeer(null);
    setError(null);
    activeCallIdRef.current = null;
    activePeerIdRef.current = null;
  }, [cleanupRtc]);

  const sendToUser = useCallback(async (targetId: string, payload: CallSignal) => {
    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call-user:${targetId}`, { config: { broadcast: { self: false } } });
    await ch.subscribe();
    await ch.send({ type: "broadcast", event: "call", payload });
    await ch.unsubscribe();
  }, []);

  const setupRtc = useCallback(async (callId: string, peerId: string, asCaller: boolean) => {
    if (!userId) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localRef.current = stream;
    applyMic(micMuted);

    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } });
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (ev) => {
      if (ev.streams[0]) setRemoteStream(ev.streams[0]);
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

    ch.on("broadcast", { event: "call" }, ({ payload }) => {
      const p = payload as CallSignal;
      if (p.from === userId || (p.to && p.to !== userId)) return;
      void (async () => {
        if (p.type === "offer" && p.sdp) {
          await pc.setRemoteDescription(p.sdp);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          void ch.send({ type: "broadcast", event: "call", payload: { type: "answer", from: userId, to: p.from, sdp: ans } });
        } else if (p.type === "answer" && p.sdp) {
          await pc.setRemoteDescription(p.sdp);
        } else if (p.type === "ice" && p.candidate) {
          await pc.addIceCandidate(p.candidate);
        } else if (p.type === "leave") {
          await reset();
        }
      })();
    }).subscribe();

    signalRef.current = ch;

    if (asCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      void ch.send({ type: "broadcast", event: "call", payload: { type: "offer", from: userId, to: peerId, sdp: offer } });
    }
  }, [userId, micMuted, applyMic, reset]);

  const startCall = useCallback(async (peer: Profile) => {
    if (!userId || !profile) return;
    setError(null);
    const callId = directCallId(userId, peer.id);
    activeCallIdRef.current = callId;
    activePeerIdRef.current = peer.id;
    setActivePeer(peer);
    setPhase("outgoing");
    await sendToUser(peer.id, {
      type: "ring",
      from: userId,
      to: peer.id,
      callId,
      callerName: displayName(profile),
    });
  }, [userId, profile, sendToUser]);

  const acceptCall = useCallback(async () => {
    if (!incoming || !userId) return;
    stopRingtone();
    const supabase = getSupabaseClient();
    const { data: fp } = await supabase.from("profiles").select("*").eq("id", incoming.fromId).maybeSingle();
    if (fp) setActivePeer(fp as Profile);
    activeCallIdRef.current = incoming.callId;
    activePeerIdRef.current = incoming.fromId;
    setPhase("active");
    setIncoming(null);
    await sendToUser(incoming.fromId, { type: "accept", from: userId, to: incoming.fromId, callId: incoming.callId });
    await setupRtc(incoming.callId, incoming.fromId, false);
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
      } else if (signalRef.current) {
        await signalRef.current.send({ type: "broadcast", event: "call", payload: { type: "leave", from: userId } });
      }
    }
    await reset();
  }, [userId, sendToUser, reset]);

  // Listen for incoming calls
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call-user:${userId}`, { config: { broadcast: { self: false } } });

    ch.on("broadcast", { event: "call" }, ({ payload }) => {
      const p = payload as CallSignal;
      if (p.from === userId) return;

      void (async () => {
        if (p.type === "ring" && p.callId) {
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
        } else if (p.type === "accept" && p.callId && phaseRef.current === "outgoing") {
          stopRingtone();
          setPhase("active");
          await setupRtc(p.callId, p.from, true);
        } else if (p.type === "reject") {
          if (phaseRef.current === "outgoing") {
            setCallNotice(`${p.rejecterName ?? "They"} declined your call`);
            window.setTimeout(() => setCallNotice(null), 5000);
          }
          await reset();
        } else if (p.type === "cancel") {
          if (phaseRef.current === "incoming") await reset();
          else if (phaseRef.current === "outgoing") await reset();
        }
      })();
    }).subscribe();

    listenRef.current = ch;
    return () => { void ch.unsubscribe(); };
  }, [userId, profile, sendToUser, setupRtc, reset]);

  useEffect(() => () => { void reset(); }, [reset]);

  return {
    phase,
    incoming,
    activePeer,
    remoteStream,
    remoteAudioRef,
    error,
    callNotice,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
