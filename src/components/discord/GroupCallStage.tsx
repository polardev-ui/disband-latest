"use client";

import { useEffect, useRef, useState } from "react";
import { CallResizeHandle, useCallHeight } from "./CallResizer";
import { CallStage } from "./CallStage";
import {
  IconPhone, IconPhoneOff, IconVideo, IconVideoOff, IconMic, IconMicOff,
  IconScreenShare, IconScreenShareOff,
} from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { GroupCallParticipant } from "@/hooks/useGroupCallManager";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";

// Shared shape with CallUI's timer: h:mm:ss past the hour, mm:ss within it.
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

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
  selfId, localStream, remoteStreams, remoteScreens, remoteScreenAudio, screenShareEnabled, onToggleScreenShare,
  localScreen, cameraEnabled,
  micMuted, deafened, connectedAt, onJoin, onLeave, onToggleCamera, onToggleMic,
}: GroupCallStageProps) {
  const { height: callHeight, setHeight: setCallHeight } = useCallHeight();
  const [elapsed, setElapsed] = useState(0);
  const joinedAtRef = useRef<number>(0);

  useEffect(() => {
    if (joined) {
      // Prefer the manager timestamp so remounts don't restart the clock.
      joinedAtRef.current = connectedAt ?? Date.now();
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


  return (
    <div className="flex shrink-0 flex-col overflow-hidden bg-black" style={{ height: callHeight }}>
     <div className="flex min-h-0 flex-1 flex-col items-center px-6 pt-3">
      {}
      <p className="text-xs font-bold uppercase tracking-widest text-white/30">
        Group Call
      </p>
      <h2 className="mt-1 text-lg font-semibold text-white">{groupName}</h2>
      <p className="mt-1 text-sm text-white/50">
        {presence.length} in voice{joined ? ` \u00b7 ${formatElapsed(elapsed)}` : ""}
        {ringingIds.size > 0 ? ` \u00b7 ${ringingIds.size} ringing` : ""}
      </p>

      {}
      <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col py-3">
        {joined && people.length + shares.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-white/50">
            You&apos;re the only one here.
            <br />
            Others can join from the group.
          </p>
        ) : (
        <CallStage members={people} screens={shares} deafened={deafened} />
        )}
      </div>

      {}
      <div className="flex shrink-0 items-center gap-4 pb-3">
        <button
          type="button"
          onClick={onToggleCamera}
          title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-text-normal/10 text-text-normal transition-colors hover:bg-text-normal/20"
        >
          {cameraEnabled ? <IconVideo size={20} /> : <IconVideoOff size={20} />}
        </button>

        {joined && onToggleScreenShare && (
          <button
            type="button"
            onClick={onToggleScreenShare}
            title={screenShareEnabled ? "Stop sharing" : "Share screen"}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              screenShareEnabled
                ? "bg-status-online/25 text-status-online ring-2 ring-status-online/40"
                : "bg-text-normal/10 text-text-normal hover:bg-text-normal/20"
            }`}
          >
            {screenShareEnabled ? <IconScreenShareOff size={20} /> : <IconScreenShare size={20} />}
          </button>
        )}

        {!joined ? (
          <>
            <button
              type="button"
              onClick={onToggleMic}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors ${
                micMuted ? "bg-status-dnd/80 hover:bg-status-dnd" : "bg-white/10 hover:bg-white/20"
              }`}
              title={micMuted ? "Unmute before joining" : "Mute before joining"}
            >
              {micMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
            </button>
            <button
              type="button"
              onClick={onJoin}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-status-online text-white shadow-lg shadow-status-online/30 transition-transform hover:scale-105"
              title="Join voice"
            >
              <IconPhone size={22} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMic}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-text-normal transition-colors ${
                micMuted ? "bg-status-dnd/80 hover:bg-status-dnd" : "bg-text-normal/10 hover:bg-text-normal/20"
              }`}
              title={micMuted ? "Unmute" : "Mute"}
            >
              {micMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-status-dnd text-white shadow-lg transition-transform hover:scale-105"
              title="Leave voice"
            >
              <IconPhoneOff size={22} />
            </button>
          </>
        )}
      </div>

      {}
      {[...remoteStreams.entries()].map(([uid, stream]) => (
        <audio
          key={uid}
          ref={(el) => {
            // Guard identity: the old version re-set srcObject and re-played
            // on every render, which restarts audible playback (stutter /
            // double-volume against the context-level element).
            if (el && el.srcObject !== stream) {
              el.srcObject = stream;
              el.muted = deafened;
              void applyAudioOutputToElement(el, getPreferredAudioOutputId());
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
