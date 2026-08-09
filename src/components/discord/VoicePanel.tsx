"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import { Avatar } from "@/components/ui/Avatar";
import { CallControls } from "./CallUI";
import { displayName } from "@/lib/utils";
import { requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { IconSpeaker } from "@/components/icons";

interface VoicePanelProps {
  channelId: string;
  channelName: string;
  onOpenSettings?: () => void;
}

export function VoicePanel({ channelId, channelName, onOpenSettings }: VoicePanelProps) {
  const {
    profile,
    user,
    loadVoicePresence,
    micMuted,
    deafened,
    setMicMuted,
    setDeafened,
    setVoiceJoinedChannelId,
  } = useApp();
  const voice = useVoiceChannel(channelId, user?.id ?? null, profile, micMuted, deafened);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    void loadVoicePresence(channelId);
  }, [channelId, loadVoicePresence, voice.participants.length]);

  useEffect(() => {
    if (voice.joined) setVoiceJoinedChannelId(channelId);
    else setVoiceJoinedChannelId(null);
  }, [voice.joined, channelId, setVoiceJoinedChannelId]);

  useEffect(() => {
    return () => {
      setVoiceJoinedChannelId(null);
    };
  }, [channelId, setVoiceJoinedChannelId]);

  useEffect(() => {
    audioRefs.current.forEach((el) => { el.muted = deafened; });
  }, [deafened]);

  return (
    <main className="call-enter flex min-w-0 flex-1 flex-col bg-gradient-to-b from-status-online/[0.06] to-bg-primary">
      <header className="flex h-12 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <IconSpeaker className={voice.joined ? "text-status-online" : "text-text-muted"} />
        <h1 className="font-semibold">{channelName}</h1>
        {voice.joined && (
          <span className="ml-2 flex items-center gap-1.5 rounded-full bg-status-online/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-status-online">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-online" />
            Connected
          </span>
        )}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <div
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
              voice.joined ? "bg-status-online/15 text-status-online" : "bg-bg-tertiary text-text-muted"
            }`}
          >
            <IconSpeaker size={40} strokeWidth={1.5} />
          </div>
          <h2 className="mt-4 text-xl font-semibold">{voice.joined ? channelName : "Voice Channel"}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {voice.joined
              ? `${voice.participants.length} connected`
              : `${voice.participants.length} connected — join to talk`}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {voice.participants.map((p) => {
            const prof = p.profile ?? { display_name: "?", username: "?" };
            const isSelf = p.user_id === user?.id;
            const speaking = voice.joined && isSelf ? !micMuted : false;
            return (
              <div key={p.user_id} className="call-enter flex flex-col items-center gap-2">
                <div className="relative">
                  <div
                    className={`rounded-full p-0.5 transition-all ${
                      speaking ? "ring-2 ring-status-online" : isSelf ? "ring-1 ring-white/15" : ""
                    }`}
                  >
                    <Avatar profile={prof} size="lg" className="h-20 w-20 text-2xl" />
                  </div>
                  {isSelf && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      You{micMuted ? " · muted" : ""}
                    </span>
                  )}
                </div>
                <span className={`max-w-[100px] truncate text-sm ${isSelf ? "font-semibold text-text-normal" : "text-text-normal"}`}>
                  {displayName(prof)}
                </span>
              </div>
            );
          })}
        </div>

        {voice.error && <p className="text-sm text-status-dnd">{voice.error}</p>}

        <div className="flex flex-col items-center gap-4">
          {!voice.joined ? (
            <button
              type="button"
              onClick={() => {
                void requestNotificationPermissionFromGesture();
                void voice.join();
              }}
              className="rounded-full bg-status-online px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-status-online/25 transition-all hover:scale-[1.03] hover:opacity-90"
            >
              Join Voice
            </button>
          ) : (
            <>
              <CallControls
                micMuted={micMuted}
                deafened={deafened}
                onToggleMic={() => setMicMuted(!micMuted)}
                onToggleDeafen={() => {
                  const next = !deafened;
                  setDeafened(next);
                  if (next) setMicMuted(true);
                }}
                onEnd={() => void voice.leave()}
                onOpenSettings={onOpenSettings}
              />
              <button
                type="button"
                onClick={() => void voice.leave()}
                className="text-xs text-text-muted transition-colors hover:text-status-dnd"
              >
                Leave channel
              </button>
            </>
          )}
        </div>

        {[...voice.remoteStreams.entries()].map(([uid, stream]) => (
          <audio
            key={uid}
            ref={(el) => {
              if (el) {
                el.srcObject = stream;
                el.muted = deafened;
                audioRefs.current.set(uid, el);
                void el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
          />
        ))}
      </div>
    </main>
  );
}
