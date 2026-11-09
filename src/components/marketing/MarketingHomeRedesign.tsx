"use client";

/*
 The homepage (Nov 2026 redesign): an indigo hero with the headline, the
 two ways in and a picture of the app, then what Disband does, the newest
 features, Disband Aero, downloads and a last call to sign up.
*/

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MarketingFooter, MarketingNav } from "./MarketingLayout";
import { DownloadSection } from "./DownloadSection";
import { LiveOnlineCount } from "./LiveOnlineCount";
import { ProductFrame } from "./ProductFrame";

const AUDIENCES = ["friends", "team", "raid crew", "study group", "community", "people"];

const FEATURES: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Spaces and channels",
    body: "Text, voice, stage and forum channels, sorted into categories, with roles and per-channel permissions.",
    icon: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  },
  {
    title: "Voice, video and screen share",
    body: "Drop into a voice channel or call a friend. Share your screen in up to 4K on Aero.",
    icon: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M19 11a7 7 0 0 1-14 0M12 18v3" /></>,
  },
  {
    title: "DMs and group chats",
    body: "Private conversations with replies, reactions, polls, GIFs and files up to 500 MB.",
    icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />,
  },
  {
    title: "Forums",
    body: "Give questions and ideas their own titled posts with tags, so nothing gets buried in a busy channel.",
    icon: <><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z" /><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" /></>,
  },
  {
    title: "Favorites and saved messages",
    body: "Star the channels and chats you live in, and save messages to come back to — with reminders on Lite and Aero.",
    icon: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  },
  {
    title: "Private by design",
    body: "No ads, no trackers in chat, two-factor sign-in with passkeys, and moderation tools for every space.",
    icon: <path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6Z" />,
  },
];

export function MarketingHomeRedesign() {
  return (
    <div className="min-h-screen bg-bg-secondary text-text-normal">
      <MarketingNav />

      <main>
        <section className="aero-hero relative overflow-hidden px-6 pb-0 pt-28 text-center text-white sm:pt-36">
          <div className="relative z-[1] mx-auto max-w-4xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-[13px] font-medium text-white/85 ring-1 ring-white/15">
              <span className="h-2 w-2 rounded-full bg-[#4ade80]" /> <LiveOnlineCount />
            </p>
            <h1 className="mt-6 text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[72px]">
              A place for your <TypedWord words={AUDIENCES} />
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-white/85 sm:text-[19px]">
              Disband is free chat, voice and video for the people you care about — spaces, channels, forums,
              DMs and calls on every device, with no ads and no phone number.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="flex h-12 items-center rounded-xl bg-white px-7 text-[16px] font-bold text-[#2b2290] shadow-[0_6px_0_rgba(20,12,90,0.25)] transition-transform hover:-translate-y-0.5"
              >
                Open Disband in your browser
              </Link>
              <a
                href="#download"
                className="flex h-12 items-center rounded-xl bg-[#1d1680]/70 px-7 text-[16px] font-bold text-white ring-1 ring-white/15 transition-transform hover:-translate-y-0.5"
              >
                Download
              </a>
            </div>
            <p className="mt-4 text-[13px] text-white/65">Free forever · Windows, macOS, Linux, iOS, Android and web</p>
          </div>
          <div className="relative z-[1] mx-auto mt-14 max-w-5xl translate-y-10 px-0 sm:px-6">
            <ProductFrame />
          </div>
        </section>

        <section className="px-6 pb-20 pt-32 sm:pt-40">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <h2 className="text-center text-[32px] font-bold tracking-[-0.025em] text-header-primary sm:text-[44px]">
                Everything a group chat needs
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-[17px] text-text-muted">
                From two friends to a few thousand members — without the clutter.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 70}>
                  <div className="h-full rounded-2xl border border-border-subtle bg-bg-secondary-alt p-6 transition-colors hover:border-border-strong">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        {f.icon}
                      </svg>
                    </span>
                    <h3 className="mt-4 text-[18px] font-semibold text-header-primary">{f.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-text-muted">{f.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16">
          <Reveal>
            <div className="aero-hero relative mx-auto flex max-w-6xl flex-col items-start gap-6 overflow-hidden rounded-3xl px-8 py-12 text-white sm:flex-row sm:items-center sm:px-12">
              <div className="relative z-[1] max-w-xl">
                <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-white/70">Disband Aero</p>
                <h2 className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[38px]">More of everything, for the price of a coffee</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-white/85">
                  500 MB uploads, 2K streams, animated profiles, your own accent colour, chat wallpapers and message
                  reminders. Lite starts at $2.99 a month.
                </p>
              </div>
              <Link
                href="/login"
                className="relative z-[1] shrink-0 rounded-xl bg-white px-6 py-3 text-[15px] font-bold text-[#2b2290] transition-transform hover:-translate-y-0.5 sm:ml-auto"
              >
                See the plans
              </Link>
            </div>
          </Reveal>
        </section>

        <DownloadSection />

        <section className="px-6 py-28 text-center">
          <Reveal>
            <h2 className="text-[30px] font-bold tracking-[-0.025em] text-header-primary sm:text-[40px]">Start talking in about a minute</h2>
            <p className="mt-3 text-[16px] text-text-muted">No ads. No phone number. Just your people.</p>
            <Link
              href="/login"
              className="mt-8 inline-flex h-12 items-center rounded-xl bg-brand px-7 text-[16px] font-bold text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              Create an account
            </Link>
          </Reveal>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

/** Types each word, holds it, deletes it, moves on. A still word with reduced motion. */
function TypedWord({ words }: { words: string[] }) {
  const [text, setText] = useState(words[0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let word = 0;
    let len = words[0].length;
    let deleting = true;
    let timer = window.setTimeout(function tick() {
      if (deleting) {
        len -= 1;
        if (len <= 0) {
          deleting = false;
          word = (word + 1) % words.length;
        }
      } else {
        len += 1;
      }
      const current = words[word];
      setText(current.slice(0, Math.max(0, len)));
      let delay = deleting ? 45 : 85;
      if (!deleting && len >= current.length) {
        deleting = true;
        delay = 2200;
      }
      timer = window.setTimeout(tick, delay);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [words]);

  return (
    <span className="whitespace-nowrap text-[#ffd8fb]">
      {text}
      <span className="ml-0.5 inline-block w-[0.5em] animate-pulse text-white/70" aria-hidden>
        |
      </span>
    </span>
  );
}

/** Fades its content up the first time it scrolls into view. */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`${className} h-full motion-safe:transition-[opacity,transform] motion-safe:duration-700 ${
        shown ? "translate-y-0 opacity-100" : "motion-safe:translate-y-3 motion-safe:opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
