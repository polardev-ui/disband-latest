"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildScreenConstraints } from "@/lib/stream-quality";
import type { SubscriptionPlan } from "@/lib/subscription";
import {
  ensureLanes, laneOfTransceiver, openLanesForSending, setLaneTrack, LANE_AUDIO, LANE_CAMERA, LANE_SCREEN,
} from "@/lib/webrtc";
import { getDisbandUserMedia } from "@/lib/media";
import { playCallConnected, playCallJoin, playCallLeave } from "@/lib/call-sounds";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import type { Profile, VoicePresence } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { fetchIceServers } from "@/lib/ice-servers";
import { useVoiceMinutes } from "@/hooks/useVoiceMinutes";

interface SignalPayload {
  type: "offer" | "answer" | "ice" | "leave" | "screen";
  /** For "screen": whether the sender just started or stopped sharing. */
  sharing?: boolean;
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
  /** Decides how high the screen share may go; sharing itself is free. */
  plan: SubscriptionPlan = "free",
) {
  const [joined, setJoined] = useState(false);
  // Server voice counts toward Voice Veteran too, not just DM calls.
  useVoiceMinutes(joined);
  const [participants, setParticipants] = useState<(VoicePresence & { profile?: Profile })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  // Server voice used to be audio only. Camera and screen each get their own
  // lane, so a share never costs someone their camera and both can be seen.
  const [remoteScreens, setRemoteScreens] = useState<Map<string, MediaStream>>(new Map());
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  /** Who has announced a share. Track mute state is not a reliable signal. */
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());
  const pendingLocalRef = useRef<Map<string, MediaStreamTrack | null>>(new Map());
  const planRef = useRef<SubscriptionPlan>(plan);
  useEffect(() => { planRef.current = plan; }, [plan]);

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
    const { data: rows } = await supabase
      .from("voice_presence_live")
      .select("*")
      .eq("channel_id", channelId);
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
        const mic = local.getAudioTracks()[0] ?? null;
        if (initiator) {
          ensureLanes(pc);
          await setLaneTrack(pc, LANE_AUDIO, mic);
          await setLaneTrack(pc, LANE_CAMERA, cameraTrackRef.current);
          await setLaneTrack(pc, LANE_SCREEN, screenTrackRef.current);
        } else {
          // The answering side has no lanes until the offer arrives.
          pendingLocalRef.current.set(remoteId, mic);
        }
      }

      pc.ontrack = (ev) => {
        const track = ev.track;
        const lane = laneOfTransceiver(pc, ev.transceiver);
        const sync = () => {
          if (lane === LANE_SCREEN) {
            // Keep the track; the "screen" signal decides whether it shows.
            setRemoteScreens((prev) => new Map(prev).set(remoteId, new MediaStream([track])));
            return;
          }
          const stream = ev.streams[0];
          if (stream) setRemoteStreams((prev) => new Map(prev).set(remoteId, stream));
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

      if (initiator) {
        ensureLanes(pc);
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
        // Lanes exist now. Declare them two-way before answering, then put
        // this side's tracks in — otherwise the screen lane is answered
        // recvonly and a later share is never sent.
        openLanesForSending(pc);
        if (pendingLocalRef.current.has(payload.from)) {
          const mic = pendingLocalRef.current.get(payload.from) ?? null;
          pendingLocalRef.current.delete(payload.from);
          await setLaneTrack(pc, LANE_AUDIO, mic);
          await setLaneTrack(pc, LANE_CAMERA, cameraTrackRef.current);
          await setLaneTrack(pc, LANE_SCREEN, screenTrackRef.current);
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
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.type === "screen") {
        setSharingIds((prev) => {
          const next = new Set(prev);
          if (payload.sharing) next.add(payload.from);
          else next.delete(payload.from);
          return next;
        });
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

  /**
   * Keep this client's presence row alive.
   *
   * Without it a row outlives the session that made it: a closed tab or a
   * refresh leaves no chance to delete it, and the channel goes on showing
   * someone who left. The prune job removes anything that stops answering.
   */
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

  /** Turn your camera on or off. Uses the camera lane, so a share is unaffected. */
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

  /** Tell the channel that sharing started or stopped. */
  const announceSharing = useCallback((sharing: boolean) => {
    if (!userId) return;
    void signalRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "screen", from: userId, sharing } satisfies SignalPayload,
    });
  }, [userId]);

  /** Share your screen without giving up your camera. */
  const toggleScreenShare = useCallback(async () => {
    const next = !screenTrackRef.current;
    if (!next) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      for (const pc of peersRef.current.values()) await setLaneTrack(pc, LANE_SCREEN, null);
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
      for (const pc of peersRef.current.values()) await setLaneTrack(pc, LANE_SCREEN, track);
      setLocalScreen(new MediaStream([track]));
      setScreenEnabled(true);
      announceSharing(true);
    } catch {
      setScreenEnabled(false);
    }
  }, [announceSharing]);

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
    remoteScreens: new Map([...remoteScreens].filter(([id]) => sharingIds.has(id))),
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
