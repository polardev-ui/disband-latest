"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { pushEscapeHandler } from "@/lib/overlay";
import { Avatar } from "@/components/ui/Avatar";
import { IconMaximize, IconMicOff, IconSpeaker, IconSpeakerOff } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";
import { streamHasLiveVideo } from "@/lib/webrtc";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";
import { getParticipantControls, setParticipantControl, applyParticipantAudioControls, type ParticipantControls } from "@/lib/call-participant-settings";
import { playScreenShareJingle } from "@/lib/ringtone";
import { useLiveVideoStream } from "@/hooks/useLiveVideoStream";
import { CallGrid } from "./CallTile";
import { useI18n } from "@/contexts/I18nContext";

/**
 * The middle of every call — DM and group — laid out the way Discord does it:
 *
 *  - Nobody on camera and nobody sharing → a row of avatar circles. No video
 *    boxes around people who have no video.
 *  - Anyone on camera or sharing → the tile grid, every share in its own tile.
 *
 * The green outline means "talking right now" and nothing else: it follows the
 * person's live audio level. Someone being rung gets a white ripple instead.
 */

export interface StageMember {
  id: string;
  profile?: Profile;
  label: string;
  /** Their mic (and camera, when on). Drives both the video and the speaking ring. */
  stream?: MediaStream | null;
  mirrored?: boolean;
  ringing?: boolean;
  muted?: boolean;
}

export interface StageScreen {
  id: string;
  profile?: Profile;
  label: string;
  stream: MediaStream;
  /** The share's own sound, on its own lane so each listener can mute it. */
  audio?: MediaStream | null;
  /** Your own share: always shown, never played back to you. */
  local?: boolean;
}

// ─── Speaking detection ─────────────────────────────────────────────────────

let analysisCtx: AudioContext | null = null;
function getAnalysisCtx(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  analysisCtx ??= new AudioContext();
  if (analysisCtx.state === "suspended") void analysisCtx.resume();
  return analysisCtx;
}

/** Level above which a voice counts as talking (RMS of the waveform, 0–1). */
const SPEAKING_RMS = 0.018;
/** Keep the ring on briefly after a word ends, so it doesn't flicker between syllables. */
const SPEAKING_HOLD_MS = 350;

export function useSpeaking(stream: MediaStream | null | undefined): boolean {
  const [speaking, setSpeaking] = useState(false);
  const track = stream?.getAudioTracks()[0];

  useEffect(() => {
    setSpeaking(false);
    if (!track || track.readyState !== "live") return;
    const ctx = getAnalysisCtx();
    if (!ctx) return;

    let source: MediaStreamAudioSourceNode;
    try {
      source = ctx.createMediaStreamSource(new MediaStream([track]));
    } catch {
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let lastLoud = 0;
    let current = false;

    const id = window.setInterval(() => {
      if (ctx.state === "suspended") void ctx.resume();
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      // A disabled (muted) track feeds silence, so muting drops the ring too.
      if (rms > SPEAKING_RMS && track.enabled) lastLoud = now;
      const next = now - lastLoud < SPEAKING_HOLD_MS;
      if (next !== current) {
        current = next;
        setSpeaking(next);
      }
    }, 80);

    return () => {
      window.clearInterval(id);
      source.disconnect();
      analyser.disconnect();
    };
  }, [track]);

  return speaking;
}

/** Re-renders when any track in any of the streams starts, stops or (un)mutes. */
function useAnyLiveVideo(streams: (MediaStream | null | undefined)[]): boolean {
  const [, bump] = useState(0);
  const key = streams.map((s) => s?.id ?? "").join("|");

  useEffect(() => {
    const live = streams.filter((s): s is MediaStream => !!s);
    const refresh = () => bump((n) => n + 1);
    const tracks = live.flatMap((s) => s.getTracks());
    for (const s of live) {
      s.addEventListener("addtrack", refresh);
      s.addEventListener("removetrack", refresh);
    }
    for (const t of tracks) {
      t.addEventListener("ended", refresh);
      t.addEventListener("mute", refresh);
      t.addEventListener("unmute", refresh);
    }
    return () => {
      for (const s of live) {
        s.removeEventListener("addtrack", refresh);
        s.removeEventListener("removetrack", refresh);
      }
      for (const t of tracks) {
        t.removeEventListener("ended", refresh);
        t.removeEventListener("mute", refresh);
        t.removeEventListener("unmute", refresh);
      }
    };
    // `key` stands in for the stream list's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return streams.some((s) => streamHasLiveVideo(s));
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function RingRipple() {
  return (
    <>
      <span className="call-ripple pointer-events-none absolute inset-0 rounded-full border-2 border-header-primary/80" />
      <span className="call-ripple-delayed pointer-events-none absolute inset-0 rounded-full border-2 border-header-primary/80" />
    </>
  );
}

function MemberAvatar({ member, speaking }: { member: StageMember; speaking: boolean }) {
  return (
    <span
      className={`relative flex rounded-full transition-shadow duration-150 ${
        speaking ? "shadow-[0_0_0_3px_#000,0_0_0_6px_var(--color-status-online)]" : ""
      } ${member.ringing ? "opacity-70" : ""}`}
    >
      {member.ringing && <RingRipple />}
      {member.profile ? (
        <Avatar profile={member.profile} size="lg" className="h-20 w-20 text-2xl" />
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">
          {member.label.charAt(0).toUpperCase()}
        </span>
      )}
      {member.muted && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-status-dnd text-white ring-[3px] ring-black">
          <IconMicOff size={14} />
        </span>
      )}
    </span>
  );
}

/** Voice-only: just the circle and the name. */
function MemberCircle({ member }: { member: StageMember }) {
  const { t } = useI18n();
  const speaking = useSpeaking(member.ringing ? null : member.stream);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className="flex w-28 flex-col items-center gap-2"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {menu && <ParticipantMenu member={member} at={menu} onClose={() => setMenu(null)} />}
      <MemberAvatar member={member} speaking={speaking} />
      <span className="max-w-full truncate text-sm font-medium text-header-primary">{member.label}</span>
      {member.ringing && <span className="-mt-1.5 text-[11px] text-header-secondary">{t("Ringing…")}</span>}
    </div>
  );
}

/** Video mode: a tile with their camera, or their circle centred in the tile. */
function MemberTile({ member, onFocus }: { member: StageMember; onFocus?: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = useLiveVideoStream(member.stream);
  const speaking = useSpeaking(member.ringing ? null : member.stream);
  const [controls, setControls] = useState<ParticipantControls>(() => getParticipantControls(member.id));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (ref.current && member.stream && hasVideo) {
      ref.current.srcObject = member.stream;
      void ref.current.play().catch(() => {});
    }
  }, [member.stream, hasVideo]);

  useEffect(() => {
    const sync = () => setControls(getParticipantControls(member.id));
    window.addEventListener("disband:participant-controls", sync);
    return () => window.removeEventListener("disband:participant-controls", sync);
  }, [member.id]);

  const cameraHidden = controls.cameraDisabled && member.id !== "self";
  const showVideo = hasVideo && !cameraHidden;

  return (
    <>
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        onClick={showVideo ? onFocus : undefined}
        className={`relative h-full w-full overflow-hidden rounded-lg bg-overlay-media transition-shadow duration-150 ${
          showVideo && onFocus ? "cursor-pointer " : ""
        }${
          speaking ? "ring-[3px] ring-status-online" : "ring-1 ring-white/10"
        }`}
      >
        {showVideo && member.stream ? (
          <video
            ref={ref}
            autoPlay
            playsInline
            // Audio plays through the call's own <audio> elements.
            muted
            className={`h-full w-full object-cover ${member.mirrored ? "scale-x-[-1]" : ""}`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <MemberAvatar member={member} speaking={false} />
          </span>
        )}
        <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-[3px] bg-black/65 px-2 py-1 text-[13px] font-medium text-white">
          {member.muted && <IconMicOff size={12} className="shrink-0 text-status-dnd" />}
          <span className="truncate">{member.label}</span>
          {member.ringing && <span className="shrink-0 text-[11px] text-white/50">{t("Ringing…")}</span>}
        </span>
      </div>
      {menu && <ParticipantMenu member={member} at={menu} onClose={() => setMenu(null)} />}
    </>
  );
}

/**
 * Right-click on someone in a call: their profile, a message, how loud they
 * are, and muting their mic, soundboard or camera just for you. Drawn on the
 * page itself (a portal), so a call layout's animation can't shift or clip it.
 */
function ParticipantMenu({ member, at, onClose }: { member: StageMember; at: { x: number; y: number }; onClose: () => void }) {
  const { t } = useI18n();
  const { user, deafened } = useApp();
  const self = member.id === "self" || member.id === user?.id;
  const [controls, setControls] = useState<ParticipantControls>(() => getParticipantControls(member.id));
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const { width, height } = box.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - height - 8)),
    });
  }, [at]);

  useEffect(() => pushEscapeHandler(onClose), [onClose]);

  function update<K extends keyof ParticipantControls>(key: K, value: ParticipantControls[K]) {
    setParticipantControl(member.id, key, value);
    setControls({ ...controls, [key]: value } as ParticipantControls);
    if (key === "volume" || key === "micMuted") {
      document
        .querySelectorAll(`audio[data-call-user="${CSS.escape(member.id)}"]`)
        .forEach((el) => {
          applyParticipantAudioControls(el as HTMLAudioElement, member.id);
          // Deafened stays deafened whatever their own settings say.
          if (deafened) (el as HTMLAudioElement).muted = true;
        });
    }
  }

  const act = (fn: () => void) => {
    onClose();
    fn();
  };
  const row = "flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left text-[14px] font-medium text-text-normal hover:bg-brand hover:text-white";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[135]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={boxRef}
        role="menu"
        className="menu-pop fixed z-[140] w-[232px] rounded-lg bg-bg-floating p-1.5 shadow-[var(--elevation-high)]"
        style={{ left: pos.x, top: pos.y }}
      >
        {member.profile && (
          <button type="button" role="menuitem" className={row}
            onClick={() => act(() => window.dispatchEvent(new CustomEvent("disband:open-profile", { detail: member.profile })))}>
            {t("Profile")}
          </button>
        )}
        {!self && member.profile && (
          <button type="button" role="menuitem" className={row}
            onClick={() => act(() => window.dispatchEvent(new CustomEvent("disband:open-dm", { detail: member.id })))}>
            {t("Message")}
          </button>
        )}
        {!self && (
          <>
            <div className="mx-1.5 my-1.5 h-px bg-divider" />
            <div className="px-2 pb-2 pt-1">
              <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-header-secondary">
                <span>{t("User Volume")}</span>
                <span className="tabular-nums">{controls.volume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={controls.volume}
                onChange={(event) => update("volume", Number(event.target.value))}
                className="w-full accent-brand"
                aria-label={t("User Volume")}
              />
            </div>
            {[
              { key: "micMuted" as const, label: t("Mute") },
              { key: "soundboardMuted" as const, label: t("Mute Soundboard") },
              { key: "cameraDisabled" as const, label: t("Disable Video") },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={controls[item.key]}
                onClick={() => update(item.key, !controls[item.key])}
                className={`group ${row}`}
              >
                <span>{item.label}</span>
                <span
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border-2 ${
                    controls[item.key] ? "border-brand bg-brand group-hover:border-white" : "border-interactive-normal group-hover:border-white"
                  }`}
                >
                  {controls[item.key] && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            ))}
          </>
        )}
        {!self && member.profile && <div className="mx-1.5 my-1.5 h-px bg-divider" />}
        <button type="button" role="menuitem" className={row}
          onClick={() => act(() => void navigator.clipboard.writeText(member.profile?.id ?? member.id))}>
          {t("Copy User ID")}
        </button>
      </div>
    </>,
    document.body,
  );
}

function ScreenTile({
  screen, deafened, focused, compact, onFocus, watching, onWatch,
}: {
  /** Owned by the stage so it survives the tile moving between layouts. */
  watching: boolean;
  onWatch: (watching: boolean) => void;
  screen: StageScreen;
  deafened: boolean;
  focused?: boolean;
  /** Thumbnail in the strip under a focused tile: no controls, just the picture. */
  compact?: boolean;
  onFocus?: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [soundOff, setSoundOff] = useState(false);
  const hasAudio = !screen.local && !!screen.audio?.getAudioTracks().length;
  const boxRef = useRef<HTMLDivElement>(null);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boxRef.current?.requestFullscreen();
    } catch {
      /* not allowed here (e.g. some webviews) — the in-call focus still works */
    }
  };

  useEffect(() => {
    const el = videoRef.current;
    if (el && watching && el.srcObject !== screen.stream) {
      el.srcObject = screen.stream;
      void el.play().catch(() => {});
    }
  }, [watching, screen.stream]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !screen.audio) return;
    if (el.srcObject !== screen.audio) {
      el.srcObject = screen.audio;
      void applyAudioOutputToElement(el, getPreferredAudioOutputId());
    }
    el.muted = !watching || soundOff || deafened;
    if (!el.muted) void el.play().catch(() => {});
  }, [screen.audio, watching, soundOff, deafened]);

  return (
    <div
      ref={boxRef}
      className={`group relative h-full w-full overflow-hidden rounded-lg bg-black ring-1 ring-white/10 ${
        watching && onFocus ? "cursor-pointer" : ""
      }`}
      onClick={watching ? onFocus : undefined}
      title={watching && onFocus ? (focused ? t("Click to shrink") : t("Click to focus")) : undefined}
    >
      {watching ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full bg-black object-contain" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-overlay-media px-4 text-center">
          {screen.profile && <Avatar profile={screen.profile} size="md" />}
          <p className="text-sm text-white/70">{screen.label}</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onWatch(true);
              // Choosing to watch means you want to see it: open it big.
              if (!focused) onFocus?.();
            }}
            className="rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-black transition-transform hover:scale-105"
          >
            {t("Watch Stream")}
          </button>
        </div>
      )}

      {hasAudio && <audio ref={audioRef} autoPlay playsInline className="hidden" />}

      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-[3px] bg-black/65 px-2 py-1 text-[13px] font-medium text-white">
        <span className="truncate">{screen.label}</span>
        <span className="shrink-0 rounded bg-status-dnd px-1 text-[10px] font-bold uppercase tracking-wide text-white">
          {t("Live")}
        </span>
      </span>

      {watching && !compact && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        >
          {hasAudio && (
            <button
              type="button"
              onClick={() => setSoundOff((v) => !v)}
              title={soundOff ? t("Unmute stream") : t("Mute stream")}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black/90"
            >
              {soundOff ? <IconSpeakerOff size={16} /> : <IconSpeaker size={16} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title={t("Full screen")}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black/90"
          >
            <IconMaximize size={16} />
          </button>
          {!screen.local && (
            <button
              type="button"
              onClick={() => {
                onWatch(false);
                if (focused) onFocus?.();
              }}
              className="rounded-md bg-black/70 px-2.5 text-xs font-semibold text-white hover:bg-black/90"
            >
              {t("Stop watching")}
            </button>
          )}
        </div>
      )}
      {hasAudio && watching && soundOff && (
        <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-status-dnd group-hover:hidden">
          <IconSpeakerOff size={16} />
        </span>
      )}
    </div>
  );
}

// ─── Stage ──────────────────────────────────────────────────────────────────

export function CallStage({
  members,
  screens,
  deafened = false,
  onFocusChange,
}: {
  members: StageMember[];
  screens: StageScreen[];
  deafened?: boolean;
  /** Lets the call panel grow to most of the window while a tile is focused. */
  onFocusChange?: (focused: boolean) => void;
}) {
  const anyVideo = useAnyLiveVideo(members.map((m) => m.stream));
  const [focusId, setFocusId] = useState<string | null>(null);
  // Like Discord, someone else's share starts as an invitation: you choose
  // to watch. Your own is always shown.
  const [watchingIds, setWatchingIds] = useState<Set<string>>(() => new Set());
  const setWatch = (id: string, on: boolean) =>
    setWatchingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Jingle whenever a share starts — yours or anyone's. Shares already running
  // when the stage mounts (you joined late) don't count as starting.
  const screenKey = screens.map((s) => s.id).sort().join("|");
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(screenKey ? screenKey.split("|") : []);
    const seen = seenRef.current;
    seenRef.current = ids;
    if (!seen) return;
    for (const id of ids) {
      if (!seen.has(id)) {
        playScreenShareJingle();
        break;
      }
    }
  }, [screenKey]);

  // A focused share or camera that goes away drops the focus with it.
  const focusExists =
    focusId !== null &&
    (screens.some((s) => s.id === focusId) || members.some((m) => m.id === focusId));
  const activeFocus = focusExists ? focusId : null;
  useEffect(() => {
    onFocusChange?.(activeFocus !== null);
  }, [activeFocus, onFocusChange]);
  useEffect(() => () => onFocusChange?.(false), [onFocusChange]);

  const toggle = (id: string) => setFocusId((cur) => (cur === id ? null : id));

  if (!anyVideo && screens.length === 0) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-wrap content-center items-center justify-center gap-x-6 gap-y-5 overflow-auto py-2">
        {members.map((m) => (
          <MemberCircle key={m.id} member={m} />
        ))}
      </div>
    );
  }

  const screenTile = (s: StageScreen, compact = false) => (
    <ScreenTile
      key={s.id}
      screen={s}
      deafened={deafened}
      focused={s.id === activeFocus}
      compact={compact}
      watching={!!s.local || watchingIds.has(s.id)}
      onWatch={(on) => setWatch(s.id, on)}
      onFocus={() => toggle(s.id)}
    />
  );
  const memberTile = (m: StageMember) => (
    <MemberTile key={m.id} member={m} onFocus={() => toggle(m.id)} />
  );

  if (activeFocus) {
    // Discord's focus view: the chosen tile fills the stage, everyone else
    // rides along in a strip underneath. Click it again to go back.
    const focusedScreen = screens.find((s) => s.id === activeFocus);
    const focusedMember = members.find((m) => m.id === activeFocus);
    const rest = [
      ...screens.filter((s) => s.id !== activeFocus).map((s) => screenTile(s, true)),
      ...members.filter((m) => m.id !== activeFocus).map(memberTile),
    ];
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
        <div className="min-h-0 flex-1">
          {focusedScreen ? screenTile(focusedScreen) : focusedMember ? memberTile(focusedMember) : null}
        </div>
        {rest.length > 0 && (
          <div className="flex h-24 shrink-0 justify-center gap-2 overflow-x-auto">
            {rest.map((tile, i) => (
              <div key={i} className="aspect-video h-full shrink-0">
                {tile}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <CallGrid>
      {[...screens.map((s) => screenTile(s)), ...members.map(memberTile)]}
    </CallGrid>
  );
}
