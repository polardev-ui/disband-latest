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
import { CallStage } from "./CallStage";

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
    // Deafen gets the brand treatment (not the mic's red): at a glance,
    // red ring = muted mic, blue ring = deafened.
    { onClick: onToggleDeafen, title: deafened ? "Undeafen" : "Deafen", active: deafened, on: IconHeadphones, off: IconHeadphonesOff, brand: true },
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
                    ? "brand" in item && item.brand
                      ? "bg-brand/25 text-brand ring-2 ring-brand/40"
                      : "bg-status-dnd/25 text-status-dnd ring-2 ring-status-dnd/40"
                    // Inactive controls use the theme text color at low alpha
                    // (not white): this component renders on black call
                    // panels and on the themed voice lobby alike.
                    : "bg-text-normal/10 text-text-normal hover:bg-text-normal/20 hover:scale-105"
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}

export function IncomingCallOverlay({ callerName, profile, onAccept, onReject }: {
  callerName: string; profile?: Profile; onAccept: () => void; onReject: () => void;
}) {
  return (
    <div className="overlay-fade fixed inset-0 z-[100] flex items-center justify-center bg-overlay-scrim-strong backdrop-blur-md">
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
    <div className="call-enter fixed bottom-4 left-4 right-4 z-[100] rounded-xl border border-status-online/40 bg-bg-secondary p-4 shadow-2xl sm:left-auto sm:w-80">
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
        <p className="mb-6 text-lg font-semibold text-white">{title}</p>
        <p className="mb-8 text-sm text-white/40">{subtitle || "Ringing..."}</p>
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

      {}
      <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col py-3">
        <CallStage
          deafened={deafened}
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
