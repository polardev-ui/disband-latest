"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface GroupCallSignal {
  type: "ring" | "join" | "leave" | "offer" | "answer" | "ice";
  from: string;
  to?: string;
  groupId?: string;
  groupName?: string;
  callerName?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type GroupCallPhase = "idle" | "ringing" | "active";

export function useGroupCallManager(
  userId: string | null,
  profile: Profile | null,
  micMuted: boolean,
  deafened: boolean,
) {
  const [phase, setPhase] = useState<GroupCallPhase>("idle");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [incomingRing, setIncomingRing] = useState<{ groupId: string; groupName: string; fromId: string } | null>(null);

  const localRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalRef = useRef<RealtimeChannel | null>(null);
  const listenRef = useRef<RealtimeChannel | null>(null);
  const participantsRef = useRef<string[]>([]);
  const groupIdRef = useRef<string | null>(null);
  const phaseRef = useRef<GroupCallPhase>("idle");
  const cameraRef = useRef(false);

  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { groupIdRef.current = groupId; }, [groupId]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { cameraRef.current = cameraEnabled; }, [cameraEnabled]);

  useEffect(() => {
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
  }, [micMuted]);

  const sendToUser = useCallback(async (targetId: string, payload: GroupCallSignal) => {
    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call-user:${targetId}`, { config: { broadcast: { self: false } } });
    await ch.subscribe();
    await ch.send({ type: "broadcast", event: "group-call", payload });
    await ch.unsubscribe();
  }, []);

  const cleanup = useCallback(async () => {
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemoteStreams(new Map());
    if (signalRef.current) {
      await signalRef.current.unsubscribe();
      signalRef.current = null;
    }
    setParticipants([]);
    setGroupId(null);
    setGroupName("");
    setPhase("idle");
    setIncomingRing(null);
  }, []);

  const broadcast = useCallback((payload: GroupCallSignal) => {
    void signalRef.current?.send({ type: "broadcast", event: "group-call", payload });
  }, []);

  const notifyLeave = useCallback(async (peerId: string) => {
    if (!userId || !groupIdRef.current) return;
    const payload: GroupCallSignal = { type: "leave", from: userId, to: peerId, groupId: groupIdRef.current };
    broadcast(payload);
    await sendToUser(peerId, payload);
  }, [userId, broadcast, sendToUser]);

  const handlePairwiseEnd = useCallback(async (remaining: string[]) => {
    if (remaining.length === 2 && userId && remaining.includes(userId)) {
      const other = remaining.find((id) => id !== userId);
      if (other) await notifyLeave(other);
    }
  }, [userId, notifyLeave]);

  const removeParticipant = useCallback(async (peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    setParticipants((prev) => {
      const next = prev.filter((id) => id !== peerId);
      void handlePairwiseEnd(next);
      return next;
    });
  }, [handlePairwiseEnd]);

  const createPeer = useCallback(
    async (remoteId: string, initiator: boolean) => {
      if (!userId || !groupIdRef.current || remoteId === userId) return;
      if (peersRef.current.has(remoteId)) return;

      const pc = new RTCPeerConnection({ iceServers: ICE });
      peersRef.current.set(remoteId, pc);
      const local = localRef.current;
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

      pc.ontrack = (ev) => {
        if (ev.streams[0]) {
          setRemoteStreams((prev) => new Map(prev).set(remoteId, ev.streams[0]));
        }
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          broadcast({
            type: "ice",
            from: userId,
            to: remoteId,
            groupId: groupIdRef.current!,
            candidate: ev.candidate.toJSON(),
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          void removeParticipant(remoteId);
        }
      };

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        broadcast({ type: "offer", from: userId, to: remoteId, groupId: groupIdRef.current!, sdp: offer });
      }
    },
    [userId, broadcast, removeParticipant],
  );

  const handleSignal = useCallback(
    async (payload: GroupCallSignal) => {
      if (!userId || payload.from === userId) return;
      if (payload.to && payload.to !== userId) return;
      if (payload.groupId && groupIdRef.current && payload.groupId !== groupIdRef.current) return;

      if (payload.type === "leave") {
        await removeParticipant(payload.from);
        if (participantsRef.current.length <= 1 && phaseRef.current === "active") {
          await cleanup();
        }
        return;
      }

      if (phaseRef.current !== "active") return;

      let pc = peersRef.current.get(payload.from);
      if (!pc && (payload.type === "offer" || payload.type === "answer")) {
        await createPeer(payload.from, false);
        pc = peersRef.current.get(payload.from);
      }
      if (!pc) return;

      if (payload.type === "offer" && payload.sdp) {
        await pc.setRemoteDescription(payload.sdp);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        broadcast({ type: "answer", from: userId, to: payload.from, groupId: groupIdRef.current!, sdp: ans });
      } else if (payload.type === "answer" && payload.sdp) {
        await pc.setRemoteDescription(payload.sdp);
      } else if (payload.type === "ice" && payload.candidate) {
        await pc.addIceCandidate(payload.candidate);
      }
    },
    [userId, broadcast, createPeer, removeParticipant, cleanup],
  );

  const joinCallMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: cameraRef.current ? { facingMode: "user" } : false,
    });
    localRef.current = stream;
    setLocalStream(stream);
    stream.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
  }, [micMuted]);

  const subscribeGroup = useCallback(
    async (gid: string) => {
      const supabase = getSupabaseClient();
      if (signalRef.current) await signalRef.current.unsubscribe();
      const ch = supabase.channel(`group-call:${gid}`, { config: { broadcast: { self: false } } });
      ch.on("broadcast", { event: "group-call" }, ({ payload }) => {
        void handleSignal(payload as GroupCallSignal);
        const p = payload as GroupCallSignal;
        if (p.type === "join" && p.from !== userId) {
          setParticipants((prev) => (prev.includes(p.from) ? prev : [...prev, p.from]));
          if (phaseRef.current === "active" && userId) {
            void createPeer(p.from, true);
          }
        }
      }).subscribe();
      signalRef.current = ch;
    },
    [userId, handleSignal, createPeer],
  );

  const startGroupCall = useCallback(
    async (gid: string, name: string, memberIds: string[]) => {
      if (!userId || !profile) return;
      setGroupId(gid);
      setGroupName(name);
      groupIdRef.current = gid;
      setPhase("active");
      await joinCallMedia();
      await subscribeGroup(gid);
      setParticipants([userId]);
      broadcast({ type: "join", from: userId, groupId: gid, groupName: name, callerName: displayName(profile) });
      for (const mid of memberIds) {
        if (mid === userId) continue;
        void sendToUser(mid, {
          type: "ring",
          from: userId,
          groupId: gid,
          groupName: name,
          callerName: displayName(profile),
        });
      }
    },
    [userId, profile, joinCallMedia, subscribeGroup, broadcast, sendToUser],
  );

  const joinGroupCall = useCallback(
    async (gid: string, name: string) => {
      if (!userId || !profile) return;
      setIncomingRing(null);
      setGroupId(gid);
      setGroupName(name);
      groupIdRef.current = gid;
      setPhase("active");
      await joinCallMedia();
      await subscribeGroup(gid);
      setParticipants([userId]);
      broadcast({ type: "join", from: userId, groupId: gid, groupName: name, callerName: displayName(profile) });
    },
    [userId, profile, joinCallMedia, subscribeGroup, broadcast],
  );

  const endGroupCall = useCallback(async () => {
    if (!userId || !groupIdRef.current) {
      await cleanup();
      return;
    }
    const remaining = participantsRef.current.filter((id) => id !== userId);
    await handlePairwiseEnd(remaining);
    for (const pid of remaining) {
      await notifyLeave(pid);
    }
    broadcast({ type: "leave", from: userId, groupId: groupIdRef.current });
    await cleanup();
  }, [userId, handlePairwiseEnd, notifyLeave, broadcast, cleanup]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraRef.current;
    setCameraEnabled(next);
    cameraRef.current = next;
    const stream = localRef.current;
    if (!stream || phaseRef.current !== "active") return;
    const existing = stream.getVideoTracks()[0];
    if (next) {
      if (existing) { existing.enabled = true; return; }
      const cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      const track = cam.getVideoTracks()[0];
      stream.addTrack(track);
      peersRef.current.forEach((pc) => pc.addTrack(track, stream));
    } else if (existing) {
      existing.stop();
      stream.removeTrack(existing);
    }
    setLocalStream(new MediaStream(stream.getTracks()));
  }, []);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const ch = supabase.channel(`call-user:${userId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "group-call" }, ({ payload }) => {
      const p = payload as GroupCallSignal;
      if (p.from === userId) return;
      if (p.type === "ring" && p.groupId && p.groupName) {
        setIncomingRing({ groupId: p.groupId, groupName: p.groupName, fromId: p.from });
        setPhase("ringing");
      } else if (p.type === "leave" && phaseRef.current === "active" && p.from !== userId) {
        void removeParticipant(p.from);
      }
    }).subscribe();
    listenRef.current = ch;
    return () => { void ch.unsubscribe(); };
  }, [userId, removeParticipant]);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  return {
    phase,
    groupId,
    groupName,
    participants,
    localStream,
    remoteStreams,
    cameraEnabled,
    incomingRing,
    startGroupCall,
    joinGroupCall,
    endGroupCall,
    toggleCamera,
    dismissRing: () => { setIncomingRing(null); setPhase("idle"); },
  };
}
