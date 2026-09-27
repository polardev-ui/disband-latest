"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CosmeticArt } from "@/lib/shop";
import "./cosmetic-art.css";

export const CosmeticMotionContext = createContext(true);

/** Real animated media; load the loop only while visible and motion is allowed. */
export function AnimatedCosmetic({ art, playing = true }: { art: CosmeticArt; playing?: boolean }) {
  const contextPlaying = useContext(CosmeticMotionContext);
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!media.matches && !document.hidden);
    update();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const animate = contextPlaying && playing && visible && motionAllowed && failed !== art.animated;
  return (
    // Animated WebP must bypass image optimizers that could flatten its frames.
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={animate ? art.animated : art.still} alt="" aria-hidden="true"
      draggable={false} decoding="async" loading="lazy" className="cosmetic-art"
      onError={() => { if (animate) setFailed(art.animated); }} />
  );
}
