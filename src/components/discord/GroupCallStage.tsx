"use client";

import { useEffect, useRef, useState } from "react";
import { CallResizeHandle, useCallHeight } from "./CallResizer";
import { CallControls, VoiceStatus } from "./CallUI";
import { Tooltip } from "./Tooltip";
import { CallStage } from "./CallStage";
import {
  IconGroup, IconPhone, IconPhoneOff, IconVideo, IconVideoOff, IconMic, IconMicOff,
  IconScreenShare, IconScreenShareOff,
} from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { GroupCallParticipant } from "@/hooks/useGroupCallManager";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";

interface GroupCallStageProps {
  groupName: string;
  members: Profile[];
  presence: GroupCallParticipant[];
  inCallUserIds: Set<string>;
  ringingIds: Set<string>;
  joined: boolean;
  selfId?: string | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  connectedPeerIds: Set<string>;

  remoteScreens: Map<string, MediaStream>;
  remoteScreenAudio?: Map<string, MediaStream>;
  screenShareEnabled?: boolean;
  onToggleScreenShare?: () => void;
  localScreen: MediaStream | null;
  cameraEnabled: boolean;
  micMuted: boolean;
  deafened: boolean;
  // Manager-owned join timestamp: survives stage remounts (the old local
  // joinedAtRef reset the visible timer every remount).
  connectedAt?: number | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
}

export function GroupCallStage({
  groupName, members, presence, ringingIds, joined,
  selfId, localStream, remoteStreams, connectedPeerIds, remoteScreens, remoteScreenAudio, screenShareEnabled, onToggleScreenShare,
  localScreen, cameraEnabled,
  micMuted, deafened, connectedAt, onJoin, onLeave, onToggleCamera, onToggleMic,
}: GroupCallStageProps) {
  const { height: callHeight, setHeight: setCallHeight } = useCallHeight();
  // While a share or camera is focused the panel takes most of the window,
  // without overwriting the height you dragged it to.
  const [focused, setFocused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const joinedAtRef = useRef<number>(0);

  useEffect(() => {
    if (joined && connectedAt) {
      // Prefer the manager timestamp so remounts don't restart the clock.
      joinedAtRef.current = connectedAt;
      const tick = () => setElapsed(Math.max(0, Date.now() - joinedAtRef.current));
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    } else {
      setElapsed(0);
    }
  }, [joined, connectedAt]);

  // Nothing happening and not in the call: render nothing (the chat shows).
  if (presence.length === 0 && !joined) return null;

  const people = presence.map((p) => ({
    id: p.user_id,
    profile: p.profile ?? members.find((m) => m.id === p.user_id),
    stream: p.user_id === selfId ? localStream : remoteStreams.get(p.user_id),
    mirrored: p.user_id === selfId,
    ringing: ringingIds.has(p.user_id),
    muted: p.user_id === selfId ? micMuted : undefined,
    label: p.profile ?? members.find((m) => m.id === p.user_id)
      ? displayName((p.profile ?? members.find((m) => m.id === p.user_id))!)
      : "Member",
  }));

  const shares = presence.flatMap((p) => {
    const stream = p.user_id === selfId ? localScreen : remoteScreens.get(p.user_id);
    if (!stream) return [];
    const profile = p.profile ?? members.find((m) => m.id === p.user_id);
    return [{
      id: `screen:${p.user_id}`,
      profile,
      stream,
      audio: p.user_id === selfId ? null : remoteScreenAudio?.get(p.user_id) ?? null,
      local: p.user_id === selfId,
      label: p.user_id === selfId
        ? "Your screen"
        : profile ? `${displayName(profile)}'s screen` : "Screen",
    }];
  });


  const remotePresence = presence.filter((p) => p.user_id !== selfId);
  const connecting = joined && remotePresence.length > 0 &&
    !remotePresence.some((p) => connectedPeerIds.has(p.user_id));

  return (
    <div
      className="call-enter flex shrink-0 flex-col overflow-hidden border-b border-divider bg-bg-primary"
      style={{ height: focused ? Math.max(callHeight, Math.round(window.innerHeight * 0.8)) : callHeight }}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-divider px-4">
        <IconGroup size={20} className="shrink-0 text-text-muted" />
        <h2 className="min-w-0 truncate text-[16px] font-semibold text-header-primary">{groupName}</h2>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="hidden text-[12px] text-header-secondary sm:inline">
            {presence.length} in voice
            {ringingIds.size > 0 ? ` · ${ringingIds.size} ringing` : ""}
          </span>
          {joined && (
            <VoiceStatus connected={!connecting} elapsed={connectedAt ? elapsed : null} />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center px-6 pb-1 pt-2">
        <div className={`flex min-h-0 w-full ${focused ? "max-w-none" : "max-w-4xl"} flex-1 flex-col py-3`}>
          {joined && people.length + shares.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-secondary text-text-muted">
                <IconGroup size={32} />
              </span>
              <p className="text-sm font-medium text-header-primary">You&apos;re the only one here.</p>
              <p className="text-sm text-header-secondary">Others can join from the group.</p>
            </div>
          ) : (
            <CallStage members={people} screens={shares} deafened={deafened} onFocusChange={setFocused} />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4 pb-6 pt-2">
          {!joined ? (
            <>
              <Tooltip label={micMuted ? "Unmute before joining" : "Mute before joining"} side="top">
                <button
                  type="button"
                  onClick={onToggleMic}
                  aria-label={micMuted ? "Unmute" : "Mute"}
                  className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
                    micMuted ? "bg-white text-status-dnd" : "bg-bg-secondary text-white hover:bg-bg-tertiary"
                  }`}
                >
                  {micMuted ? <IconMicOff size={24} /> : <IconMic size={24} />}
                </button>
              </Tooltip>
              <button
                type="button"
                onClick={onJoin}
                className="flex h-14 items-center gap-2 rounded-full bg-button-green px-6 text-[16px] font-medium text-white transition-colors hover:bg-button-green-hover"
              >
                <IconPhone size={22} /> Join Call
              </button>
            </>
          ) : (
            <CallControls
              micMuted={micMuted}
              deafened={deafened}
              cameraEnabled={cameraEnabled}
              screenShareEnabled={screenShareEnabled}
              onToggleMic={onToggleMic}
              onToggleCamera={onToggleCamera}
              onToggleScreenShare={onToggleScreenShare}
              onEnd={onLeave}
            />
          )}
        </div>

        {[...remoteStreams.entries()].map(([uid, stream]) => (
          <audio
            key={uid}
            data-call-user={uid}
            ref={(el) => {
              // Guard identity: the old version re-set srcObject and re-played
              // on every render, which restarts audible playback (stutter /
              // double-volume against the context-level element).
              if (el && el.srcObject !== stream) {
                el.srcObject = stream;
                el.muted = deafened;
                void applyAudioOutputToElement(el, getPreferredAudioOutputId());
                import("@/lib/call-participant-settings").then((m) =>
                  m.applyParticipantAudioControls(el, uid),
                );
                void el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
          />
        ))}
      </div>
      <CallResizeHandle height={callHeight} onResize={setCallHeight} />
    </div>
  );
}
