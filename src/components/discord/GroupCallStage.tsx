"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconPhone, IconPhoneOff, IconVideo, IconVideoOff, IconMic, IconMicOff } from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { GroupCallParticipant } from "@/hooks/useGroupCallManager";
import { useLiveVideoStream } from "@/hooks/useLiveVideoStream";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";

/* ------------------------------------------------------------------ */
/*  Participant circle                                                */
/* ------------------------------------------------------------------ */

function ParticipantCircle({
  profile,
  stream,
  label,
  mirrored,
  ring,
}: {
  profile?: Profile;
  stream?: MediaStream | null;
  label: string;
  mirrored?: boolean;
  ring?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = useLiveVideoStream(stream);
  const ringClass = ring
    ? "ring-[3px] ring-status-online shadow-[0_0_20px_rgba(59,165,93,0.3)]"
    : "ring-[3px] ring-white/15";

  useEffect(() => {
    if (ref.current && stream && hasVideo) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream, hasVideo]);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className={`relative h-28 w-28 overflow-hidden rounded-full bg-[#2b2d31] ${ringClass}`}>
        {hasVideo && stream ? (
          <video
            ref={ref}
            autoPlay
            playsInline
            muted={mirrored}
            className={`h-full w-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
          />
        ) : profile ? (
          <Avatar profile={profile} size="lg" className="h-28 w-28 text-3xl" />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center">
            <span className="text-3xl font-bold text-white/40">{label.charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>
      <span className="max-w-[100px] truncate text-sm font-medium text-white/80">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timer                                                             */
/* ------------------------------------------------------------------ */

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(m)}:${pad(s)}`;
}

/* ------------------------------------------------------------------ */
/*  Group call stage                                                  */
/* ------------------------------------------------------------------ */

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
  cameraEnabled: boolean;
  micMuted: boolean;
  deafened: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
}

export function GroupCallStage({
  groupName, members, presence, ringingIds, joined,
  selfId, localStream, remoteStreams, cameraEnabled,
  micMuted, deafened, onJoin, onLeave, onToggleCamera, onToggleMic,
}: GroupCallStageProps) {
  const [elapsed, setElapsed] = useState(0);
  const joinedAtRef = useRef<number>(0);

  useEffect(() => {
    if (joined) {
      joinedAtRef.current = Date.now();
      const tick = () => setElapsed(Math.max(0, Date.now() - joinedAtRef.current));
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    } else {
      setElapsed(0);
    }
  }, [joined]);

  if (presence.length === 0) return null;

  const displayMembers = presence.map((p) => ({
    id: p.user_id,
    profile: p.profile ?? members.find((m) => m.id === p.user_id),
    stream: p.user_id === selfId ? localStream : remoteStreams.get(p.user_id),
    mirrored: p.user_id === selfId,
    ringing: ringingIds.has(p.user_id),
  }));

  return (
    <div className="flex shrink-0 flex-col items-center justify-center bg-black px-6 py-8">
      {/* Header */}
      <p className="text-xs font-bold uppercase tracking-widest text-white/30">
        Group Call
      </p>
      <h2 className="mt-1 text-lg font-semibold text-white">{groupName}</h2>
      <p className="mt-1 text-sm text-white/50">
        {presence.length} in voice{joined ? ` \u00b7 ${formatElapsed(elapsed)}` : ""}
        {ringingIds.size > 0 ? ` \u00b7 ${ringingIds.size} ringing` : ""}
      </p>

      {/* Participant circles */}
      <div className="flex flex-wrap items-center justify-center gap-8 py-8">
        {displayMembers.map((m) => (
          <ParticipantCircle
            key={m.id}
            profile={m.profile}
            stream={m.stream}
            mirrored={m.mirrored}
            ring={m.ringing}
            label={m.profile ? displayName(m.profile) : "Member"}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleCamera}
          title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
        >
          {cameraEnabled ? <IconVideo size={20} /> : <IconVideoOff size={20} />}
        </button>

        {!joined ? (
          <button
            type="button"
            onClick={onJoin}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-status-online text-white shadow-lg shadow-status-online/30 transition-transform hover:scale-105"
            title="Join voice"
          >
            <IconPhone size={22} />
          </button>
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

      {/* Remote audio elements */}
      {[...remoteStreams.entries()].map(([uid, stream]) => (
        <audio
          key={uid}
          ref={(el) => {
            if (el) {
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
  );
}
