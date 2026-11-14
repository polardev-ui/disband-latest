"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { applyParticipantAudioControls } from "@/lib/call-participant-settings";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import type { Profile } from "@/lib/supabase/types";

interface VoiceSession {

  connectedChannelId: string | null;
  connectedChannelName: string | null;
  joined: boolean;
  participants: ReturnType<typeof useVoiceChannel>["participants"];
  connectedPeerIds: Set<string>;
  error: string | null;

  remoteStreams: Map<string, MediaStream>;
  remoteScreens: Map<string, MediaStream>;
  /** A sharer's screen sound, kept on its own lane from their mic. */
  remoteScreenAudio: Map<string, MediaStream>;
  localScreen: MediaStream | null;
  localStream: MediaStream | null;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  connect: (channelId: string, channelName: string) => Promise<void>;
  disconnect: () => Promise<void>;

  peek: (channelId: string) => void;
  /** The connected channel is a stage. */
  isStage: boolean;
  /** On a stage: whether I'm a speaker (otherwise I'm in the audience, muted). */
  isStageSpeaker: boolean;
}

const Ctx = createContext<VoiceSession | null>(null);

export function useVoiceSession(): VoiceSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoiceSession requires VoiceSessionProvider");
  return v;
}

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const {
    profile, user, micMuted, deafened, setVoiceJoinedChannelId, loadVoicePresence, subscriptionPlan, channels,
  } = useApp();

  const [connectedChannelId, setConnectedChannelId] = useState<string | null>(null);
  const [connectedChannelName, setConnectedChannelName] = useState<string | null>(null);

  // Whether the connected channel is a stage. Kept once known: browsing
  // another space swaps `channels` out from under a call still running.
  const [isStage, setIsStage] = useState(false);
  useEffect(() => {
    if (!connectedChannelId) {
      setIsStage(false);
      return;
    }
    const ch = channels.find((c) => c.id === connectedChannelId);
    if (ch) setIsStage(!!ch.is_stage);
  }, [connectedChannelId, channels]);
  // Everyone joins a stage in the audience, muted, until they're brought up.
  const [isStageSpeaker, setIsStageSpeaker] = useState(false);

  const voice = useVoiceChannel(
    connectedChannelId,
    user?.id ?? null,
    profile as Profile | null,
    micMuted || (isStage && !isStageSpeaker),
    deafened,
    // The real plan (subscription or gift). profile.subscription_plan isn't
    // a column, so voice channels capped every share at the free 720p/30.
    subscriptionPlan,
    isStage,
  );

  useEffect(() => {
    const me = voice.participants.find((p) => p.user_id === user?.id);
    setIsStageSpeaker(!!me?.stage_speaker);
  }, [voice.participants, user?.id]);

  // Moved back to the audience: camera and screen go off with the mic.
  const { cameraEnabled, screenEnabled, toggleCamera, toggleScreenShare } = voice;
  useEffect(() => {
    if (!isStage || isStageSpeaker) return;
    if (cameraEnabled) void toggleCamera().catch(() => {});
    if (screenEnabled) void toggleScreenShare().catch(() => {});
  }, [isStage, isStageSpeaker, cameraEnabled, screenEnabled, toggleCamera, toggleScreenShare]);

  // On a stage only speakers are played (covers older apps on direct links,
  // which the voice server's speaker-only rule can't reach).
  const speakerIds = useMemo(
    () => new Set(voice.participants.filter((p) => p.stage_speaker).map((p) => p.user_id)),
    [voice.participants],
  );

  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    audioRefs.current.forEach((el) => { el.muted = deafened; });
  }, [deafened]);

  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;
  useEffect(() => {
    const sync = () => {
      audioRefs.current.forEach((el, uid) => {
        applyParticipantAudioControls(el, uid);
        if (deafenedRef.current) el.muted = true;
      });
    };
    window.addEventListener("disband:participant-controls", sync);
    return () => window.removeEventListener("disband:participant-controls", sync);
  }, []);

  useEffect(() => {
    setVoiceJoinedChannelId(voice.joined ? connectedChannelId : null);
  }, [voice.joined, connectedChannelId, setVoiceJoinedChannelId]);

  const connect = useCallback(async (channelId: string, channelName: string) => {
    setConnectedChannelId(channelId);
    setConnectedChannelName(channelName);

    await Promise.resolve();
  }, []);

  const disconnect = useCallback(async () => {
    await voice.leave();
    setConnectedChannelId(null);
    setConnectedChannelName(null);
  }, [voice]);

  const peek = useCallback((channelId: string) => {
    void loadVoicePresence(channelId);
  }, [loadVoicePresence]);

  const wantJoinRef = useRef(false);
  const connectAndJoin = useCallback(async (channelId: string, channelName: string) => {
    wantJoinRef.current = true;
    await connect(channelId, channelName);
  }, [connect]);

  useEffect(() => {
    if (!wantJoinRef.current || !connectedChannelId || voice.joined) return;
    wantJoinRef.current = false;
    void voice.join();
  }, [connectedChannelId, voice]);

  const value = useMemo<VoiceSession>(() => ({
    connectedChannelId,
    connectedChannelName,
    joined: voice.joined,
    participants: voice.participants,
    connectedPeerIds: voice.connectedPeerIds,
    error: voice.error,
    remoteStreams: voice.remoteStreams,
    remoteScreens: voice.remoteScreens,
    remoteScreenAudio: voice.remoteScreenAudio,
    localScreen: voice.localScreen,
    localStream: voice.localStream,
    cameraEnabled: voice.cameraEnabled,
    screenEnabled: voice.screenEnabled,
    toggleCamera: voice.toggleCamera,
    toggleScreenShare: voice.toggleScreenShare,
    connect: connectAndJoin,
    disconnect,
    peek,
    isStage,
    isStageSpeaker,
  }), [isStage, isStageSpeaker, connectedChannelId, connectedChannelName, voice.joined, voice.participants,
       voice.connectedPeerIds,
       voice.error, voice.remoteStreams, voice.remoteScreens, voice.remoteScreenAudio,
       voice.localScreen, voice.localStream, voice.cameraEnabled, voice.screenEnabled,
       voice.toggleCamera, voice.toggleScreenShare,
       connectAndJoin, disconnect, peek]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {}
      {[...voice.remoteStreams.entries()].filter(([uid]) => !isStage || speakerIds.has(uid)).map(([uid, stream]) => (
        <audio
          key={uid}
          data-call-user={uid}
          ref={(el) => {
            if (!el) return;
            // Only attach on change: re-setting srcObject every render
            // restarts playback and stacks volume against per-view elements.
            if (el.srcObject === stream) return;
            el.srcObject = stream;
            audioRefs.current.set(uid, el);
            applyParticipantAudioControls(el, uid);
            // After the per-person settings, which set their own mute: someone
            // joining while you're deafened stays silent.
            if (deafened) el.muted = true;
            void el.play().catch(() => {});
          }}
          autoPlay
          playsInline
        />
      ))}
    </Ctx.Provider>
  );
}
