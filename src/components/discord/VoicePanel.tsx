"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useVoiceSession } from "@/contexts/VoiceSessionContext";
import { CallStage, type StageMember, type StageScreen } from "./CallStage";
import { CallControls, VoiceStatus } from "./CallUI";
import { displayName } from "@/lib/utils";
import { requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { IconPhone, IconSpeaker } from "@/components/icons";

interface VoicePanelProps {
  channelId: string;
  channelName: string;
  onOpenSettings?: () => void;
}

export function VoicePanel({ channelId, channelName, onOpenSettings }: VoicePanelProps) {
  const {
    user,
    loadVoicePresence,
    voicePresence,
    micMuted,
    deafened,
    setMicMuted,
    setDeafened,
  } = useApp();

  const session = useVoiceSession();
  const inThisChannel = session.connectedChannelId === channelId;

  // Join is two-phase (connect sets the channel, the actual media join
  // happens in an effect), so the button needs its own pending state —
  // otherwise it flips from "Join" to nothing with no feedback.
  const [joining, setJoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const members = inThisChannel ? session.participants : voicePresence;
  const voice = {
    joined: session.joined && inThisChannel,
    participants: members,
    error: session.error,
    join: () => session.connect(channelId, channelName),
    leave: () => session.disconnect(),
  };

  const remoteMembers = members.filter((p) => p.user_id !== user?.id);
  // `joined` means our mic is live and presence is written. Audio only works
  // once at least one peer's ICE/DTLS handshake finishes, which can lag
  // behind noticeably on a slow or relayed path.
  const connecting = voice.joined && remoteMembers.length > 0 &&
    !remoteMembers.some((p) => session.connectedPeerIds.has(p.user_id));

  useEffect(() => {
    if (voice.joined || voice.error) {
      setJoining(false);
      if (voice.error) setActionError(null);
    }
  }, [voice.joined, voice.error]);

  useEffect(() => {
    if (!voice.joined || connecting) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const tick = () => setElapsed(Math.max(0, Date.now() - started));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [voice.joined, connecting, channelId]);

  const stageMembers: StageMember[] = members.map((p) => {
    const isSelf = p.user_id === user?.id;
    return {
      id: p.user_id,
      profile: p.profile,
      label: p.profile ? displayName(p.profile) + (isSelf ? " (you)" : "") : isSelf ? "You" : "Member",
      stream: inThisChannel
        ? (isSelf ? session.localStream : session.remoteStreams.get(p.user_id)) ?? null
        : null,
      mirrored: isSelf,
      // Remote mute/deafen come from presence (previously dropped, so only
      // the local user ever showed a mute icon). Deafened implies muted.
      muted: isSelf ? micMuted : !!(p.muted || p.deafened),
    };
  });

  const stageScreens: StageScreen[] = members.flatMap((p) => {
    const isSelf = p.user_id === user?.id;
    const stream = isSelf ? session.localScreen : session.remoteScreens.get(p.user_id);
    if (!stream || !inThisChannel) return [];
    return [{
      id: `screen:${p.user_id}`,
      profile: p.profile,
      label: isSelf
        ? "Your screen"
        : p.profile ? `${displayName(p.profile)}'s screen` : "Screen",
      stream,
      local: isSelf,
    }];
  });

  useEffect(() => {
    void loadVoicePresence(channelId);
  }, [channelId, loadVoicePresence]);

  useEffect(() => {
    if (!inThisChannel) session.peek(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inThisChannel, channelId]);

  return (
    <main className="call-enter flex min-w-0 flex-1 flex-col bg-bg-primary">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-divider px-4">
        <IconSpeaker size={20} className="shrink-0 text-text-muted" />
        <h1 className="min-w-0 truncate text-[16px] font-semibold text-header-primary">{channelName}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {members.length > 0 && (
            <span className="hidden text-[12px] text-header-secondary sm:inline">
              {members.length} in voice
            </span>
          )}
          {voice.joined && (
            <VoiceStatus connected={!connecting} elapsed={connecting ? null : elapsed} />
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4 pb-4">
        {!voice.joined && members.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-bg-secondary text-text-muted">
              <IconSpeaker size={34} />
            </span>
            <h2 className="text-[20px] font-bold leading-6 text-header-primary">{channelName}</h2>
            <p className="mt-1.5 text-[14px] text-header-secondary">No one is currently in voice</p>
          </div>
        ) : (
          <div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col py-4">
            <CallStage members={stageMembers} screens={stageScreens} />
          </div>
        )}

        {(voice.error || actionError) && (
          <p role="alert" className="max-w-md rounded-[4px] bg-status-dnd/15 px-3 py-2 text-center text-[14px] text-status-dnd">
            {actionError ?? voice.error}
          </p>
        )}

        <div className="flex shrink-0 flex-col items-center gap-3 pb-2">
          {!voice.joined ? (
            <>
              {members.length > 0 && (
                <p className="text-[14px] text-header-secondary">
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
                className="flex h-12 items-center gap-2 rounded-full bg-button-green px-6 text-[15px] font-medium text-white transition-colors hover:bg-button-green-hover disabled:cursor-wait disabled:opacity-60"
              >
                <IconPhone size={20} />
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
