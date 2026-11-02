"use client";

import { useI18n } from "@/contexts/I18nContext";
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
import { StreamMenuButton } from "./StreamMenu";

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
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-4">
      {onToggleCamera && (
        <CallButton label={cameraEnabled ? t("Turn Off Camera") : t("Turn On Camera")} on={!!cameraEnabled} onClick={onToggleCamera}>
          {cameraEnabled ? <IconVideo size={24} /> : <IconVideoOff size={24} />}
        </CallButton>
      )}
      {onToggleScreenShare && (
        <div className="flex items-center gap-1">
          <CallButton label={screenShareEnabled ? t("Stop Streaming") : t("Share Your Screen")} on={!!screenShareEnabled} onClick={onToggleScreenShare}>
            {screenShareEnabled ? <IconScreenShareOff size={24} /> : <IconScreenShare size={24} />}
          </CallButton>
          <StreamMenuButton sharing={!!screenShareEnabled} onToggle={onToggleScreenShare} />
        </div>
      )}
      <Soundboard compact />
      <CallButton label={micMuted ? t("Unmute") : t("Mute")} warn={micMuted} onClick={onToggleMic}>
        {micMuted ? <IconMicOff size={24} /> : <IconMic size={24} />}
      </CallButton>
      {onToggleDeafen && (
        <CallButton label={deafened ? t("Undeafen") : t("Deafen")} warn={deafened} onClick={onToggleDeafen}>
          {deafened ? <IconHeadphonesOff size={24} /> : <IconHeadphones size={24} />}
        </CallButton>
      )}
      <CallButton label={t("Disconnect")} danger onClick={onEnd}>
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
  const { t } = useI18n();
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={t(label)}
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
  const { t } = useI18n();
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
        <p className="mt-1 text-[14px] text-header-secondary">{t("Incoming Call…")}</p>
        <div className="mt-8 flex gap-12">
          <Tooltip label={t("Decline")} side="top">
            <button type="button" onClick={onReject} className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-white transition-colors hover:bg-button-danger-hover" aria-label={t("Decline")}>
              <IconPhoneOff size={24} />
            </button>
          </Tooltip>
          <Tooltip label={t("Accept")} side="top">
            <button type="button" onClick={onAccept} className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white transition-colors hover:bg-button-green" aria-label={t("Accept")}>
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
  const { t } = useI18n();
  return (
    <div className="call-enter fixed bottom-4 left-4 right-4 z-[100] rounded-lg bg-bg-floating p-4 shadow-[var(--elevation-high)] sm:left-auto sm:w-80">
      <p className="text-[12px] font-bold uppercase leading-4 text-status-online">{t("Incoming Group Call")}</p>
      <p className="mt-1 text-[16px] font-semibold text-header-primary">{groupName}</p>
      <p className="text-[14px] text-header-secondary">{t("Someone started a call in this group")}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onJoin} className="h-[38px] flex-1 rounded-[3px] bg-button-green text-[14px] font-medium text-white hover:bg-button-green-hover">{t("Join Call")}</button>
        <button type="button" onClick={onDismiss} className="h-[38px] rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white hover:bg-button-secondary-hover">{t("Ignore")}</button>
      </div>
    </div>
  );
}

/**
 * The small connection line used by every voice surface. `connected` must
 * come from the peer connection, not from `joined`: joining only means the
 * microphone is live, and on a slow ICE path the first words arrive seconds
 * later. Until then this says "Connecting…" rather than "Voice Connected".
 */
export function VoiceStatus({
  connected,
  elapsed = null,
  label = "Voice Connected",
  className = "",
}: {
  connected: boolean;
  elapsed?: number | null;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium leading-4 ${
        connected ? "text-status-online" : "text-header-secondary"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${
          connected ? "bg-status-online" : "bg-status-idle animate-pulse"
        }`}
      />
      {connected ? (
        <span className="truncate">
          {label}
          {elapsed !== null && elapsed >= 0 ? ` · ${formatElapsed(elapsed)}` : ""}
        </span>
      ) : (
        <span className="truncate">{t("Connecting…")}</span>
      )}
    </span>
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
  connected?: boolean;
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
  title, subtitle, phase, connected = false, peer, selfProfile, localStream, remoteStream, localScreen, remoteScreen, remoteScreenAudio,
  connectedAt, micMuted, deafened, cameraEnabled, screenShareEnabled,
  onToggleMic, onToggleDeafen, onToggleCamera, onToggleScreenShare,
  onEnd, onOpenSettings,
}: CallPanelProps) {
  const { t } = useI18n();
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
      <div className="call-enter flex shrink-0 flex-col bg-bg-primary">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-divider px-4">
          <span className="truncate text-[14px] font-semibold text-header-primary">{title}</span>
          <span className="ml-auto flex items-center gap-1.5 text-[12px] font-medium leading-4 text-header-secondary">
            <span aria-hidden className="h-2 w-2 rounded-full bg-status-idle animate-pulse" />
            {t("Calling…")}
          </span>
        </div>

        {/* Was h-44 (176px) for two 16:9 tiles side by side, which is the
            squashed strip in the screenshot. Sized to the viewport now. */}
        <div
          className="mx-auto flex w-full max-w-4xl shrink-0 flex-col px-6 py-3"
          style={{ height: "min(42vh, 380px)" }}
        >
          <CallStage
            deafened={deafened}
            screens={[]}
            members={[
              ...(selfProfile ? [{ id: "self", profile: selfProfile, label: t("You"), stream: localStream, mirrored: true, muted: micMuted }] : []),
              ...(peer ? [{ id: peer.id, profile: peer, label: displayName(peer), ringing: true }] : []),
            ]}
          />
        </div>
        <p className="mb-8 text-center text-[14px] text-header-secondary">{subtitle || t("Ringing…")}</p>
        <div className="flex justify-center pb-6">
          <CallControls
            micMuted={micMuted} deafened={deafened}
            cameraEnabled={cameraEnabled} screenShareEnabled={screenShareEnabled}
            onToggleMic={onToggleMic} onToggleDeafen={onToggleDeafen}
            onToggleCamera={onToggleCamera} onToggleScreenShare={onToggleScreenShare}
            onEnd={onEnd} onOpenSettings={onOpenSettings}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="call-enter flex shrink-0 flex-col overflow-hidden bg-bg-primary"
      style={{ height: focused ? Math.max(callHeight, Math.round(window.innerHeight * 0.8)) : callHeight }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-divider px-4">
        <span className="truncate text-[14px] font-semibold text-header-primary">{title}</span>
        <VoiceStatus
          className="ml-auto"
          connected={connected}
          elapsed={connected ? elapsed : null}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center px-6 pt-3">
        <div className={`flex min-h-0 w-full ${focused ? "max-w-none" : "max-w-3xl"} flex-1 flex-col py-3`}>
          <CallStage
            deafened={deafened}
            onFocusChange={setFocused}
            screens={[
              ...(localScreen ? [{ id: "screen:self", profile: selfProfile ?? undefined, label: t("Your screen"), stream: localScreen, local: true }] : []),
              ...(remoteScreen && peer
                ? [{ id: `screen:${peer.id}`, profile: peer, label: t("{name}'s screen", { name: displayName(peer) }), stream: remoteScreen, audio: remoteScreenAudio }]
                : []),
            ]}
            members={[
              ...(selfProfile ? [{ id: "self", profile: selfProfile, label: t("You"), stream: localStream, mirrored: true, muted: micMuted }] : []),
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
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={t("Start voice call")}
      className="flex h-6 w-6 shrink-0 items-center justify-center text-status-online transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <IconPhone size={22} />
    </button>
  );
}
