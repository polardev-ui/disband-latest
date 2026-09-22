"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * A Lottie animation, for shop cosmetics that ship as authored artwork.
 *
 * Generated CSS and hand-written SVG both top out at "clearly made of shapes".
 * Lottie is what the drawn effects are exported as, so this is the path that
 * can actually look illustrated — the art is the asset, not the code.
 *
 * The player is loaded with `ssr: false` because it reaches for the DOM and
 * canvas on construction; rendering it on the server throws. Nothing is
 * fetched until an effect is actually on screen.
 */
const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false },
);

export interface LottieEffectProps {
  /** Path under /public, e.g. "/shop/lottie/hydro.lottie". Also takes a URL. */
  src: string;
  /** Profile effects loop; a one-shot celebration would not. */
  loop?: boolean;
  autoplay?: boolean;
  /** Below 1 slows the animation down, which most profile loops want. */
  speed?: number;
  className?: string;
}

export function LottieEffect({
  src,
  loop = true,
  autoplay = true,
  speed = 1,
  className = "",
}: LottieEffectProps) {
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Someone who asked the OS to stop animations should get a still frame, not
  // a looping one. Checked at runtime because the player does not read the
  // media query itself.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // A missing or broken asset must not take the profile card down with it.
  if (failed) return null;

  return (
    <DotLottieReact
      src={src}
      loop={reduced ? false : loop}
      autoplay={reduced ? false : autoplay}
      speed={speed}
      className={`h-full w-full ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
