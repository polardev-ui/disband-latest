"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { CallResizeHandle, useCallHeight } from "./CallResizer";
import { CallGrid } from "./CallTile";
import { IconPhone, IconPhoneOff, IconVideo, IconVideoOff, IconMic, IconMicOff } from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { GroupCallParticipant } from "@/hooks/useGroupCallManager";
import { useLiveVideoStream } from "@/hooks/useLiveVideoStream";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";

function ParticipantTile({
  profile,
  stream,
  label,
  mirrored,
  ring,
  ringing,
  forceScreen,
}: {
  profile?: Profile;
  stream?: MediaStream | null;
  label: string;
  mirrored?: boolean;
  ring?: boolean;
  // Ringing is not speaking: the green ring is kept for layout stability,
  // but the tile says what it means instead of looking like live audio.
  ringing?: boolean;
  forceScreen?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = useLiveVideoStream(stream);
  const ringClass = ring
    ? "ring-2 ring-status-online shadow-[0_0_20px_rgba(59,165,93,0.3)]"
    : "ring-1 ring-white/10";

  useEffect(() => {
    if (ref.current && stream && hasVideo) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream, hasVideo]);

  const isScreen = forceScreen
    || !!stream?.getVideoTracks().some((t) => /screen|display|window|monitor/i.test(t.label));

  return (
    <div
      className={`relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-overlay-media ${ringClass}`}
    >
      {hasVideo && stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={mirrored}
          className={`h-full w-full ${isScreen ? "bg-black object-contain" : "object-cover"} ${
            mirrored && !isScreen ? "scale-x-[-1]" : ""
          }`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {profile ? (
            <Avatar profile={profile} size="lg" className="h-24 w-24 text-3xl" />
          ) : (
            <span className="text-3xl font-bold text-white/40">{label.charAt(0).toUpperCase()}</span>
          )}
        </div>
      )}

      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
        <span className="truncate">{label}</span>
        {ringing && (
          <span className="shrink-0 animate-pulse rounded bg-status-online/25 px-1 text-[10px] font-bold uppercase tracking-wide text-status-online">
            Ringing
          </span>
        )}
        {isScreen && (
          <span className="shrink-0 rounded bg-status-online/25 px-1 text-[10px] font-bold uppercase tracking-wide text-status-online">
            Live
          </span>
        )}
      </span>
    </div>
  );
}

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
  selfId, localStream, remoteStreams, remoteScreens, localScreen, cameraEnabled,
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
    isScreen: false,
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
      mirrored: false,
      ringing: false,
      isScreen: true,
      label: profile ? `${displayName(profile)}'s screen` : "Screen",
    }];
  });

  const displayMembers = [...shares, ...people];

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
        {joined && displayMembers.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-white/50">
            You&apos;re the only one here.
            <br />
            Others can join from the group.
          </p>
        ) : (
        <CallGrid>
          {displayMembers.map((m) => (
            <ParticipantTile
              key={m.id}
              profile={m.profile}
              stream={m.stream}
              mirrored={m.mirrored}
              ring={m.ringing}
              ringing={m.ringing}
              forceScreen={m.isScreen}
              label={m.label}
            />
          ))}
        </CallGrid>
        )}
      </div>

      {}
      <div className="flex shrink-0 items-center gap-4 pb-3">
        <button
          type="button"
          onClick={onToggleCamera}
          title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
        >
          {cameraEnabled ? <IconVideo size={20} /> : <IconVideoOff size={20} />}
        </button>

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
              className={`flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors ${
                micMuted ? "bg-status-dnd/80 hover:bg-status-dnd" : "bg-white/10 hover:bg-white/20"
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
