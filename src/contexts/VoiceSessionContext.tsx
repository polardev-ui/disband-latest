"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import type { Profile } from "@/lib/supabase/types";
import type { SubscriptionPlan } from "@/lib/subscription";

interface VoiceSession {

  connectedChannelId: string | null;
  connectedChannelName: string | null;
  joined: boolean;
  participants: ReturnType<typeof useVoiceChannel>["participants"];
  error: string | null;

  remoteStreams: Map<string, MediaStream>;
  remoteScreens: Map<string, MediaStream>;
  localScreen: MediaStream | null;
  localStream: MediaStream | null;
  cameraEnabled: boolean;
  screenEnabled: boolean;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  connect: (channelId: string, channelName: string) => Promise<void>;
  disconnect: () => Promise<void>;

  peek: (channelId: string) => void;
}

const Ctx = createContext<VoiceSession | null>(null);

export function useVoiceSession(): VoiceSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoiceSession requires VoiceSessionProvider");
  return v;
}

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const {
    profile, user, micMuted, deafened, setVoiceJoinedChannelId, loadVoicePresence,
  } = useApp();

  const [connectedChannelId, setConnectedChannelId] = useState<string | null>(null);
  const [connectedChannelName, setConnectedChannelName] = useState<string | null>(null);

  const voice = useVoiceChannel(
    connectedChannelId,
    user?.id ?? null,
    profile as Profile | null,
    micMuted,
    deafened,
    (profile?.subscription_plan as SubscriptionPlan) ?? "free",
  );

  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    audioRefs.current.forEach((el) => { el.muted = deafened; });
  }, [deafened]);

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
    error: voice.error,
    remoteStreams: voice.remoteStreams,
    remoteScreens: voice.remoteScreens,
    localScreen: voice.localScreen,
    localStream: voice.localStream,
    cameraEnabled: voice.cameraEnabled,
    screenEnabled: voice.screenEnabled,
    toggleCamera: voice.toggleCamera,
    toggleScreenShare: voice.toggleScreenShare,
    connect: connectAndJoin,
    disconnect,
    peek,
  }), [connectedChannelId, connectedChannelName, voice.joined, voice.participants,
       voice.error, voice.remoteStreams, voice.remoteScreens, voice.localScreen,
       voice.localStream, voice.cameraEnabled, voice.screenEnabled,
       voice.toggleCamera, voice.toggleScreenShare,
       connectAndJoin, disconnect, peek]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {}
      {[...voice.remoteStreams.entries()].map(([uid, stream]) => (
        <audio
          key={uid}
          ref={(el) => {
            if (!el) return;
            el.srcObject = stream;
            el.muted = deafened;
            audioRefs.current.set(uid, el);
            void el.play().catch(() => {});
          }}
          autoPlay
          playsInline
        />
      ))}
    </Ctx.Provider>
  );
}
