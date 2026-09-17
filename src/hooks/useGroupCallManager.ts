"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildScreenConstraints } from "@/lib/stream-quality";
import type { SubscriptionPlan } from "@/lib/subscription";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { getDisbandUserMedia, warmUpMediaDevices } from "@/lib/media";
import { buildVideoConstraints } from "@/lib/audio-settings";
import { broadcastOnChannel, subscribeChannel } from "@/lib/realtime";
import { startRingtone, stopRingtone } from "@/lib/ringtone";
import { playCallConnected, playCallEnd, playCallJoin, playCallLeave } from "@/lib/call-sounds";
import { displayName } from "@/lib/utils";
import {
  attachRemoteTrack, createOfferForPeer, ensureLanes, laneOfTransceiver, openLanesForSending, setLaneTrack,
  LANE_AUDIO, LANE_CAMERA, LANE_SCREEN,
} from "@/lib/webrtc";
import { fetchIceServers } from "@/lib/ice-servers";
import type { Profile } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useVoiceMinutes } from "@/hooks/useVoiceMinutes";

interface SignalPayload {
  type: "ring" | "offer" | "answer" | "ice" | "leave" | "screen";

  sharing?: boolean;
  from: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface GroupCallParticipant {
  user_id: string;
  profile?: Profile;
  joined_at?: string;
}

export type GroupCallPhase = "idle" | "ringing" | "active";

export function useGroupCallManager(
  userId: string | null,
  profile: Profile | null,
  micMuted: boolean,
  deafened: boolean,
  plan?: string,
) {
  const planRef = useRef(plan);
  useEffect(() => { planRef.current = plan; }, [plan]);
  const [phase, setPhase] = useState<GroupCallPhase>("idle");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [joined, setJoined] = useState(false);
  const [presence, setPresence] = useState<GroupCallParticipant[]>([]);
  const [ringingIds, setRingingIds] = useState<Set<string>>(new Set());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const [remoteScreens, setRemoteScreens] = useState<Map<string, MediaStream>>(new Map());
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());

  const pendingLocalRef = useRef<Map<string, { mic: MediaStreamTrack | null; cam: MediaStreamTrack | null }>>(new Map());
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [incomingRing, setIncomingRing] = useState<{ groupId: string; groupName: string; fromId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  useVoiceMinutes(phase === "active");

  const localRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalRef = useRef<RealtimeChannel | null>(null);
  const listenRef = useRef<RealtimeChannel | null>(null);
  const groupIdRef = useRef<string | null>(null);
  const phaseRef = useRef<GroupCallPhase>("idle");
  const joinedRef = useRef(false);
  const cameraRef = useRef(false);
  const screenShareRef = useRef(false);
  const iceQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  useEffect(() => { groupIdRef.current = groupId; }, [groupId]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { joinedRef.current = joined; }, [joined]);
  useEffect(() => { cameraRef.current = cameraEnabled; }, [cameraEnabled]);
  useEffect(() => { screenShareRef.current = screenShareEnabled; }, [screenShareEnabled]);

  useEffect(() => {
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
  }, [micMuted]);

  const loadPresence = useCallback(async (gid: string) => {
    const supabase = getSupabaseClient();
    const { data: rows } = await supabase.from("group_call_presence").select("*").eq("group_id", gid);
    if (!rows?.length) {
      setPresence([]);
      return;
    }
    const map = await fetchProfilesByIds(supabase, rows.map((r) => r.user_id));
    setPresence(
      rows.map((r) => ({
        user_id: r.user_id,
        joined_at: r.joined_at,
        profile: map.get(r.user_id),
      })),
    );
  }, []);

  const sendToUser = useCallback(async (targetId: string, payload: Record<string, unknown>) => {
    await broadcastOnChannel(getSupabaseClient(), `call-user:${targetId}`, "group-call", payload);
  }, []);

  const broadcast = useCallback((payload: SignalPayload) => {
    void signalRef.current?.send({ type: "broadcast", event: "group-call", payload });
  }, []);

  const prevPresenceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!joined) {
      prevPresenceRef.current = new Set();
      return;
    }
    const ids = new Set(presence.map((p) => p.user_id));
    const prev = prevPresenceRef.current;
    const joinedIds = [...ids].filter((id) => !prev.has(id) && id !== userId);
    const leftIds = [...prev].filter((id) => !ids.has(id) && id !== userId);
    if (joinedIds.length > 0) playCallJoin();
    if (leftIds.length > 0) playCallLeave();
    prevPresenceRef.current = ids;
  }, [presence, joined, userId]);

  const cleanupMedia = useCallback(async () => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    iceQueueRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemoteStreams(new Map());
    if (signalRef.current) {
      await signalRef.current.unsubscribe();
      signalRef.current = null;
    }
    setJoined(false);
    setRingingIds(new Set());
    setConnectedAt(null);
    stopRingtone();
  }, []);

  const cleanup = useCallback(async () => {
    const gid = groupIdRef.current;
    const uid = userId;
    if (gid && uid && joinedRef.current) {
      const supabase = getSupabaseClient();
      await supabase.from("group_call_presence").delete().eq("group_id", gid).eq("user_id", uid);
      broadcast({ type: "leave", from: uid });
    }
    await cleanupMedia();
    setPhase("idle");
    setGroupId(null);
    setGroupName("");
    setIncomingRing(null);
    if (gid) await loadPresence(gid);
  }, [userId, broadcast, cleanupMedia, loadPresence]);

  const flushIce = useCallback(async (remoteId: string, pc: RTCPeerConnection) => {
    const queued = iceQueueRef.current.get(remoteId) ?? [];
    iceQueueRef.current.delete(remoteId);
    for (const c of queued) {
      await pc.addIceCandidate(c);
    }
  }, []);

  const createPeer = useCallback(
    async (remoteId: string, initiator: boolean) => {
      if (!userId || !groupIdRef.current || remoteId === userId) return;
      if (peersRef.current.has(remoteId)) return;

      const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() });
      peersRef.current.set(remoteId, pc);

      if (initiator) ensureLanes(pc);

      const local = localRef.current;
      if (local) {
        const mic = local.getAudioTracks()[0] ?? null;
        const cam = local.getVideoTracks()[0] ?? null;
        if (initiator) {
          await setLaneTrack(pc, LANE_AUDIO, mic);
          await setLaneTrack(pc, LANE_CAMERA, cam);
          await setLaneTrack(pc, LANE_SCREEN, screenTrackRef.current);
        } else {

          pendingLocalRef.current.set(remoteId, { mic, cam });
        }
      }

      pc.ontrack = (ev) => {
        const track = ev.track;
        const lane = laneOfTransceiver(pc, ev.transceiver);
        const sync = () => {
          if (lane === LANE_SCREEN) {

            setRemoteScreens((prev) => new Map(prev).set(remoteId, new MediaStream([track])));
            return;
          }
          setRemoteStreams((prev) => attachRemoteTrack(prev, remoteId, track, ev.streams[0]));
        };
        track.addEventListener("ended", sync);
        track.addEventListener("mute", sync);
        track.addEventListener("unmute", sync);
        sync();
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          broadcast({ type: "ice", from: userId, to: remoteId, candidate: ev.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          pc.close();
          peersRef.current.delete(remoteId);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(remoteId);
            return next;
          });
          setRemoteScreens((prev) => {
            const next = new Map(prev);
            next.delete(remoteId);
            return next;
          });
        }
      };

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        broadcast({ type: "offer", from: userId, to: remoteId, sdp: offer });
      }
    },
    [userId, broadcast],
  );

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (!userId || payload.from === userId) return;
      if (payload.to && payload.to !== userId) return;
      if (!joinedRef.current) return;

      if (payload.type === "leave") {
        const pc = peersRef.current.get(payload.from);
        pc?.close();
        peersRef.current.delete(payload.from);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(payload.from);
          return next;
        });

        if (peersRef.current.size === 0 && joinedRef.current) {
          await cleanup();
        }
        return;
      }

      let pc = peersRef.current.get(payload.from);
      if (!pc && (payload.type === "offer" || payload.type === "answer")) {
        await createPeer(payload.from, false);
        pc = peersRef.current.get(payload.from);
      }
      if (!pc) return;

      if (payload.type === "offer" && payload.sdp) {
        await pc.setRemoteDescription(payload.sdp);
        openLanesForSending(pc);

        const pending = pendingLocalRef.current.get(payload.from);
        if (pending) {
          pendingLocalRef.current.delete(payload.from);
          await setLaneTrack(pc, LANE_AUDIO, pending.mic);
          await setLaneTrack(pc, LANE_CAMERA, pending.cam);
          await setLaneTrack(pc, LANE_SCREEN, screenTrackRef.current);
        }
        await flushIce(payload.from, pc);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        broadcast({ type: "answer", from: userId, to: payload.from, sdp: ans });
      } else if (payload.type === "answer" && payload.sdp) {
        await pc.setRemoteDescription(payload.sdp);
        await flushIce(payload.from, pc);
      } else if (payload.type === "screen") {
        setSharingIds((prev) => {
          const next = new Set(prev);
          if (payload.sharing) next.add(payload.from);
          else next.delete(payload.from);
          return next;
        });
      } else if (payload.type === "ice" && payload.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate);
        } else {
          const q = iceQueueRef.current.get(payload.from) ?? [];
          q.push(payload.candidate);
          iceQueueRef.current.set(payload.from, q);
        }
      }
    },
    [userId, broadcast, createPeer, flushIce, cleanup],
  );

  const subscribeSignal = useCallback(
    async (gid: string) => {
      const supabase = getSupabaseClient();
      if (signalRef.current) {
        await signalRef.current.unsubscribe();
        signalRef.current = null;
      }
      const ch = supabase.channel(`group-call:${gid}`, { config: { broadcast: { self: false } } });
      ch.on("broadcast", { event: "group-call" }, ({ payload }) => {
        void handleSignal(payload as SignalPayload);
      });
      signalRef.current = await subscribeChannel(ch);
    },
    [handleSignal],
  );

  const joinCallMedia = useCallback(async () => {
    await warmUpMediaDevices();
    const stream = await getDisbandUserMedia({
      audio: true,
      video: cameraRef.current ? buildVideoConstraints(planRef.current) : false,
    });
    localRef.current = stream;
    setLocalStream(stream);
    stream.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
  }, [micMuted]);

  const connectToExisting = useCallback(
    async (others: GroupCallParticipant[]) => {
      if (!userId) return;
      for (const p of others) {
        if (p.user_id !== userId) await createPeer(p.user_id, true);
      }
    },
    [userId, createPeer],
  );

  const joinGroupCall = useCallback(
    async (gid: string, name: string) => {
      if (!userId || !profile) return;
      setError(null);
      setIncomingRing(null);
      stopRingtone();
      setGroupId(gid);
      setGroupName(name);
      groupIdRef.current = gid;
      setPhase("active");

      try {
        await joinCallMedia();
        await subscribeSignal(gid);
        const supabase = getSupabaseClient();
        await supabase.from("group_call_presence").upsert({ group_id: gid, user_id: userId });
        setJoined(true);
        setConnectedAt(Date.now());
        playCallConnected();
        const { data: rows } = await supabase.from("group_call_presence").select("*").eq("group_id", gid);
        const profileMap = await fetchProfilesByIds(supabase, (rows ?? []).map((r) => r.user_id));
        const loaded: GroupCallParticipant[] = (rows ?? []).map((r) => ({
          user_id: r.user_id,
          joined_at: r.joined_at,
          profile: profileMap.get(r.user_id),
        }));
        setPresence(loaded);
        await connectToExisting(loaded.filter((p) => p.user_id !== userId));
      } catch (e) {
        setError((e as Error).message);
        await cleanup();
      }
    },
    [userId, profile, joinCallMedia, subscribeSignal, connectToExisting, cleanup],
  );

  const startGroupCall = useCallback(
    async (gid: string, name: string, memberIds: string[]) => {
      if (!userId || !profile) return;
      await joinGroupCall(gid, name);
      const supabase = getSupabaseClient();
      const { data: rows } = await supabase.from("group_call_presence").select("user_id").eq("group_id", gid);
      const inCall = new Set((rows ?? []).map((r) => r.user_id));
      const toRing = memberIds.filter((id) => id !== userId && !inCall.has(id));
      setRingingIds(new Set(toRing));
      for (const mid of toRing) {
        void sendToUser(mid, {
          type: "ring",
          from: userId,
          groupId: gid,
          groupName: name,
          callerName: displayName(profile),
        });
      }
      window.setTimeout(() => setRingingIds(new Set()), 30000);
    },
    [userId, profile, joinGroupCall, sendToUser],
  );

  const watchGroup = useCallback(
    async (gid: string | null, name = "") => {
      if (!gid) {
        if (!joinedRef.current) {
          setGroupId(null);
          setGroupName("");
          setPresence([]);
          setPhase("idle");
        }
        return;
      }
      if (!joinedRef.current) {
        setGroupId(gid);
        setGroupName(name);
        setPhase("idle");
      }
      await loadPresence(gid);
    },
    [loadPresence],
  );

  const renegotiatePeer = useCallback(
    async (remoteId: string, pc: RTCPeerConnection) => {
      const offer = await createOfferForPeer(pc);
      broadcast({ type: "offer", from: userId!, to: remoteId, sdp: offer });
    },
    [userId, broadcast],
  );

  const endGroupCall = useCallback(async () => {
    playCallEnd();
    await cleanup();
  }, [cleanup]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraRef.current;
    setCameraEnabled(next);
    cameraRef.current = next;
    const stream = localRef.current;
    if (!stream || !joinedRef.current) return;

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
      for (const pc of peersRef.current.values()) {
        await setLaneTrack(pc, LANE_CAMERA, track);
      }
    } else if (existing) {
      existing.stop();
      stream.removeTrack(existing);
      for (const pc of peersRef.current.values()) {
        await setLaneTrack(pc, LANE_CAMERA, null);
      }
    }
    setLocalStream(new MediaStream(stream.getTracks()));
  }, []);

  const reapplyCameraConstraints = useCallback(async (nextPlan: string | undefined) => {
    const stream = localRef.current;
    if (!stream || !joinedRef.current || !cameraRef.current) return;
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
      for (const pc of peersRef.current.values()) {
        await setLaneTrack(pc, LANE_CAMERA, track);
      }
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch {

    }
  }, []);

  const prevPlanRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (plan && plan !== prevPlanRef.current) {
      prevPlanRef.current = plan;
      void reapplyCameraConstraints(plan);
    }
  }, [plan, reapplyCameraConstraints]);

  const toggleScreenShare = useCallback(async () => {
    const next = !screenShareRef.current;

    if (!next) {
      const track = screenTrackRef.current;
      if (track) {
        track.stop();
        screenTrackRef.current = null;
      }
      for (const pc of peersRef.current.values()) {
        await setLaneTrack(pc, LANE_SCREEN, null);
      }
      setLocalScreen(null);
      setScreenShareEnabled(false);
      screenShareRef.current = false;
      broadcast({ type: "screen", from: userId ?? "", sharing: false });
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia(
        buildScreenConstraints((planRef.current ?? "free") as SubscriptionPlan),
      );
      const track = display.getVideoTracks()[0];

      track.addEventListener("ended", () => { void toggleScreenShare(); });
      screenTrackRef.current = track;
      for (const pc of peersRef.current.values()) {
        await setLaneTrack(pc, LANE_SCREEN, track);
      }
      setLocalScreen(new MediaStream([track]));
      setScreenShareEnabled(true);
      screenShareRef.current = true;
      broadcast({ type: "screen", from: userId ?? "", sharing: true });
    } catch {
      setScreenShareEnabled(false);
      screenShareRef.current = false;
    }
  }, [broadcast, userId]);

  const dismissRing = useCallback(() => {
    stopRingtone();
    setIncomingRing(null);
    if (phaseRef.current === "ringing") setPhase("idle");
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call-user:${userId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "group-call" }, ({ payload }) => {
      const p = payload as { type?: string; from?: string; groupId?: string; groupName?: string };
      if (p.from === userId || !p.groupId || !p.groupName) return;
      if (p.type === "ring" && phaseRef.current !== "active") {
        setIncomingRing({ groupId: p.groupId, groupName: p.groupName, fromId: p.from! });
        setPhase("ringing");
        startRingtone();
      }
    });

    void subscribeChannel(ch)
      .then((subscribed) => {
        if (!cancelled) listenRef.current = subscribed;
        else void subscribed.unsubscribe();
      })
      .catch(() => {
        if (!cancelled) setError("Could not connect group call signaling");
      });

    return () => {
      cancelled = true;
      void ch.unsubscribe();
      listenRef.current = null;
    };
  }, [userId]);

  useEffect(() => {
    if (!groupId) return;
    void loadPresence(groupId);
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`gc-presence:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_call_presence", filter: `group_id=eq.${groupId}` },
        () => void loadPresence(groupId),
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [groupId, loadPresence]);

  useEffect(() => {
    if (!joined || !userId) return;
    presence.forEach((p) => {
      if (p.user_id !== userId && !peersRef.current.has(p.user_id)) {
        void createPeer(p.user_id, true);
      }
    });
  }, [presence, joined, userId, createPeer]);

  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  useEffect(() => () => { void cleanupRef.current(); }, []);

  const inCallUserIds = new Set(presence.map((p) => p.user_id));
  const selfInCall = userId ? inCallUserIds.has(userId) : false;

  return {
    phase,
    groupId,
    groupName,
    joined,
    selfInCall,
    presence,
    inCallUserIds,
    ringingIds,
    localStream,
    remoteStreams,

    remoteScreens: new Map([...remoteScreens].filter(([id]) => sharingIds.has(id))),
    localScreen,
    cameraEnabled,
    screenShareEnabled,
    incomingRing,
    error,
    connectedAt,
    loadPresence,
    watchGroup,
    startGroupCall,
    joinGroupCall,
    endGroupCall,
    toggleCamera,
    toggleScreenShare,
    dismissRing,
  };
};
