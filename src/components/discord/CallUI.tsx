"use client";

import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { IconMic, IconMicOff, IconHeadphones, IconHeadphonesOff, IconPhoneOff, IconPhone, IconSettings } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";

interface CallControlsProps {
  micMuted: boolean;
  deafened: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
  compact?: boolean;
}

export function CallControls({
  micMuted,
  deafened,
  onToggleMic,
  onToggleDeafen,
  onEnd,
  onOpenSettings,
  compact,
}: CallControlsProps) {
  const btn = compact ? "h-9 w-9" : "h-11 w-11";
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "mt-4"}`}>
      <button
        type="button"
        onClick={onToggleMic}
        title={micMuted ? "Unmute" : "Mute"}
        className={`flex ${btn} items-center justify-center rounded-full transition-colors ${
          micMuted ? "bg-status-dnd/20 text-status-dnd" : "bg-bg-accent text-text-normal hover:bg-interactive-hover"
        }`}
      >
        {micMuted ? <IconMicOff size={compact ? 16 : 20} /> : <IconMic size={compact ? 16 : 20} />}
      </button>
      <button
        type="button"
        onClick={onToggleDeafen}
        title={deafened ? "Undeafen" : "Deafen"}
        className={`flex ${btn} items-center justify-center rounded-full transition-colors ${
          deafened ? "bg-status-dnd/20 text-status-dnd" : "bg-bg-accent text-text-normal hover:bg-interactive-hover"
        }`}
      >
        {deafened ? <IconHeadphonesOff size={compact ? 16 : 20} /> : <IconHeadphones size={compact ? 16 : 20} />}
      </button>
      <button
        type="button"
        onClick={onEnd}
        title="End call"
        className={`flex ${btn} items-center justify-center rounded-full bg-status-dnd text-white hover:opacity-90`}
      >
        <IconPhoneOff size={compact ? 16 : 20} />
      </button>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className={`flex ${btn} items-center justify-center rounded-full bg-bg-accent text-text-muted hover:bg-interactive-hover hover:text-text-normal`}
        >
          <IconSettings size={compact ? 16 : 20} />
        </button>
      )}
    </div>
  );
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
          <button
            type="button"
            onClick={onReject}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white shadow-lg hover:scale-105 transition-transform"
            aria-label="Decline"
          >
            <IconPhoneOff size={24} />
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white shadow-lg hover:scale-105 transition-transform"
            aria-label="Accept"
          >
            <IconPhone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ActiveCallBannerProps {
  peer: Profile;
  phase: "outgoing" | "active";
  micMuted: boolean;
  deafened: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
}

export function ActiveCallBanner({
  peer,
  phase,
  micMuted,
  deafened,
  onToggleMic,
  onToggleDeafen,
  onEnd,
  onOpenSettings,
}: ActiveCallBannerProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-status-online/20 bg-gradient-to-r from-status-online/10 to-brand/5 px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar profile={peer} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{displayName(peer)}</p>
          <p className="text-xs text-text-muted">{phase === "outgoing" ? "Calling…" : "Voice connected"}</p>
        </div>
      </div>
      <CallControls
        compact
        micMuted={micMuted}
        deafened={deafened}
        onToggleMic={onToggleMic}
        onToggleDeafen={onToggleDeafen}
        onEnd={onEnd}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
