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

      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-hidden px-6 pt-4 pb-4">
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

        <CallGrid>
          {tiles.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-text-muted">
              No one is here yet.
              <br />
              Join to start the conversation.
            </p>
          ) : (
            tiles.map((t) => (
              <CallTile
                key={t.key}
                profile={t.profile}
                label={t.label}
                stream={t.stream}
                kind={t.kind}
                self={t.self}
                muted={t.muted}
              />
            ))
          )}
        </CallGrid>

        {(voice.error || actionError) && (
          <p role="alert" className="max-w-md rounded-lg border border-status-dnd/30 bg-status-dnd/10 px-3 py-2 text-center text-sm text-status-dnd">
            {actionError ?? voice.error}
          </p>
        )}

        <div className="flex flex-col items-center gap-4">
          {!voice.joined ? (
            <button
              type="button"
              disabled={joining}
              onClick={() => {
                setJoining(true);
                setActionError(null);
                void requestNotificationPermissionFromGesture();
                void voice.join();
              }}
              className="rounded-full bg-status-online px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-status-online/25 transition-all hover:scale-[1.03] hover:opacity-90 disabled:cursor-wait disabled:opacity-60 disabled:hover:scale-100"
            >
              {joining ? "Joining…" : "Join Voice"}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    void session.toggleCamera().catch(() => setActionError("Couldn't access the camera."));
                  }}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                    session.cameraEnabled
                      ? "bg-status-online text-white"
                      : "bg-bg-accent text-text-normal hover:bg-interactive-hover"
                  }`}
                >
                  {session.cameraEnabled ? "Stop video" : "Turn on camera"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    void session.toggleScreenShare().catch(() => setActionError("Couldn't start screen sharing."));
                  }}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                    session.screenEnabled
                      ? "bg-status-online text-white"
                      : "bg-bg-accent text-text-normal hover:bg-interactive-hover"
                  }`}
                >
                  {session.screenEnabled ? "Stop sharing" : "Share screen"}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </main>
  );
}
