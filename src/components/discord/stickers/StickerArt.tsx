"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { safeImageUrl } from "@/lib/safe-url";
import { loadStickerData, type Sticker } from "@/lib/stickers";

/*
 One sticker. Lottie stickers use the player the shop's effects already use;
 a space's image stickers (PNG, APNG, GIF, WebP) are a plain <img>, which
 animates by itself and keeps its transparency.

 Nothing loads until the sticker is near the screen, and a Lottie sticker
 only plays while it's actually on screen, so a long list costs no more than
 the few rows you can see. With `playing` false it holds its poster frame.
*/

const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false },
);

/** Whether the OS asked for less motion. Stickers then only move on hover. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** `near`: within a screen of the viewport (load it); `visible`: on screen now (play it). */
function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      setVisible(true);
      return;
    }
    const root = el.closest<HTMLElement>("[data-sticker-scroll]");
    const nearObs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          nearObs.disconnect();
        }
      },
      { root, rootMargin: "300px 0px" },
    );
    const visObs = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { root });
    nearObs.observe(el);
    visObs.observe(el);
    return () => {
      nearObs.disconnect();
      visObs.disconnect();
    };
  }, [ref]);
  return { near, visible };
}

const FILL = { width: "100%", height: "100%", display: "block" } as const;

interface StickerArtProps {
  sticker: Sticker;
  /** CSS size of the square, e.g. 160 or "100%". */
  size: number | string;
  playing?: boolean;
  className?: string;
}

export function StickerArt({ sticker, size, playing = true, className = "" }: StickerArtProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { near, visible } = useOnScreen(ref);
  const [data, setData] = useState<string | null>(null);
  const [player, setPlayer] = useState<DotLottie | null>(null);
  const [failed, setFailed] = useState(false);
  const isLottie = sticker.format === "lottie";

  useEffect(() => {
    if (!isLottie || !near) return;
    let live = true;
    setData(null);
    setFailed(false);
    loadStickerData(sticker).then(
      (json) => live && setData(json),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [sticker, near, isLottie]);

  const shouldPlay = playing && visible;

  // Play while on screen and asked to; otherwise hold the poster frame.
  useEffect(() => {
    if (!player) return;
    const apply = () => {
      if (shouldPlay) {
        player.play();
      } else {
        player.pause();
        if (!playing) player.setFrame(sticker.poster);
      }
    };
    const onError = () => setFailed(true);
    if (player.isLoaded) apply();
    player.addEventListener("load", apply);
    player.addEventListener("loadError", onError);
    return () => {
      player.removeEventListener("load", apply);
      player.removeEventListener("loadError", onError);
    };
  }, [player, shouldPlay, playing, sticker.poster]);

  const renderConfig = useMemo(
    () => ({
      autoResize: true,
      // Off: the player's own check runs while the picker is still popping
      // open, decides the sticker is hidden and never looks again, so nothing
      // played until the mouse moved. useOnScreen below pauses it instead.
      freezeOnOffscreen: false,
      devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio,
    }),
    [],
  );

  const image = !isLottie ? safeImageUrl(sticker.url) ?? (sticker.url.startsWith("/") ? sticker.url : null) : null;
  const fallback = failed && sticker.fallbackUrl ? sticker.fallbackUrl : null;

  return (
    <span ref={ref} className={`relative block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {!near ? null : image || fallback ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={(image ?? fallback)!}
          alt=""
          draggable={false}
          decoding="async"
          className="h-full w-full object-contain"
        />
      ) : data && !failed ? (
        <DotLottieReact
          data={data}
          loop
          autoplay={false}
          renderConfig={renderConfig}
          dotLottieRefCallback={setPlayer}
          style={FILL}
        />
      ) : null}
    </span>
  );
}
