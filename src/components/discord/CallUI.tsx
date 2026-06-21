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
} from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";

interface CallControlsProps {
  micMuted: boolean;
  deafened: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
  size?: "compact" | "prominent";
}

export function CallControls({
  micMuted,
  deafened,
  onToggleMic,
  onToggleDeafen,
  onEnd,
  onOpenSettings,
  size = "compact",
}: CallControlsProps) {
  const prominent = size === "prominent";
  const btn = prominent ? "h-12 w-12" : "h-9 w-9";
  const icon = prominent ? 22 : 16;

  return (
    <div className={`flex items-center ${prominent ? "justify-center gap-6" : "gap-2"}`}>
      {[
        { onClick: onToggleMic, title: micMuted ? "Unmute" : "Mute", active: micMuted, on: IconMic, off: IconMicOff, label: micMuted ? "Unmute" : "Mute" },
        { onClick: onToggleDeafen, title: deafened ? "Undeafen" : "Deafen", active: deafened, on: IconHeadphones, off: IconHeadphonesOff, label: deafened ? "Undeafen" : "Deafen" },
        { onClick: onEnd, title: "End call", active: false, on: IconPhoneOff, off: IconPhoneOff, label: "End", danger: true },
        ...(onOpenSettings ? [{ onClick: onOpenSettings, title: "Settings", active: false, on: IconSettings, off: IconSettings, label: "Settings" }] : []),
      ].map((item) => {
        const Icon = item.active && "off" in item && item.off ? item.off : item.on;
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
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white shadow-lg transition-transform hover:scale-105"
            aria-label="Decline"
          >
            <IconPhoneOff size={24} />
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white shadow-lg transition-transform hover:scale-105"
            aria-label="Accept"
          >
            <IconPhone size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface DmCallPanelProps {
  peer: Profile;
  phase: "outgoing" | "active";
  micMuted: boolean;
  deafened: boolean;
  onToggleMic: () => void;
  onToggleDeafen: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
}

/** Prominent in-DM voice call card — easy to spot while chatting. */
export function DmCallPanel({
  peer,
  phase,
  micMuted,
  deafened,
  onToggleMic,
  onToggleDeafen,
  onEnd,
  onOpenSettings,
}: DmCallPanelProps) {
  const calling = phase === "outgoing";

  return (
    <div className="shrink-0 border-b border-status-online/30 bg-gradient-to-b from-status-online/[0.12] to-bg-primary px-4 py-4">
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-status-online/35 bg-[#1e1f22] shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_1px_rgba(35,165,89,0.15)]">
        <div className="relative px-5 pb-5 pt-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-status-online to-transparent opacity-80" />

          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {calling && (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-status-online/25" />
                  <span className="absolute inset-[-4px] animate-pulse rounded-full border-2 border-status-online/40" />
                </>
              )}
              <Avatar profile={peer} size="lg" className="relative h-16 w-16 text-xl ring-[3px] ring-status-online/50" />
              {!calling && (
                <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-[#1e1f22] bg-status-online" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-online/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-status-online">
                  <span className={`h-1.5 w-1.5 rounded-full bg-status-online ${calling ? "animate-pulse" : ""}`} />
                  Voice Call
                </span>
              </div>
              <p className="mt-1 truncate text-lg font-bold text-text-normal">{displayName(peer)}</p>
              <p className="text-sm text-text-muted">
                {calling ? "Calling… waiting for answer" : "Connected — you're live"}
              </p>
            </div>
          </div>

          <div className="mt-5 border-t border-white/5 pt-4">
            <CallControls
              size="prominent"
              micMuted={micMuted}
              deafened={deafened}
              onToggleMic={onToggleMic}
              onToggleDeafen={onToggleDeafen}
              onEnd={onEnd}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface DmCallStartProps {
  onStart: () => void;
  disabled?: boolean;
}

export function DmCallStartBar({ onStart, disabled }: DmCallStartProps) {
  return (
    <div className="shrink-0 border-b border-black/20 px-4 py-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onStart}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-status-online/30 bg-status-online/10 px-4 py-2 text-sm font-semibold text-status-online transition-all hover:bg-status-online/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconPhone size={16} />
        Start Voice Call
      </button>
    </div>
  );
}

/** @deprecated Use DmCallPanel */
export function ActiveCallBanner(props: DmCallPanelProps) {
  return <DmCallPanel {...props} />;
}
