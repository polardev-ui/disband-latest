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
} from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";
import { useEffect, useRef } from "react";
import { useLiveVideoStream } from "@/hooks/useLiveVideoStream";

interface CallControlsProps {
  micMuted: boolean;
  deafened: boolean;
  cameraEnabled?: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCamera?: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
  size?: "compact" | "prominent";
}

export function CallControls({
  micMuted,
  deafened,
  cameraEnabled,
  onToggleMic,
  onToggleDeafen,
  onToggleCamera,
  onEnd,
  onOpenSettings,
  size = "compact",
}: CallControlsProps) {
  const prominent = size === "prominent";
  const btn = prominent ? "h-12 w-12" : "h-9 w-9";
  const icon = prominent ? 22 : 16;

  const items = [
    { onClick: onToggleMic, title: micMuted ? "Unmute" : "Mute", active: micMuted, on: IconMic, off: IconMicOff, label: micMuted ? "Unmute" : "Mute" },
    { onClick: onToggleDeafen, title: deafened ? "Undeafen" : "Deafen", active: deafened, on: IconHeadphones, off: IconHeadphonesOff, label: deafened ? "Undeafen" : "Deafen" },
    ...(onToggleCamera ? [{ onClick: onToggleCamera, title: cameraEnabled ? "Stop video" : "Start video", active: !!cameraEnabled, on: IconVideo, off: IconVideoOff, label: cameraEnabled ? "Video off" : "Video" }] : []),
    { onClick: onEnd, title: "End call", active: false, on: IconPhoneOff, off: IconPhoneOff, label: "End", danger: true },
    ...(onOpenSettings ? [{ onClick: onOpenSettings, title: "Settings", active: false, on: IconSettings, off: IconSettings, label: "Settings" }] : []),
  ];

  return (
    <div className={`flex items-center ${prominent ? "justify-center gap-6" : "gap-2"}`}>
      {items.map((item) => {
        const Icon = item.active && item.off ? item.off : item.on;
        const inner = (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            title={item.title}
            className={`flex ${btn} items-center justify-center rounded-full transition-all ${
              "danger" in item && item.danger
                ? "bg-status-dnd text-white shadow-lg shadow-status-dnd/30 hover:scale-105 hover:brightness-110"
                : item.active
                  ? "bg-status-dnd/25 text-status-dnd ring-2 ring-status-dnd/40"
                  : "bg-bg-accent text-text-normal hover:bg-interactive-hover hover:scale-105"
            }`}
          >
            <Icon size={icon} />
          </button>
        );
        if (!prominent) return inner;
        return (
          <div key={item.label} className="flex flex-col items-center gap-1.5">
            {inner}
            <span className="text-[11px] font-medium text-text-muted">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function VideoTile({
  stream,
  label,
  mirrored,
  placeholder,
}: {
  stream: MediaStream | null;
  label: string;
  mirrored?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = useLiveVideoStream(stream);

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream, hasVideo]);

  if (hasVideo) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <video ref={ref} autoPlay playsInline muted={mirrored} className={`aspect-video max-h-52 w-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`} />
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{label}</span>
      </div>
    );
  }

  if (placeholder) {
    return (
      <div className="relative flex aspect-video max-h-52 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/50">
        <span className="text-xs text-text-muted">{placeholder}</span>
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{label}</span>
      </div>
    );
  }

  return null;
}

interface IncomingCallOverlayProps {
  callerName: string;
  profile?: Profile;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallOverlay({ callerName, profile, onAccept, onReject }: IncomingCallOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md">
      <div className="flex flex-col items-center px-8 text-center">
        <p className="mb-6 text-sm font-medium uppercase tracking-widest text-text-muted">Incoming voice call</p>
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
          {profile ? (
            <Avatar profile={profile} size="lg" className="relative h-28 w-28 text-4xl ring-4 ring-brand/50" />
          ) : (
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-brand text-4xl font-bold text-white ring-4 ring-brand/50">
              {callerName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <h2 className="text-2xl font-bold text-text-normal">{callerName}</h2>
        <p className="mt-2 text-text-muted">is calling you…</p>
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

interface GroupRingOverlayProps {
  groupName: string;
  onJoin: () => void;
  onDismiss: () => void;
}

export function GroupRingOverlay({ groupName, onJoin, onDismiss }: GroupRingOverlayProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] w-80 rounded-xl border border-status-online/40 bg-bg-secondary p-4 shadow-2xl">
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

interface CallPanelProps {
  title: string;
  subtitle: string;
  phase: "outgoing" | "active";
  peer?: Profile;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  remoteStreams?: Map<string, MediaStream>;
  remoteLabels?: Map<string, string>;
  micMuted: boolean;
  deafened: boolean;
  cameraEnabled?: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onToggleCamera?: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
}

export function CallPanel({
  title,
  subtitle,
  phase,
  peer,
  localStream,
  remoteStream,
  remoteStreams,
  remoteLabels,
  micMuted,
  deafened,
  cameraEnabled,
  onToggleMic,
  onToggleDeafen,
  onToggleCamera,
  onEnd,
  onOpenSettings,
}: CallPanelProps) {
  const calling = phase === "outgoing";

  return (
    <div className="shrink-0 border-b border-status-online/30 bg-gradient-to-b from-status-online/[0.12] to-bg-primary px-4 py-4">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-status-online/35 bg-[#1e1f22] shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_1px_rgba(35,165,89,0.15)]">
        <div className="relative px-5 pb-5 pt-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-status-online to-transparent opacity-80" />

          <div className="flex items-center gap-4">
            {peer && (
              <div className="relative shrink-0">
                {calling && (
                  <>
                    <span className="absolute inset-0 animate-ping rounded-full bg-status-online/25" />
                    <span className="absolute inset-[-4px] animate-pulse rounded-full border-2 border-status-online/40" />
                  </>
                )}
                <Avatar profile={peer} size="lg" className="relative h-14 w-14 text-lg ring-[3px] ring-status-online/50" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-status-online/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-status-online">
                <span className={`h-1.5 w-1.5 rounded-full bg-status-online ${calling ? "animate-pulse" : ""}`} />
                {calling ? "Calling" : "In Call"}
              </span>
              <p className="mt-1 truncate text-lg font-bold text-text-normal">{title}</p>
              <p className="text-sm text-text-muted">{subtitle}</p>
            </div>
          </div>

          {(localStream || remoteStream || cameraEnabled || (remoteStreams && remoteStreams.size > 0)) && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(localStream || cameraEnabled) && (
                <VideoTile
                  stream={localStream ?? null}
                  label="You"
                  mirrored
                  placeholder={cameraEnabled ? "Starting your camera…" : undefined}
                />
              )}
              {remoteStream && <VideoTile stream={remoteStream} label={peer ? displayName(peer) : "Remote"} />}
              {remoteStreams && [...remoteStreams.entries()].map(([id, stream]) => (
                <VideoTile key={id} stream={stream} label={remoteLabels?.get(id) ?? "Member"} />
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-white/5 pt-4">
            <CallControls
              size="prominent"
              micMuted={micMuted}
              deafened={deafened}
              cameraEnabled={cameraEnabled}
              onToggleMic={onToggleMic}
              onToggleDeafen={onToggleDeafen}
              onToggleCamera={onToggleCamera}
              onEnd={onEnd}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** @deprecated */
export function DmCallPanel(props: Omit<CallPanelProps, "title" | "subtitle"> & { peer: Profile; phase: "outgoing" | "active" }) {
  const { peer, phase, ...rest } = props;
  return (
    <CallPanel
      {...rest}
      phase={phase}
      peer={peer}
      title={displayName(peer)}
      subtitle={phase === "outgoing" ? "Calling… waiting for answer" : "Connected — you're live"}
    />
  );
}

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
