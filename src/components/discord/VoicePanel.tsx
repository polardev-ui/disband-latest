"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import { Avatar } from "@/components/ui/Avatar";
import { CallControls } from "./CallUI";
import { displayName } from "@/lib/utils";
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
  } = useApp();
  const voice = useVoiceChannel(channelId, user?.id ?? null, profile, micMuted, deafened);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  useEffect(() => {
    void loadVoicePresence(channelId);
  }, [channelId, loadVoicePresence, voice.participants.length]);

  useEffect(() => {
    audioRefs.current.forEach((el) => { el.muted = deafened; });
  }, [deafened]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-primary">
      <header className="flex h-12 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <IconSpeaker className="text-text-muted" />
        <h1 className="font-semibold">{channelName}</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <IconSpeaker size={48} className="mx-auto text-text-muted" strokeWidth={1.5} />
          <h2 className="mt-4 text-xl font-semibold">Voice Channel</h2>
          <p className="mt-1 text-sm text-text-muted">
            {voice.participants.length} connected
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {voice.participants.map((p) => {
            const prof = p.profile ?? { display_name: "?", username: "?" };
            const speaking = voice.joined && p.user_id === user?.id && !micMuted;
            return (
              <div key={p.user_id} className="flex flex-col items-center gap-2">
                <div className={`rounded-full p-0.5 ${speaking ? "ring-2 ring-status-online" : ""}`}>
                  <Avatar profile={prof} size="lg" className="h-20 w-20 text-2xl" />
                </div>
                <span className="max-w-[100px] truncate text-sm text-text-normal">{displayName(prof)}</span>
                {p.user_id === user?.id && micMuted && (
                  <span className="text-[10px] text-status-dnd">Muted</span>
                )}
              </div>
            );
          })}
        </div>

        {voice.error && <p className="text-sm text-status-dnd">{voice.error}</p>}

        <div className="flex flex-col items-center gap-4">
          {!voice.joined ? (
            <button
              type="button"
              onClick={() => void voice.join()}
              className="rounded-full bg-status-online px-8 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
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
                className="text-xs text-text-muted hover:text-status-dnd"
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
