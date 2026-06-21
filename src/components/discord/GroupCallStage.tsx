"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconPhone, IconPhoneOff, IconVideo, IconVideoOff } from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { GroupCallParticipant } from "@/hooks/useGroupCallManager";
import { useLiveVideoStream } from "@/hooks/useLiveVideoStream";

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

function VideoBubble({
  stream,
  label,
  profile,
  mirrored,
  ring,
}: {
  stream?: MediaStream | null;
  label: string;
  profile?: Profile;
  mirrored?: boolean;
  ring?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = useLiveVideoStream(stream);

  useEffect(() => {
    if (ref.current && stream && hasVideo) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream, hasVideo]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-full bg-[#2b2d31] ${
          ring ? "ring-4 ring-status-online animate-pulse" : "ring-2 ring-white/10"
        }`}
      >
        {hasVideo && stream ? (
          <video
            ref={ref}
            autoPlay
            playsInline
            muted={mirrored}
            className={`h-full w-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
          />
        ) : profile ? (
          <Avatar profile={profile} size="lg" className="h-32 w-32 text-3xl" />
        ) : (
          <span className="text-3xl text-text-muted">?</span>
        )}
      </div>
      <span className="max-w-[120px] truncate text-sm font-medium text-white/90">{label}</span>
    </div>
  );
}

export function GroupCallStage({
  groupName,
  members,
  presence,
  ringingIds,
  joined,
  selfId,
  localStream,
  remoteStreams,
  cameraEnabled,
  micMuted,
  deafened,
  onJoin,
  onLeave,
  onToggleCamera,
  onToggleMic,
}: GroupCallStageProps) {
  if (presence.length === 0) return null;

  const displayMembers = presence.map((p) => ({
    id: p.user_id,
    profile: p.profile ?? members.find((m) => m.id === p.user_id),
    stream: p.user_id === selfId ? localStream : remoteStreams.get(p.user_id),
    mirrored: p.user_id === selfId,
    ringing: false,
  }));

  return (
    <div className="flex shrink-0 flex-col items-center justify-between bg-black px-6 py-8">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-white/40">Group Call</p>
        <h2 className="mt-1 text-lg font-semibold text-white">{groupName}</h2>
        <p className="mt-1 text-sm text-white/50">
          {`${presence.length} in voice${ringingIds.size ? ` · ${ringingIds.size} ringing` : ""}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-8 py-6">
        {displayMembers.map((m) => (
          <VideoBubble
            key={m.id}
            profile={m.profile}
            stream={m.stream}
            mirrored={m.mirrored}
            ring={m.ringing}
            label={m.profile ? displayName(m.profile) : "Member"}
          />
        ))}
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={onToggleCamera}
          title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2b2d31] text-white transition-transform hover:scale-105"
        >
          {cameraEnabled ? <IconVideo size={24} /> : <IconVideoOff size={24} />}
        </button>

        {!joined ? (
          <button
            type="button"
            onClick={onJoin}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white shadow-lg shadow-status-online/30 transition-transform hover:scale-105"
            title="Join voice"
          >
            <IconPhone size={24} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMic}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform hover:scale-105 ${
                micMuted ? "bg-status-dnd/80" : "bg-[#2b2d31]"
              }`}
              title={micMuted ? "Unmute" : "Mute"}
            >
              {micMuted ? "🔇" : "🎤"}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white shadow-lg transition-transform hover:scale-105"
              title="Leave voice"
            >
              <IconPhoneOff size={24} />
            </button>
          </>
        )}
      </div>

      {[...remoteStreams.entries()].map(([uid, stream]) => (
        <audio
          key={uid}
          ref={(el) => {
            if (el) {
              el.srcObject = stream;
              el.muted = deafened;
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
