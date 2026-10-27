"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CosmeticMotionContext } from "../AnimatedCosmetic";

/**
 * Knobs the decoration lab turns. Production never provides this, so every
 * decoration runs at 1x, follows the real pointer and never freezes.
 */
export interface DecorationLabControls {
  /** Multiplies every duration: 2 is half speed. Timers follow it too. */
  slow: number;
  /** Treat the decoration as hovered whether or not it is. */
  forceHover: boolean;
  /** Hold the hover performance in its playing phase (for scrubbing). */
  hold: boolean;
}

export const DecorationLabContext = createContext<DecorationLabControls | null>(null);

/**
 * Whether the decoration is hovered. The host is the nearest ancestor marked
 * `data-deco-hover` (a member row, a profile card), else the avatar itself,
 * so a decoration reacts the way Discord's do: to the row as well as the face.
 */
export function useDecorationHover(anchor: React.RefObject<HTMLElement | null>) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const el = anchor.current;
    const host = (el?.closest("[data-deco-hover]") as HTMLElement | null) ?? el?.parentElement ?? null;
    if (!host) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focusin", enter);
    host.addEventListener("focusout", leave);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("focusin", enter);
      host.removeEventListener("focusout", leave);
    };
  }, [anchor]);
  return hovered;
}

/** Idle loops run only on screen, in a visible tab, with motion allowed. */
export function useDecorationRunning(anchor: React.RefObject<HTMLElement | null>, playing: boolean) {
  const contextPlaying = useContext(CosmeticMotionContext);
  const [visible, setVisible] = useState(false);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      setAllowed(!media.matches && !document.hidden && document.documentElement.dataset.motion !== "reduced");
    update();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    const el = anchor.current;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (el) observer.observe(el);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [anchor]);
  return { running: playing && contextPlaying && visible && allowed, motionAllowed: allowed };
}

export type HoverPhase = "idle" | "play" | "rest";

/**
 * The hover performance as a small state machine.
 *
 *   idle ──hover──▶ play ──cycleMs──▶ (still hovered?) rest ──gapMs──▶ play …
 *                                  └▶ (not hovered)  idle
 *
 * A cycle that has started always finishes, so leaving mid-chomp lets the
 * skull close and open properly instead of snapping back to its pose.
 * `cycle` increments every time a performance starts; renderers key their
 * animated groups on it so the CSS keyframes restart from 0%.
 */
export function useHoverCycle({
  hovered,
  enabled,
  cycleMs,
  gapMs,
}: {
  hovered: boolean;
  enabled: boolean;
  cycleMs: number;
  /** Pause before replaying while still hovered; null plays once per hover. */
  gapMs: number | null;
}) {
  const lab = useContext(DecorationLabContext);
  const slow = lab?.slow ?? 1;
  const hold = lab?.hold ?? false;
  const wantPlay = (hovered || !!lab?.forceHover) && enabled;

  const [phase, setPhase] = useState<HoverPhase>("idle");
  const [cycle, setCycle] = useState(0);
  const wantRef = useRef(wantPlay);
  wantRef.current = wantPlay;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<HoverPhase>("idle");

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const start = useCallback(() => {
    clear();
    phaseRef.current = "play";
    setPhase("play");
    setCycle((n) => n + 1);
    if (hold) return;
    timer.current = setTimeout(() => {
      if (wantRef.current && gapMs !== null) {
        phaseRef.current = "rest";
        setPhase("rest");
        timer.current = setTimeout(() => {
          if (wantRef.current) start();
          else {
            phaseRef.current = "idle";
            setPhase("idle");
          }
        }, gapMs * slow);
      } else {
        phaseRef.current = "idle";
        setPhase("idle");
      }
    }, cycleMs * slow);
  }, [cycleMs, gapMs, slow, hold]);

  useEffect(() => {
    if (wantPlay && phaseRef.current === "idle") start();
    // Leaving during the rest between cycles ends it; leaving during a
    // cycle lets the cycle finish (its timer sees wantRef and goes idle).
    if (!wantPlay && phaseRef.current === "rest") {
      clear();
      phaseRef.current = "idle";
      setPhase("idle");
    }
  }, [wantPlay, start]);

  useEffect(() => clear, []);

  /** Play one cycle now (a tap on touch screens, the lab's Play button). */
  const trigger = useCallback(() => {
    if (enabled && phaseRef.current !== "play") start();
  }, [enabled, start]);

  return { phase, cycle, trigger, hovering: wantPlay };
}
