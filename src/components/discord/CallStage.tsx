"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconMicOff, IconSpeaker, IconSpeakerOff } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";
import { streamHasLiveVideo } from "@/lib/webrtc";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";
import { playScreenShareJingle } from "@/lib/ringtone";
import { useLiveVideoStream } from "@/hooks/useLiveVideoStream";
import { CallGrid } from "./CallTile";

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
      <span className="call-ripple pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" />
      <span className="call-ripple-delayed pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" />
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
  const speaking = useSpeaking(member.ringing ? null : member.stream);
  return (
    <div className="flex w-28 flex-col items-center gap-2">
      <MemberAvatar member={member} speaking={speaking} />
      <span className="max-w-full truncate text-sm font-medium text-white/80">{member.label}</span>
      {member.ringing && <span className="-mt-1.5 text-[11px] text-white/40">Ringing…</span>}
    </div>
  );
}

/** Video mode: a tile with their camera, or their circle centred in the tile. */
function MemberTile({ member }: { member: StageMember }) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = useLiveVideoStream(member.stream);
  const speaking = useSpeaking(member.ringing ? null : member.stream);

  useEffect(() => {
    if (ref.current && member.stream && hasVideo) {
      ref.current.srcObject = member.stream;
      void ref.current.play().catch(() => {});
    }
  }, [member.stream, hasVideo]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl bg-overlay-media transition-shadow duration-150 ${
        speaking ? "ring-[3px] ring-status-online" : "ring-1 ring-white/10"
      }`}
    >
      {hasVideo && member.stream ? (
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
      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
        {member.muted && <IconMicOff size={12} className="shrink-0 text-status-dnd" />}
        <span className="truncate">{member.label}</span>
        {member.ringing && <span className="shrink-0 text-[11px] text-white/50">Ringing…</span>}
      </span>
    </div>
  );
}

function ScreenTile({ screen, deafened }: { screen: StageScreen; deafened: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Like Discord, a share starts as an invitation: you choose to watch.
  const [watching, setWatching] = useState(!!screen.local);
  const [soundOff, setSoundOff] = useState(false);
  const hasAudio = !screen.local && !!screen.audio?.getAudioTracks().length;

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
    <div className="group relative h-full w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      {watching ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full bg-black object-contain" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-overlay-media px-4 text-center">
          {screen.profile && <Avatar profile={screen.profile} size="md" />}
          <p className="text-sm text-white/70">{screen.label}</p>
          <button
            type="button"
            onClick={() => setWatching(true)}
            className="rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-black transition-transform hover:scale-105"
          >
            Watch Stream
          </button>
        </div>
      )}

      {hasAudio && <audio ref={audioRef} autoPlay playsInline className="hidden" />}

      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
        <span className="truncate">{screen.label}</span>
        <span className="shrink-0 rounded bg-status-dnd px-1 text-[10px] font-bold uppercase tracking-wide text-white">
          Live
        </span>
      </span>

      {watching && !screen.local && (
        <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {hasAudio && (
            <button
              type="button"
              onClick={() => setSoundOff((v) => !v)}
              title={soundOff ? "Unmute stream" : "Mute stream"}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black/90"
            >
              {soundOff ? <IconSpeakerOff size={16} /> : <IconSpeaker size={16} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setWatching(false)}
            className="rounded-md bg-black/70 px-2.5 text-xs font-semibold text-white hover:bg-black/90"
          >
            Stop watching
          </button>
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
}: {
  members: StageMember[];
  screens: StageScreen[];
  deafened?: boolean;
}) {
  const anyVideo = useAnyLiveVideo(members.map((m) => m.stream));

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

  const ordered = useMemo(() => screens, [screens]);

  if (!anyVideo && ordered.length === 0) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-wrap content-center items-center justify-center gap-x-6 gap-y-5 overflow-auto py-2">
        {members.map((m) => (
          <MemberCircle key={m.id} member={m} />
        ))}
      </div>
    );
  }

  return (
    <CallGrid>
      {[
        ...ordered.map((s) => <ScreenTile key={s.id} screen={s} deafened={deafened} />),
        ...members.map((m) => <MemberTile key={m.id} member={m} />),
      ]}
    </CallGrid>
  );
}
