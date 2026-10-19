"use client";

import { Soundboard } from "./Soundboard";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import {
  IconMic,
  IconMicOff,
  IconHeadphones,
  IconHeadphonesOff,
  IconPhoneOff,
  IconPhone,
  IconVideo,
  IconVideoOff,
  IconScreenShare,
  IconScreenShareOff,
} from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";
import { useEffect, useRef, useState } from "react";
import { CallResizeHandle, useCallHeight } from "./CallResizer";
import { CallStage } from "./CallStage";
import { Tooltip } from "./Tooltip";

interface CallControlsProps {
  micMuted: boolean;
  deafened: boolean;
  cameraEnabled?: boolean;
  screenShareEnabled?: boolean;
  onToggleMic: () => void;
  /** Omitted where deafening isn't wired (group calls). */
  onToggleDeafen?: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  onEnd: () => void;
  onOpenSettings?: () => void;
}

export function CallControls({
  micMuted, deafened, cameraEnabled, screenShareEnabled,
  onToggleMic, onToggleDeafen, onToggleCamera, onToggleScreenShare,
  onEnd,
}: CallControlsProps) {
  return (
    <div className="flex items-center gap-4">
      {onToggleCamera && (
        <CallButton label={cameraEnabled ? "Turn Off Camera" : "Turn On Camera"} on={!!cameraEnabled} onClick={onToggleCamera}>
          {cameraEnabled ? <IconVideo size={24} /> : <IconVideoOff size={24} />}
        </CallButton>
      )}
      {onToggleScreenShare && (
        <CallButton label={screenShareEnabled ? "Stop Streaming" : "Share Your Screen"} on={!!screenShareEnabled} onClick={onToggleScreenShare}>
          {screenShareEnabled ? <IconScreenShareOff size={24} /> : <IconScreenShare size={24} />}
        </CallButton>
      )}
      <Soundboard compact />
      <CallButton label={micMuted ? "Unmute" : "Mute"} warn={micMuted} onClick={onToggleMic}>
        {micMuted ? <IconMicOff size={24} /> : <IconMic size={24} />}
      </CallButton>
      {onToggleDeafen && (
        <CallButton label={deafened ? "Undeafen" : "Deafen"} warn={deafened} onClick={onToggleDeafen}>
          {deafened ? <IconHeadphonesOff size={24} /> : <IconHeadphones size={24} />}
        </CallButton>
      )}
      <CallButton label="Disconnect" danger onClick={onEnd}>
        <IconPhoneOff size={24} />
      </CallButton>
    </div>
  );
}

/**
 * The classic 56px call button: dark at rest, white when a feature is on,
 * white with a red glyph when you're muted or deafened, red to hang up.
 */
function CallButton({
  label,
  on,
  warn,
  danger,
  onClick,
  children,
}: {
  label: string;
  on?: boolean;
  warn?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={on || warn || undefined}
        className={`flex h-14 w-14 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95 ${
          danger
            ? "bg-status-dnd text-white hover:bg-button-danger-hover"
            : warn
              ? "bg-white text-status-dnd hover:bg-[#e3e5e8]"
              : on
                ? "bg-white text-[#313338] hover:bg-[#e3e5e8]"
                : "bg-[#2b2d31] text-white hover:bg-[#404249]"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function IncomingCallOverlay({ callerName, profile, onAccept, onReject }: {
  callerName: string; profile?: Profile; onAccept: () => void; onReject: () => void;
}) {
  // The classic incoming-call card: a small dark panel with the caller's
  // avatar ringing, and accept/decline buttons underneath.
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      <div className="call-enter pointer-events-auto flex w-[250px] flex-col items-center rounded-lg bg-bg-floating px-4 pb-6 pt-8 text-center shadow-[var(--elevation-high)]">
        <div className="relative mb-4">
          <div className="call-ring absolute -inset-2 rounded-full" />
          {profile ? (
            <Avatar profile={profile} size="lg" className="relative !h-20 !w-20 !text-3xl" />
          ) : (
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand text-3xl font-bold text-white">
              {callerName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <h2 className="max-w-full truncate text-[20px] font-semibold leading-6 text-header-primary">{callerName}</h2>
        <p className="mt-1 text-[14px] text-header-secondary">Incoming Call…</p>
        <div className="mt-8 flex gap-12">
          <Tooltip label="Decline" side="top">
            <button type="button" onClick={onReject} className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:bg-button-danger-hover" aria-label="Decline">
              <IconPhoneOff size={24} />
            </button>
          </Tooltip>
          <Tooltip label="Accept" side="top">
            <button type="button" onClick={onAccept} className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white transition-colors hover:bg-button-green" aria-label="Accept">
              <IconPhone size={24} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export function GroupRingOverlay({ groupName, onJoin, onDismiss }: {
  groupName: string; onJoin: () => void; onDismiss: () => void;
}) {
  return (
    <div className="call-enter fixed bottom-4 left-4 right-4 z-[100] rounded-lg bg-bg-floating p-4 shadow-[var(--elevation-high)] sm:left-auto sm:w-80">
      <p className="text-[12px] font-bold uppercase leading-4 text-status-online">Incoming Group Call</p>
      <p className="mt-1 text-[16px] font-semibold text-header-primary">{groupName}</p>
      <p className="text-[14px] text-header-secondary">Someone started a call in this group</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onJoin} className="h-[38px] flex-1 rounded-[3px] bg-button-green text-[14px] font-medium text-white hover:bg-button-green-hover">Join Call</button>
        <button type="button" onClick={onDismiss} className="h-[38px] rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white hover:bg-button-secondary-hover">Ignore</button>
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface CallPanelProps {
  title: string;
  subtitle: string;
  phase: "outgoing" | "active";
  peer?: Profile;
  selfProfile?: Profile | null;
  localStream?: MediaStream | null;

  localScreen?: MediaStream | null;
  remoteScreen?: MediaStream | null;
  remoteScreenAudio?: MediaStream | null;
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
  title, subtitle, phase, peer, selfProfile, localStream, remoteStream, localScreen, remoteScreen, remoteScreenAudio,
  connectedAt, micMuted, deafened, cameraEnabled, screenShareEnabled,
  onToggleMic, onToggleDeafen, onToggleCamera, onToggleScreenShare,
  onEnd, onOpenSettings,
}: CallPanelProps) {
  const { height: callHeight, setHeight: setCallHeight } = useCallHeight();
  // While a share or camera is focused the panel takes most of the window,
  // without overwriting the height you dragged it to.
  const [focused, setFocused] = useState(false);
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

        {/* Was h-44 (176px) for two 16:9 tiles side by side, which is the
            squashed strip in the screenshot. Sized to the viewport now. */}
        <div
          className="flex w-full max-w-4xl shrink-0 flex-col px-6 py-3"
          style={{ height: "min(42vh, 380px)" }}
        >
          <CallStage
            deafened={deafened}
            screens={[]}
            members={[
              ...(selfProfile ? [{ id: "self", profile: selfProfile, label: "You", stream: localStream, mirrored: true, muted: micMuted }] : []),
              ...(peer ? [{ id: peer.id, profile: peer, label: displayName(peer), ringing: true }] : []),
            ]}
          />
        </div>
        <p className="mb-1 text-[20px] font-semibold text-white">{title}</p>
        <p className="mb-8 text-[14px] text-white/60">{subtitle || "Ringing…"}</p>
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
      style={{ height: focused ? Math.max(callHeight, Math.round(window.innerHeight * 0.8)) : callHeight }}
    >
     <div className="flex min-h-0 flex-1 flex-col items-center px-6 pt-3">
      <p className="self-start rounded-[4px] bg-black/60 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-white/80">
        {elapsed > 0 ? formatElapsed(elapsed) : subtitle}
      </p>

      {}
      <div className={`flex min-h-0 w-full ${focused ? "max-w-none" : "max-w-3xl"} flex-1 flex-col py-3`}>
        <CallStage
          deafened={deafened}
          onFocusChange={setFocused}
          screens={[
            ...(localScreen ? [{ id: "screen:self", profile: selfProfile ?? undefined, label: "Your screen", stream: localScreen, local: true }] : []),
            ...(remoteScreen && peer
              ? [{ id: `screen:${peer.id}`, profile: peer, label: `${displayName(peer)}'s screen`, stream: remoteScreen, audio: remoteScreenAudio }]
              : []),
          ]}
          members={[
            ...(selfProfile ? [{ id: "self", profile: selfProfile, label: "You", stream: localStream, mirrored: true, muted: micMuted }] : []),
            ...(peer ? [{ id: peer.id, profile: peer, label: displayName(peer), stream: remoteStream }] : []),
          ]}
        />
      </div>

      <div className="shrink-0 pb-6 pt-2">
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
