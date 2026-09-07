"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import type { Profile } from "@/lib/supabase/types";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * The voice connection, held above the view.
 *
 * It used to live inside VoicePanel, which only renders while you are looking
 * at the voice channel — so opening any other channel unmounted the panel, ran
 * the hook's cleanup, and dropped the call. Being in a voice channel and
 * looking at one are different things, and this is what separates them: the
 * session is tied to the channel you connected to, not the channel on screen.
 *
 * The remote audio elements live here too. Rendering them in the panel meant
 * that even if the connection had survived, the sound would have stopped the
 * moment you navigated away.
 */

interface VoiceSession {
  /** The channel the call is in, regardless of what is on screen. */
  connectedChannelId: string | null;
  connectedChannelName: string | null;
  joined: boolean;
  participants: ReturnType<typeof useVoiceChannel>["participants"];
  error: string | null;
  /** Live video from the people in the call, and their screen shares. */
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
  /** Presence for a channel you are only looking at, not connected to. */
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

  // Mirror into app state so the sidebar indicator knows where the call is.
  useEffect(() => {
    setVoiceJoinedChannelId(voice.joined ? connectedChannelId : null);
  }, [voice.joined, connectedChannelId, setVoiceJoinedChannelId]);

  const connect = useCallback(async (channelId: string, channelName: string) => {
    setConnectedChannelId(channelId);
    setConnectedChannelName(channelName);
    // The hook keys off channelId, so the join has to wait for that to land.
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

  // Joining is a second step: connect() sets the channel, and this fires once
  // the hook has been rebuilt against it.
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
      {/* Audio stays mounted for the life of the call, not the life of the view. */}
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
