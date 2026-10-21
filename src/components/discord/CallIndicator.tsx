"use client";

import { useEffect, useState } from "react";
import { IconPhoneOff, IconScreenShare, IconVideo } from "@/components/icons";
import { getCallIndicatorState, subscribeCallIndicator, type CallIndicatorState } from "@/lib/call-status";
import { useVoiceSession } from "@/contexts/VoiceSessionContext";
import { Tooltip } from "./Tooltip";
import { Soundboard } from "./Soundboard";

function connectionQuality(): "good" | "ok" | "bad" {
  if (typeof navigator === "undefined" || !("connection" in navigator)) return "good";
  const et = (navigator.connection as { effectiveType?: string } | undefined)?.effectiveType;
  if (et === "slow-2g" || et === "2g") return "bad";
  if (et === "3g") return "ok";
  return "good";
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Signal bars, the "you're connected" glyph from the classic RTC panel. */
function SignalIcon({ quality }: { quality: "good" | "ok" | "bad" }) {
  const color = quality === "good" ? "var(--status-online)" : quality === "ok" ? "var(--status-idle)" : "var(--status-dnd)";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden style={{ color }}>
      <rect x="3" y="15" width="3.5" height="5" rx="1" fill="currentColor" />
      <rect x="8.5" y="11" width="3.5" height="9" rx="1" fill="currentColor" />
      <rect x="14" y="7" width="3.5" height="13" rx="1" fill="currentColor" opacity={quality === "bad" ? 0.3 : 1} />
      <rect x="19.5" y="3" width="3.5" height="17" rx="1" fill="currentColor" opacity={quality === "good" ? 1 : 0.3} />
    </svg>
  );
}

/**
 * The "Voice Connected" card that sits above the user panel while you're in a
 * call or voice channel, laid out like the classic RTC connection panel.
 */
export function CallIndicator() {
  const [state, setState] = useState<CallIndicatorState>(() => getCallIndicatorState());
  const [now, setNow] = useState(() => Date.now());
  const [quality, setQuality] = useState(connectionQuality);
  const session = useVoiceSession();

  useEffect(() => subscribeCallIndicator(() => setState(getCallIndicatorState())), []);

  useEffect(() => {
    if (!state.active) return;
    const id = setInterval(() => {
      setNow(Date.now());
      setQuality(connectionQuality());
    }, 1000);
    return () => clearInterval(id);
  }, [state.active]);

  if (!state.active) return null;

  // Voice channels are owned by the voice session; calls pass their own controls.
  const voice = state.kind === "voice";
  const hangup = state.hangup ?? (voice ? () => void session.disconnect() : null);
  const camera = state.camera ?? (voice ? { on: session.cameraEnabled, toggle: () => void session.toggleCamera() } : null);
  const screen = state.screen ?? (voice ? { on: session.screenEnabled, toggle: () => void session.toggleScreenShare() } : null);
  // Presence is written before the peer connection is ready, so the card must
  // wait for a connected peer (or for nobody else to be in the channel).
  const voiceConnected = session.joined &&
    (session.participants.length <= 1 || session.connectedPeerIds.size > 0);
  const connected = voice ? voiceConnected : !!state.connected;
  const elapsed = connected && state.startedAt ? formatElapsed(Math.max(0, now - state.startedAt)) : null;

  return (
    <div className="rtc-enter shrink-0 border-b border-divider/60 bg-bg-secondary-alt px-2 pb-2 pt-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 pl-1">
          <div className="flex items-center gap-1">
            <SignalIcon quality={quality} />
            <span className="truncate text-[14px] font-semibold leading-[18px]" style={{ color: quality === "bad" ? "var(--status-dnd)" : "var(--status-online)" }}>
              {connected ? "Voice Connected" : "Connecting…"}
            </span>
          </div>
          <button
            type="button"
            disabled={!state.focus}
            onClick={state.focus ?? undefined}
            className="block max-w-full truncate text-left text-[12px] leading-4 text-header-secondary enabled:hover:underline disabled:cursor-default"
          >
            {state.label.replace(/^In /, "")}
            {state.sublabel ? ` / ${state.sublabel}` : ""}
            {elapsed ? ` · ${elapsed}` : ""}
          </button>
        </div>
        {hangup && (
          <Tooltip label="Disconnect" side="top">
            <button
              type="button"
              onClick={hangup}
              aria-label="Disconnect"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
            >
              <IconPhoneOff size={20} />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        {camera && (
          <PanelButton label={camera.on ? "Turn Off Camera" : "Turn On Camera"} active={camera.on} onClick={camera.toggle}>
            <IconVideo size={18} />
          </PanelButton>
        )}
        {screen && (
          <PanelButton label={screen.on ? "Stop Streaming" : "Share Your Screen"} active={screen.on} onClick={screen.toggle}>
            <IconScreenShare size={18} />
          </PanelButton>
        )}
        <Soundboard variant="panel" />
      </div>
    </div>
  );
}

function PanelButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <Tooltip label={label} side="top" as="div" className="w-full">
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={`flex h-8 w-full items-center justify-center rounded-[4px] transition-colors ${
            active ? "bg-status-online text-white" : "bg-bg-secondary text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
          }`}
        >
          {children}
        </button>
      </Tooltip>
    </div>
  );
}
