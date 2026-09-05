"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDisbandUserMedia } from "@/lib/media";
import { playCallConnected, playCallJoin, playCallLeave } from "@/lib/call-sounds";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import type { Profile, VoicePresence } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { fetchIceServers } from "@/lib/ice-servers";

interface SignalPayload {
  type: "offer" | "answer" | "ice" | "leave";
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}


export function useVoiceChannel(
  channelId: string | null,
  userId: string | null,
  profile: Profile | null,
  micMuted: boolean,
  deafened: boolean,
) {
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<(VoicePresence & { profile?: Profile })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalRef = useRef<RealtimeChannel | null>(null);
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

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

  // Diff presence so join/leave blips only fire for *other* people.
  const prevPresenceRef = useRef<Set<string>>(new Set());
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

  const loadPresence = useCallback(async () => {
    if (!channelId) return;
    const supabase = getSupabaseClient();
    const { data: rows } = await supabase.from("voice_presence").select("*").eq("channel_id", channelId);
    if (!rows?.length) {
      setParticipants([]);
      return;
    }
    const map = await fetchProfilesByIds(supabase, rows.map((r) => r.user_id));
    setParticipants(rows.map((r) => ({ ...r, profile: map.get(r.user_id) })));
  }, [channelId]);

  const createPeer = useCallback(
    async (remoteId: string, initiator: boolean) => {
      if (!userId || !channelId || remoteId === userId) return;
      if (peersRef.current.has(remoteId)) return;

      // Voice channels used a hardcoded STUN-only list, so they could not
      // connect across strict NATs at all. They share the relay now.
      const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() });
      peersRef.current.set(remoteId, pc);

      const local = localStreamRef.current;
      if (local) {
        local.getTracks().forEach((t) => pc.addTrack(t, local));
      }

      pc.ontrack = (ev) => {
        const stream = ev.streams[0];
        if (!stream) return;
        setRemoteStreams((prev) => new Map(prev).set(remoteId, stream));
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

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalRef.current?.send({
          type: "broadcast",
          event: "signal",
          payload: {
            type: "offer",
            from: userId,
            to: remoteId,
            sdp: offer,
          } satisfies SignalPayload,
        });
      }
    },
    [channelId, userId],
  );

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (!userId || payload.from === userId) return;
      if (payload.to && payload.to !== userId) return;

      let pc = peersRef.current.get(payload.from);
      if (!pc && (payload.type === "offer" || payload.type === "answer")) {
        await createPeer(payload.from, false);
        pc = peersRef.current.get(payload.from);
      }
      if (!pc) return;

      if (payload.type === "offer" && payload.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
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
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.type === "ice" && payload.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else if (payload.type === "leave") {
        pc.close();
        peersRef.current.delete(payload.from);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(payload.from);
          return next;
        });
      }
    },
    [createPeer, userId],
  );

  const cleanup = useCallback(async () => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setRemoteStreams(new Map());
    audioRefsRef.current.clear();

    if (signalRef.current) {
      await signalRef.current.unsubscribe();
      signalRef.current = null;
    }

    if (channelId && userId) {
      const supabase = getSupabaseClient();
      await supabase.from("voice_presence").delete().eq("channel_id", channelId).eq("user_id", userId);
    }
    setJoined(false);
  }, [channelId, userId]);

  const join = useCallback(async () => {
    if (!channelId || !userId) return;
    setError(null);
    try {
      const stream = await getDisbandUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      const supabase = getSupabaseClient();
      await supabase.from("voice_presence").upsert({
        channel_id: channelId,
        user_id: userId,
        muted: micMuted,
        deafened,
      });

      const ch = supabase.channel(`voice:${channelId}`, {
        config: { broadcast: { self: false } },
      });

      ch.on("broadcast", { event: "signal" }, ({ payload }) => {
        void handleSignal(payload as SignalPayload);
      }).subscribe();

      signalRef.current = ch;
      setJoined(true);
      playCallConnected();
      await loadPresence();

      // Connect to existing participants
      const others = participants.filter((p) => p.user_id !== userId);
      for (const p of others) {
        await createPeer(p.user_id, true);
      }
    } catch (e) {
      setError((e as Error).message || "Could not access microphone");
      await cleanup();
    }
  }, [channelId, userId, cleanup, createPeer, handleSignal, loadPresence, participants, micMuted, deafened]);

  const leave = useCallback(async () => {
    if (userId && signalRef.current) {
      await signalRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "leave", from: userId } satisfies SignalPayload,
      });
    }
    await cleanup();
    await loadPresence();
  }, [cleanup, loadPresence, userId]);

  // Subscribe to presence changes
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

  // When new participant joins while we're in VC, initiate connection
  useEffect(() => {
    if (!joined || !userId) return;
    participants.forEach((p) => {
      if (p.user_id !== userId && !peersRef.current.has(p.user_id)) {
        void createPeer(p.user_id, true);
      }
    });
  }, [participants, joined, userId, createPeer]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  return {
    joined,
    participants,
    remoteStreams,
    error,
    join,
    leave,
    localStream: localStreamRef.current,
    profile,
  };
}
