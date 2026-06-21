"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface SignalPayload {
  type: "offer" | "answer" | "ice" | "leave";
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/** 1:1 voice call signaling (DM or friend call) — no voice_presence table. */
export function useDirectCall(localUserId: string | null, remoteUserId: string | null, callId: string | null) {
  const [active, setActive] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const signalRef = useRef<RealtimeChannel | null>(null);

  const cleanup = useCallback(async () => {
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setRemoteStream(null);
    setActive(false);
    if (signalRef.current) {
      await signalRef.current.unsubscribe();
      signalRef.current = null;
    }
  }, []);

  const startCall = useCallback(async () => {
    if (!localUserId || !remoteUserId || !callId) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localRef.current = stream;
      const supabase = getSupabaseClient();
      const ch = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } });

      const pc = new RTCPeerConnection({ iceServers: ICE });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => { if (ev.streams[0]) setRemoteStream(ev.streams[0]); };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void ch.send({ type: "broadcast", event: "signal", payload: { type: "ice", from: localUserId, to: remoteUserId, candidate: ev.candidate.toJSON() } satisfies SignalPayload });
        }
      };

      ch.on("broadcast", { event: "signal" }, ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.from === localUserId || (p.to && p.to !== localUserId)) return;
        void (async () => {
          if (p.type === "offer" && p.sdp) {
            await pc.setRemoteDescription(p.sdp);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            void ch.send({ type: "broadcast", event: "signal", payload: { type: "answer", from: localUserId, to: p.from, sdp: ans } });
          } else if (p.type === "answer" && p.sdp) {
            await pc.setRemoteDescription(p.sdp);
          } else if (p.type === "ice" && p.candidate) {
            await pc.addIceCandidate(p.candidate);
          } else if (p.type === "leave") {
            void cleanup();
          }
        })();
      }).subscribe();

      signalRef.current = ch;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      void ch.send({ type: "broadcast", event: "signal", payload: { type: "offer", from: localUserId, to: remoteUserId, sdp: offer } });
      setActive(true);
    } catch (e) {
      setError((e as Error).message);
      await cleanup();
    }
  }, [localUserId, remoteUserId, callId, cleanup]);

  const endCall = useCallback(async () => {
    if (signalRef.current && localUserId) {
      await signalRef.current.send({ type: "broadcast", event: "signal", payload: { type: "leave", from: localUserId } });
    }
    await cleanup();
  }, [cleanup, localUserId]);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  return { active, remoteStream, error, startCall, endCall, localStream: localRef.current };
}
