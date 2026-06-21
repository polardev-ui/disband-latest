"use client";

import { useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import { displayName } from "@/lib/utils";
import { IconPhone, IconSpeaker } from "@/components/icons";

interface VoicePanelProps {
  channelId: string;
  channelName: string;
}

export function VoicePanel({ channelId, channelName }: VoicePanelProps) {
  const { profile, user, loadVoicePresence } = useApp();
  const voice = useVoiceChannel(channelId, user?.id ?? null, profile);

  useEffect(() => {
    void loadVoicePresence(channelId);
  }, [channelId, loadVoicePresence, voice.participants.length]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg-primary">
      <header className="flex h-12 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <IconSpeaker className="text-text-muted" />
        <h1 className="font-semibold">{channelName}</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <IconSpeaker size={48} className="mx-auto text-text-muted" />
          <h2 className="mt-4 text-xl font-semibold">Voice Channel</h2>
          <p className="mt-1 text-sm text-text-muted">
            {voice.participants.length} connected
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {voice.participants.map((p) => (
            <div key={p.user_id} className="flex flex-col items-center gap-1">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                {displayName(p.profile ?? { username: "?" }).charAt(0)}
              </div>
              <span className="text-xs text-text-muted">{displayName(p.profile ?? { username: "?" })}</span>
            </div>
          ))}
        </div>

        {voice.error && <p className="text-sm text-status-dnd">{voice.error}</p>}

        <div className="flex gap-3">
          {!voice.joined ? (
            <button
              type="button"
              onClick={() => void voice.join()}
              className="flex items-center gap-2 rounded bg-status-online px-6 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90"
            >
              <IconPhone size={18} /> Join Voice
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void voice.leave()}
              className="flex items-center gap-2 rounded bg-status-dnd px-6 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Remote audio elements */}
        {[...voice.remoteStreams.entries()].map(([uid, stream]) => (
          <audio
            key={uid}
            ref={(el) => {
              if (el) {
                el.srcObject = stream;
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
