"use client";

import { useEffect, useId, useRef, useState } from "react";
import "./split-logo-loader.css";

export interface SplitLogoTiming {
  hold: number;
  exit: number;
  enter: number;
  stagger: number;
  gap: number;
}

export const DEFAULT_SPLIT_LOGO_TIMING: SplitLogoTiming = {
  hold: 650,
  exit: 480,
  enter: 620,
  stagger: 65,
  gap: 110,
};

export function splitLogoTimeline(timing: SplitLogoTiming) {
  const exitStart = timing.hold;
  const exitEnd = exitStart + timing.exit + 3 * timing.stagger;
  const enterStart = exitEnd + timing.gap;
  const enterEnd = enterStart + timing.enter + 2 * timing.stagger;
  return { exitStart, exitEnd, enterStart, enterEnd, duration: enterEnd + timing.hold };
}

interface SplitLogoLoaderProps {
  /** Width of the visible logo, excluding its motion runway. */
  size?: number;
  timing?: SplitLogoTiming;
  paused?: boolean;
  /** Optional frame position, from 0 to 1, for the preview scrubber. */
  progress?: number;
  replayKey?: number;
  onProgress?: (progress: number) => void;
  className?: string;
}

/** Seven horizontal slices exit right; five vertical slices return from above. */
export function SplitLogoLoader({ size = 72, timing = DEFAULT_SPLIT_LOGO_TIMING,
  paused = false, progress, replayKey = 0, onProgress, className = "" }: SplitLogoLoaderProps) {
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const animations = useRef<Animation[]>([]);
  const pausedRef = useRef(paused);
  const progressRef = useRef(progress);
  const callback = useRef(onProgress);
  pausedRef.current = paused;
  progressRef.current = progress;
  callback.current = onProgress;
  const [reduced, setReduced] = useState(true);
  const { hold, exit, enter, stagger, gap } = timing;
  const timeline = splitLogoTimeline(timing);

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches || document.documentElement.dataset.motion === "reduced");
    update();
    preference.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => { preference.removeEventListener("change", update); observer.disconnect(); };
  }, []);

  useEffect(() => {
    if (!svg.current || reduced) return;
    const clock = splitLogoTimeline({ hold, exit, enter, stagger, gap });
    const time = (ms: number) => ms / clock.duration;
    const options: KeyframeAnimationOptions = { duration: clock.duration, iterations: Infinity, fill: "both" };
    const motion: Animation[] = [];
    svg.current.querySelectorAll<SVGGElement>("[data-exit-strip]").forEach((strip, index) => {
      const start = clock.exitStart + Math.abs(index - 3) * stagger;
      motion.push(strip.animate([
        { transform: "translateX(0px)", opacity: 1, offset: 0 },
        { transform: "translateX(0px)", opacity: 1, offset: time(start), easing: "cubic-bezier(.55, 0, .8, .25)" },
        { transform: "translateX(540px)", opacity: 1, offset: time(start + exit) },
        { transform: "translateX(540px)", opacity: 1, offset: 1 },
      ], options));
    });
    svg.current.querySelectorAll<SVGGElement>("[data-enter-strip]").forEach((strip, index) => {
      const start = clock.enterStart + Math.abs(index - 2) * stagger;
      motion.push(strip.animate([
        { transform: "translateY(-520px)", opacity: 1, offset: 0 },
        { transform: "translateY(-520px)", opacity: 1, offset: time(start), easing: "cubic-bezier(.2, .8, .2, 1)" },
        { transform: "translateY(0px)", opacity: 1, offset: time(start + enter) },
        { transform: "translateY(0px)", opacity: 1, offset: 1 },
      ], options));
    });
    animations.current = motion;
    // A shared start time keeps all twelve slices locked to the same loop.
    const startTime = document.timeline.currentTime;
    for (const animation of motion) {
      animation.startTime = startTime;
      if (pausedRef.current || document.hidden) animation.pause();
      if (progressRef.current !== undefined) animation.currentTime = Math.min(.999999, Math.max(0, progressRef.current)) * clock.duration;
    }
    const visibility = () => motion.forEach((animation) => {
      if (document.hidden || pausedRef.current) animation.pause(); else animation.play();
    });
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); motion.forEach((animation) => animation.cancel()); animations.current = []; };
  }, [hold, exit, enter, stagger, gap, reduced, replayKey]);

  useEffect(() => {
    animations.current.forEach((animation) => { if (paused || document.hidden) animation.pause(); else animation.play(); });
  }, [paused]);

  useEffect(() => {
    if (progress === undefined) return;
    animations.current.forEach((animation) => { animation.currentTime = Math.min(.999999, Math.max(0, progress)) * timeline.duration; });
  }, [progress, timeline.duration]);

  const reportProgress = !!onProgress;
  useEffect(() => {
    if (!reportProgress || paused || reduced) return;
    const timer = window.setInterval(() => {
      const current = animations.current[0]?.currentTime;
      if (typeof current === "number") callback.current?.((current % timeline.duration) / timeline.duration);
    }, 50);
    return () => clearInterval(timer);
  }, [reportProgress, paused, reduced, timeline.duration]);

  // logo.png has 122px left and 106px top padding. Crop in SVG coordinates,
  // preserving the exact original pixels while slicing only the visible mark.
  const mark = <image href="/logo.png" x={-122} y={-106} width={500} height={500} />;
  return <svg ref={svg} className={`split-logo-loader ${className}`} data-reduced={reduced}
    width={size * 3} height={size * 2.7} viewBox="-256 -202 768 692" fill="none" aria-hidden="true">
    <defs>
      <clipPath id={`${id}-mark`}><rect width={256} height={288} /></clipPath>
      {Array.from({ length: 7 }, (_, index) => <clipPath key={`row-${index}`} id={`${id}-row-${index}`}><rect x={0} y={index * 288 / 7} width={256} height={288 / 7} /></clipPath>)}
      {Array.from({ length: 5 }, (_, index) => <clipPath key={`col-${index}`} id={`${id}-col-${index}`}><rect x={index * 256 / 5} y={0} width={256 / 5} height={288} /></clipPath>)}
    </defs>
    <g className="split-logo-still" clipPath={`url(#${id}-mark)`}>{mark}</g>
    <g className="split-logo-motion">
      {Array.from({ length: 7 }, (_, index) => <g key={`out-${index}`} data-exit-strip={index}><g clipPath={`url(#${id}-row-${index})`}>{mark}</g></g>)}
      {Array.from({ length: 5 }, (_, index) => <g key={`in-${index}`} data-enter-strip={index}><g clipPath={`url(#${id}-col-${index})`}>{mark}</g></g>)}
    </g>
  </svg>;
}
