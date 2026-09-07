"use client";

import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import {
  IconMic,
  IconMicOff,
  IconHeadphones,
  IconHeadphonesOff,
  IconPhoneOff,
  IconPhone,
  IconSettings,
  IconVideo,
  IconVideoOff,
  IconScreenShare,
  IconScreenShareOff,
} from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";
import { useEffect, useRef, useState } from "react";
import { CallResizeHandle, useCallHeight } from "./CallResizer";
import { useLiveVideoStream } from "@/hooks/useLiveVideoStream";
import { CallGrid } from "./CallTile";

/* ------------------------------------------------------------------ */
/*  Controls                                                          */
/* ------------------------------------------------------------------ */

interface CallControlsProps {
  micMuted: boolean;
  deafened: boolean;
  cameraEnabled?: boolean;
  screenShareEnabled?: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
}

export function CallControls({
  micMuted, deafened, cameraEnabled, screenShareEnabled,
  onToggleMic, onToggleDeafen, onToggleCamera, onToggleScreenShare,
  onEnd, onOpenSettings,
}: CallControlsProps) {
  const items = [
    { onClick: onToggleMic, title: micMuted ? "Unmute" : "Mute", active: micMuted, on: IconMic, off: IconMicOff },
    { onClick: onToggleDeafen, title: deafened ? "Undeafen" : "Deafen", active: deafened, on: IconHeadphones, off: IconHeadphonesOff },
    ...(onToggleCamera ? [{ onClick: onToggleCamera, title: cameraEnabled ? "Stop video" : "Start video", active: !!cameraEnabled, on: IconVideo, off: IconVideoOff }] : []),
    ...(onToggleScreenShare ? [{ onClick: onToggleScreenShare, title: screenShareEnabled ? "Stop sharing" : "Share screen", active: !!screenShareEnabled, on: IconScreenShare, off: IconScreenShareOff }] : []),
    { onClick: onEnd, title: "End call", active: false, on: IconPhoneOff, off: IconPhoneOff, danger: true },
    ...(onOpenSettings ? [{ onClick: onOpenSettings, title: "Settings", active: false, on: IconSettings, off: IconSettings }] : []),
  ];

  return (
    <div className="flex items-center gap-2">
      {items.map((item) => {
        const Icon = item.active && item.off ? item.off : item.on;
        return (
          <button
            key={item.title}
            type="button"
            onClick={item.onClick}
            title={item.title}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
              "danger" in item && item.danger
                ? "bg-status-dnd text-white shadow-lg shadow-status-dnd/30 hover:scale-105 hover:brightness-110"
                : item.active
                  ? "bg-status-dnd/25 text-status-dnd ring-2 ring-status-dnd/40"
                  : "bg-white/10 text-white/80 hover:bg-white/20 hover:scale-105"
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Participant circle                                                */
/* ------------------------------------------------------------------ */

function ParticipantTile({
  profile,
  stream,
  label,
  mirrored,
  isScreen,
  ring,
  size = "md",
}: {
  profile?: Profile;
  stream?: MediaStream | null;
  label: string;
  mirrored?: boolean;
  /** A shared screen: fitted rather than cropped, and never mirrored. */
  isScreen?: boolean;
  ring?: boolean;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = useLiveVideoStream(stream);
  const dim = size === "lg" ? "h-36 w-36" : "h-28 w-28";
  const textSize = size === "lg" ? "text-4xl" : "text-3xl";
  const ringClass = ring
    ? "ring-[3px] ring-status-online"
    : "ring-[3px] ring-white/15";

  useEffect(() => {
    if (ref.current && stream && hasVideo) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream, hasVideo]);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className={`relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-[#2b2d31] ${ringClass} ${
          ring ? "shadow-[0_0_24px_rgba(59,165,93,0.3)]" : ""
        }`}
      >
        {hasVideo && stream ? (
          <video
            ref={ref}
            autoPlay
            playsInline
            muted={mirrored || isScreen}
            className={`h-full w-full ${isScreen ? "bg-black object-contain" : "object-cover"} ${
              mirrored && !isScreen ? "scale-x-[-1]" : ""
            }`}
          />
        ) : profile ? (
          <span className="flex h-full w-full items-center justify-center">
            <Avatar profile={profile} size="lg" className="h-20 w-20 text-2xl" />
          </span>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className={`${textSize} font-bold text-white/40`}>{label.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
          <span className="max-w-[160px] truncate">{label}</span>
          {isScreen && (
            <span className="shrink-0 rounded bg-status-online/25 px-1 text-[10px] font-bold uppercase tracking-wide text-status-online">
              Live
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ringing overlay                                                   */
/* ------------------------------------------------------------------ */

export function IncomingCallOverlay({ callerName, profile, onAccept, onReject }: {
  callerName: string; profile?: Profile; onAccept: () => void; onReject: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md">
      <div className="call-enter flex flex-col items-center px-8 text-center">
        <p className="mb-6 text-sm font-medium uppercase tracking-widest text-text-muted">Incoming voice call</p>
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
          <div className="call-ring absolute -inset-3 rounded-full" />
          {profile ? (
            <Avatar profile={profile} size="lg" className="relative h-28 w-28 text-4xl ring-4 ring-brand/50" />
          ) : (
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-brand text-4xl font-bold text-white ring-4 ring-brand/50">
              {callerName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <h2 className="text-2xl font-bold text-text-normal">{callerName}</h2>
        <p className="mt-2 text-text-muted">is calling you...</p>
        <div className="mt-10 flex gap-6">
          <button type="button" onClick={onReject} className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white shadow-lg transition-transform hover:scale-105" aria-label="Decline">
            <IconPhoneOff size={24} />
          </button>
          <button type="button" onClick={onAccept} className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white shadow-lg transition-transform hover:scale-105" aria-label="Accept">
            <IconPhone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function GroupRingOverlay({ groupName, onJoin, onDismiss }: {
  groupName: string; onJoin: () => void; onDismiss: () => void;
}) {
  return (
    <div className="call-enter fixed bottom-6 right-6 z-[100] w-80 rounded-xl border border-status-online/40 bg-bg-secondary p-4 shadow-2xl">
      <p className="text-xs font-bold uppercase text-status-online">Group call</p>
      <p className="mt-1 font-semibold text-text-normal">{groupName}</p>
      <p className="text-sm text-text-muted">Someone started a call in this group</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onJoin} className="flex-1 rounded bg-status-online py-2 text-sm font-semibold text-white">Join</button>
        <button type="button" onClick={onDismiss} className="rounded bg-interactive-hover px-4 py-2 text-sm">Dismiss</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timer                                                             */
/* ------------------------------------------------------------------ */

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* ------------------------------------------------------------------ */
/*  Call panel (DM / 1-1)                                             */
/* ------------------------------------------------------------------ */

interface CallPanelProps {
  title: string;
  subtitle: string;
  phase: "outgoing" | "active";
  peer?: Profile;
  selfProfile?: Profile | null;
  localStream?: MediaStream | null;
  /** Screen shares get tiles of their own so nobody is replaced by a desktop. */
  localScreen?: MediaStream | null;
  remoteScreen?: MediaStream | null;
  remoteStream?: MediaStream | null;
  connectedAt?: number | null;
  micMuted: boolean;
  deafened: boolean;
  cameraEnabled?: boolean;
  screenShareEnabled?: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
}

export function CallPanel({
  title, subtitle, phase, peer, selfProfile, localStream, remoteStream, localScreen, remoteScreen,
  connectedAt, micMuted, deafened, cameraEnabled, screenShareEnabled,
  onToggleMic, onToggleDeafen, onToggleCamera, onToggleScreenShare,
  onEnd, onOpenSettings,
}: CallPanelProps) {
  const { height: callHeight, setHeight: setCallHeight } = useCallHeight();
  const calling = phase === "outgoing";
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase !== "active" || !connectedAt) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.max(0, Date.now() - connectedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, connectedAt]);

  if (calling) {
    return (
      <div className="call-enter flex shrink-0 flex-col items-center justify-center bg-black py-10">
        <p className="mb-6 text-xs font-bold uppercase tracking-widest text-white/30">Calling</p>
        <div className="flex h-56 w-full max-w-3xl flex-col py-3">
          <CallGrid>
            {selfProfile && (
              <ParticipantTile profile={selfProfile} label="You" size="md" />
            )}
            {peer && (
              <ParticipantTile profile={peer} label={displayName(peer)} ring size="md" />
            )}
          </CallGrid>
        </div>
        <p className="mb-6 text-lg font-semibold text-white">{title}</p>
        <p className="mb-8 text-sm text-white/40">Ringing...</p>
        <CallControls
          micMuted={micMuted} deafened={deafened}
          cameraEnabled={cameraEnabled} screenShareEnabled={screenShareEnabled}
          onToggleMic={onToggleMic} onToggleDeafen={onToggleDeafen}
          onToggleCamera={onToggleCamera} onToggleScreenShare={onToggleScreenShare}
          onEnd={onEnd} onOpenSettings={onOpenSettings}
        />
      </div>
    );
  }

  return (
    <div
      className="call-enter flex shrink-0 flex-col overflow-hidden bg-black"
      style={{ height: callHeight }}
    >
     <div className="flex min-h-0 flex-1 flex-col items-center px-6 pt-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-widest text-white/30">
        Voice Connected
      </p>
      <p className="text-sm text-white/50">
        {elapsed > 0 ? formatElapsed(elapsed) : subtitle}
      </p>

      {/* The tile area is what gives up room when the call is made shorter,
          so the controls below are never pushed out of view. Tiles keep their
          shape while doing it — the area re-lays them out rather than
          flattening them. */}
      <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col py-3">
        <CallGrid>
          {selfProfile && (
            <ParticipantTile
              profile={selfProfile} stream={localStream} label="You"
              mirrored size="md"
            />
          )}
          {localScreen && (
            <ParticipantTile
              profile={selfProfile ?? undefined} stream={localScreen} isScreen
              label="Your screen" size="md"
            />
          )}
          {remoteScreen && peer && (
            <ParticipantTile
              profile={peer} stream={remoteScreen} isScreen
              label={`${displayName(peer)}'s screen`} size="md"
            />
          )}
          {peer && (
            <ParticipantTile
              profile={peer} stream={remoteStream}
              label={displayName(peer)} size="md"
            />
          )}
        </CallGrid>
      </div>

      <div className="shrink-0 pb-3 pt-1">
        <CallControls
          micMuted={micMuted} deafened={deafened}
          cameraEnabled={cameraEnabled} screenShareEnabled={screenShareEnabled}
          onToggleMic={onToggleMic} onToggleDeafen={onToggleDeafen}
          onToggleCamera={onToggleCamera} onToggleScreenShare={onToggleScreenShare}
          onEnd={onEnd} onOpenSettings={onOpenSettings}
        />
      </div>
     </div>
      <CallResizeHandle height={callHeight} onResize={setCallHeight} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Deprecated wrapper                                                */
/* ------------------------------------------------------------------ */

export function DmCallPanel(props: Omit<CallPanelProps, "title" | "subtitle"> & { peer: Profile; phase: "outgoing" | "active" }) {
  const { peer, phase, ...rest } = props;
  return (
    <CallPanel
      {...rest}
      phase={phase}
      peer={peer}
      title={displayName(peer)}
      subtitle={phase === "outgoing" ? "Calling..." : "Connected"}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Header phone button                                               */
/* ------------------------------------------------------------------ */

export function HeaderCallButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="Start voice call"
      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-status-online transition-all hover:bg-status-online/15 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <IconPhone size={20} />
    </button>
  );
}
