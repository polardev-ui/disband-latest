"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useVoiceSession } from "@/contexts/VoiceSessionContext";
import { CallTile, CallGrid } from "./CallTile";
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
    voicePresence,
    micMuted,
    deafened,
    setMicMuted,
    setDeafened,
    setVoiceJoinedChannelId,
  } = useApp();

  const session = useVoiceSession();
  const inThisChannel = session.connectedChannelId === channelId;

  // Join is two-phase (connect sets the channel, the actual media join
  // happens in an effect), so the button needs its own pending state —
  // otherwise it flips from "Join" to nothing with no feedback.
  const [joining, setJoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const members = inThisChannel ? session.participants : voicePresence;
  const voice = {
    joined: session.joined && inThisChannel,
    participants: members,
    error: session.error,
    join: () => session.connect(channelId, channelName),
    leave: () => session.disconnect(),
  };

  useEffect(() => {
    if (voice.joined || voice.error) {
      setJoining(false);
      if (voice.error) setActionError(null);
    }
  }, [voice.joined, voice.error]);

  const tiles = [
    ...members.map((p) => {
      const isSelf = p.user_id === user?.id;
      const prof = p.profile ?? { display_name: "?", username: "?" };
      return {
        key: p.user_id,
        profile: prof,
        label: displayName(prof) + (isSelf ? " (you)" : ""),
        stream: inThisChannel
          ? (isSelf ? session.localStream : session.remoteStreams.get(p.user_id)) ?? null
          : null,
        kind: "camera" as const,
        self: isSelf,
        // Remote mute/deafen come from presence (previously dropped, so only
        // the local user ever showed a mute icon). Deafened implies muted.
        muted: isSelf ? micMuted : !!(p.muted || p.deafened),
      };
    }),
    ...members.flatMap((p) => {
      const isSelf = p.user_id === user?.id;
      const stream = isSelf ? session.localScreen : session.remoteScreens.get(p.user_id);
      if (!stream || !inThisChannel) return [];
      const prof = p.profile ?? { display_name: "?", username: "?" };
      return [{
        key: `screen:${p.user_id}`,
        profile: prof,
        label: `${displayName(prof)}'s screen`,
        stream,
        kind: "screen" as const,
        self: false,
        muted: false,
      }];
    }),
  ];

  tiles.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "screen" ? -1 : 1));

  useEffect(() => {
    void loadVoicePresence(channelId);
  }, [channelId, loadVoicePresence]);

  useEffect(() => {
    if (!inThisChannel) session.peek(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inThisChannel, channelId]);

  return (
    <main className="call-enter flex min-w-0 flex-1 flex-col bg-black">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <IconSpeaker size={24} className="text-white/70" />
        <h1 className="text-[16px] font-semibold text-white">{channelName}</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-hidden px-4 pb-4">
        {!voice.joined && tiles.length === 0 ? (
          // The classic empty state: a centred invitation to join.
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h2 className="text-[24px] font-bold leading-[30px] text-white">{channelName}</h2>
            <p className="mt-2 text-[16px] text-white/60">No one is currently in voice</p>
          </div>
        ) : (
          <CallGrid>
            {tiles.map((t) => (
              <CallTile
                key={t.key}
                profile={t.profile}
                label={t.label}
                stream={t.stream}
                kind={t.kind}
                self={t.self}
                muted={t.muted}
              />
            ))}
          </CallGrid>
        )}

        {(voice.error || actionError) && (
          <p role="alert" className="max-w-md rounded-[4px] bg-status-dnd/15 px-3 py-2 text-center text-[14px] text-status-dnd">
            {actionError ?? voice.error}
          </p>
        )}

        <div className="flex shrink-0 flex-col items-center gap-3 pb-2">
          {!voice.joined ? (
            <>
              {tiles.length > 0 && (
                <p className="text-[14px] text-white/60">
                  {voice.participants.length} {voice.participants.length === 1 ? "person is" : "people are"} in voice
                </p>
              )}
              <button
                type="button"
                disabled={joining}
                onClick={() => {
                  setJoining(true);
                  setActionError(null);
                  void requestNotificationPermissionFromGesture();
                  void voice.join();
                }}
                className="h-11 rounded-full bg-button-green px-6 text-[14px] font-medium text-white transition-colors hover:bg-button-green-hover disabled:cursor-wait disabled:opacity-60"
              >
                {joining ? "Joining…" : "Join Voice"}
              </button>
            </>
          ) : (
            <CallControls
              micMuted={micMuted}
              deafened={deafened}
              cameraEnabled={session.cameraEnabled}
              screenShareEnabled={session.screenEnabled}
              onToggleMic={() => setMicMuted(!micMuted)}
              onToggleDeafen={() => {
                const next = !deafened;
                setDeafened(next);
                if (next) setMicMuted(true);
              }}
              onToggleCamera={() => {
                setActionError(null);
                void session.toggleCamera().catch(() => setActionError("Couldn't access the camera."));
              }}
              onToggleScreenShare={() => {
                setActionError(null);
                void session.toggleScreenShare().catch(() => setActionError("Couldn't start screen sharing."));
              }}
              onEnd={() => void voice.leave()}
              onOpenSettings={onOpenSettings}
            />
          )}
        </div>
      </div>
    </main>
  );
}
