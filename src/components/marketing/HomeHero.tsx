"use client";

/*
 The top of the homepage. A stacked headline on the left (the last word
 rotating through who Disband is for), the app on the right, tilted, with a
 live voice channel, reactions and a typing indicator floating around it.

 The entrance is CSS-only (no JavaScript to wait for) and everything holds
 still with reduced motion. The backdrop fades into the page colour, so the
 next section starts without a hard edge.
*/

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { detectClientPlatform } from "@/lib/github-releases";
import { LiveOnlineCount } from "./LiveOnlineCount";
import { ProductFrame } from "./ProductFrame";

const AUDIENCES = ["friends", "team", "raid crew", "study group", "community", "people"];

const DOWNLOAD_LABELS: Record<string, string> = {
  windows: "Download for Windows",
  macos: "Download for Mac",
  linux: "Download for Linux",
};

const PROMISES = ["Free forever", "No ads or trackers", "No phone number"];

export function HomeHero() {
  // "Download" on the server and the first render, so hydration matches;
  // the visitor's platform straight after.
  const [download, setDownload] = useState("Download");
  useEffect(() => {
    // Phones and tablets first: Android reports Linux and an iPad a Mac.
    const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || touchMac) {
      setDownload("Get the app");
      return;
    }
    setDownload(DOWNLOAD_LABELS[detectClientPlatform()] ?? "Download");
  }, []);

  return (
    <section className="relative isolate overflow-hidden text-white">
      <Backdrop />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-32 sm:pt-40 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-12 lg:pb-32 lg:pt-40">
        <div className="text-center lg:text-left">
          <Rise delay={0}>
            <p className="inline-flex items-center gap-2.5 rounded-full bg-white/10 py-1 pl-1.5 pr-3.5 text-[13px] font-medium tabular-nums text-white/85 ring-1 ring-white/15 backdrop-blur-sm">
              <span className="flex -space-x-1.5" aria-hidden>
                {[
                  ["N", "#e0669a"],
                  ["K", "#3aa8c1"],
                  ["M", "#8b6fd4"],
                ].map(([initial, color]) => (
                  <span
                    key={initial}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-[#3a2fc9]"
                    style={{ backgroundColor: color }}
                  >
                    {initial}
                  </span>
                ))}
              </span>
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ade80]" />
              </span>
              <LiveOnlineCount />
            </p>
          </Rise>

          <Rise delay={70}>
            <h1 className="mt-7 text-[50px] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-[68px] lg:text-[76px]">
              <span className="block">A place </span>
              <span className="block">for your </span>
              <span className="block">
                <span className="sr-only">people</span>
                <RotatingWord words={AUDIENCES} />
              </span>
            </h1>
          </Rise>

          <Rise delay={150}>
            <p className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-white/80 sm:text-[19px] lg:mx-0">
              Free chat, voice and video for the people you care about. Spaces, forums, DMs and calls on every
              device, with no ads and no phone number.
            </p>
          </Rise>

          <Rise delay={230}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap lg:justify-start">
              <Link
                href="/login"
                className="group inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-6 text-[16px] font-bold text-[#2b2290] shadow-[0_12px_30px_-10px_rgba(10,5,60,0.6)] transition-[translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_rgba(10,5,60,0.7)] active:translate-y-0 sm:w-auto"
              >
                Open Disband
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a
                href="#download"
                className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white/10 px-6 text-[16px] font-bold text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.16] sm:w-auto"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                </svg>
                {download}
              </a>
            </div>
          </Rise>

          <Rise delay={310}>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] text-white/70 lg:justify-start">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#a7f3d0]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                  {p}
                </li>
              ))}
            </ul>
          </Rise>
        </div>

        <Rise delay={200} className="relative min-w-0">
          <Showcase />
        </Rise>
      </div>
    </section>
  );
}

/** Fades and lifts its content in once, after `delay` ms. CSS only. */
function Rise({ delay, className = "", children }: { delay: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={`motion-safe:animate-[marketing-fade-up_0.9s_cubic-bezier(0.22,1,0.36,1)_both] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Deep indigo, two slow glows, a faint grid, and a fade into the page. */
function Backdrop() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#3c31d4_0%,#3326ba_48%,#2b1f9c_100%)]" />
      <div className="absolute -left-48 -top-48 h-[680px] w-[680px] rounded-full bg-[radial-gradient(closest-side,rgba(167,139,250,0.6),transparent)] motion-safe:animate-[hero-drift_24s_ease-in-out_infinite]" />
      <div className="absolute -right-40 top-16 h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(236,72,153,0.38),transparent)] motion-safe:animate-[hero-drift_28s_ease-in-out_-9s_infinite_reverse]" />
      <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_25%,black,transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-bg-secondary" />
    </div>
  );
}

/**
 * The headline's last word, changing every few seconds. Every word sits in
 * the same grid cell, so the box is as wide as the longest and nothing around
 * it shifts. The change is a soft crossfade: the old word drifts up a little
 * as it fades, easing out of view, and the new one rises into place a beat
 * later. Words waiting their turn reset invisibly, with no transition, and
 * nothing is clipped. Still, on the first word, with reduced motion.
 */
function RotatingWord({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % words.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [words.length]);

  const previous = (index - 1 + words.length) % words.length;
  // Each word gets 0.25em of padding below it: the headline's tight line
  // height leaves no room for the tails of y, g and p, and a gradient fill
  // only paints inside the word's own box, so without it they were cut off
  // ("community", "study group", "people"). The negative margin hands that
  // room back, so the line doesn't move.
  return (
    <span aria-hidden className="-mb-[0.25em] inline-grid align-bottom">
      {words.map((word, i) => (
        <span
          key={word}
          className={`col-start-1 row-start-1 justify-self-center whitespace-nowrap pb-[0.25em] bg-gradient-to-r from-[#ffe2fb] via-[#f5b0ff] to-[#c6b6ff] bg-clip-text text-transparent will-change-[translate,opacity] motion-reduce:!transition-none lg:justify-self-start ${
            i === index
              ? "translate-y-0 opacity-100 transition-[translate,opacity] delay-[140ms] duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              : i === previous
                ? "-translate-y-[0.22em] opacity-0 transition-[translate,opacity] duration-[450ms] ease-[cubic-bezier(0.4,0,1,1)]"
                : "translate-y-[0.22em] opacity-0 transition-none"
          }`}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

/** The app, tilted, with a few live moments floating around it. */
function Showcase() {
  return (
    <div className="relative mx-auto max-w-[640px] lg:max-w-none">
      <div aria-hidden className="absolute -inset-10 -z-10 rounded-[48px] bg-[radial-gradient(closest-side,rgba(139,92,246,0.5),transparent)] blur-2xl" />
      <div className="transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] lg:[transform:perspective(1800px)_rotateY(-10deg)_rotateX(4deg)] lg:hover:[transform:perspective(1800px)_rotateY(-3deg)_rotateX(1deg)] motion-reduce:transition-none">
        <ProductFrame compact />
      </div>

      <div className="absolute -bottom-9 -left-4 hidden sm:block lg:-left-10">
        <div className="motion-safe:animate-[marketing-float_7s_ease-in-out_infinite]">
          <VoiceCard />
        </div>
      </div>
      <div className="absolute -right-3 -top-7 hidden sm:block lg:-right-6">
        <div className="motion-safe:animate-[marketing-float_8s_ease-in-out_-2s_infinite]">
          <ReactionsCard />
        </div>
      </div>
      <div className="absolute -right-5 bottom-20 hidden lg:block">
        <div className="motion-safe:animate-[marketing-float_9s_ease-in-out_-4s_infinite]">
          <TypingCard />
        </div>
      </div>
    </div>
  );
}

const CARD = "rounded-2xl border border-white/10 bg-[#1a181e]/90 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md";

function Avatar({ initial, color, size = 28, ring }: { initial: string; color: string; size?: number; ring?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${ring ?? ""}`}
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

function VoiceCard() {
  return (
    <div className={`w-[230px] p-3.5 ${CARD}`}>
      <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9d97aa]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
        </svg>
        Lounge
        <span className="ml-auto rounded-full bg-[#23a55a]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4ade80]">Live</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full ring-2 ring-[#23a55a] ring-offset-2 ring-offset-[#1a181e] motion-safe:animate-pulse">
          <Avatar initial="N" color="#e0669a" />
        </span>
        <Avatar initial="K" color="#3aa8c1" />
        <Avatar initial="M" color="#8b6fd4" />
        <span className="ml-auto text-[11px] text-[#9d97aa]">3 talking</span>
      </div>
    </div>
  );
}

function ReactionsCard() {
  return (
    <div className={`flex items-center gap-1.5 !rounded-full px-2 py-1.5 ${CARD}`}>
      {(
        [
          ["🎉", 12],
          ["❤️", 8],
          ["👀", 3],
        ] as const
      ).map(([emoji, count], i) => (
        <span
          key={emoji}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-white ${i === 0 ? "bg-[#5865f2]/30 ring-1 ring-[#8b93ff]/60" : "bg-white/[0.07]"}`}
        >
          <span aria-hidden>{emoji}</span>
          <span className="font-semibold tabular-nums">{count}</span>
        </span>
      ))}
    </div>
  );
}

function TypingCard() {
  return (
    <div className={`flex items-center gap-2 !rounded-full py-1.5 pl-1.5 pr-3.5 ${CARD}`}>
      <Avatar initial="K" color="#3aa8c1" size={24} />
      <span className="text-[12px] text-[#cecbd4]">
        <span className="font-semibold text-white">Kai</span> is typing
      </span>
      <span className="flex items-center gap-[3px]" aria-hidden>
        {[0, 160, 320].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-[#cecbd4] motion-safe:animate-[typing-dot_1.2s_ease-in-out_infinite]"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
