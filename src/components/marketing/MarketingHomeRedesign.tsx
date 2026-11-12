"use client";

/*
 The homepage (Nov 2026 redesign): an indigo hero with the headline, the
 two ways in and a picture of the app, then what Disband does, building on
 it, Disband Aero, downloads and a last call to sign up.

 Built to stay still while it loads: everything renders on the server and is
 visible without JavaScript; the headline's rotating word sits in a box as
 wide as the longest word, so nothing around it moves; sections below the
 fold fade in as they arrive, and nothing above it waits to.
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
    title: "Favourites and saved messages",
    body: "Star the channels and chats you live in, and save messages to come back to, with reminders on Lite and Aero.",
    icon: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  },
  {
    title: "Private by design",
    body: "No ads, no trackers in chat, two-factor sign-in with passkeys, and moderation tools for every space.",
    icon: <path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6Z" />,
  },
];

const BOT_POINTS = [
  "Slash commands, buttons and rich embeds",
  "Reactions, forum posts and moderation tools",
  "Live events with no websocket to babysit",
  "Libraries for JavaScript and Python",
];

const DOCS_URL = "https://docs.disband.dev/docs/bots/";

export function MarketingHomeRedesign() {
  return (
    <div className="marketing-home min-h-screen bg-bg-secondary text-text-normal">
      <MarketingNav overHero />

      <main>
        <section className="aero-hero relative overflow-hidden px-6 pb-0 pt-28 text-center text-white sm:pt-36">
          <div className="relative z-[1] mx-auto max-w-4xl">
            <p className="inline-flex min-h-[30px] items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-[13px] font-medium tabular-nums text-white/85 ring-1 ring-white/15">
              <span className="h-2 w-2 rounded-full bg-[#4ade80]" /> <LiveOnlineCount />
            </p>
            <h1 className="mt-6 text-[44px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[72px]">
              A place for your
              <span className="block">
                <span className="sr-only">people</span>
                <RotatingWord words={AUDIENCES} />
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-white/85 sm:text-[19px]">
              Disband is free chat, voice and video for the people you care about: spaces, channels, forums,
              DMs and calls on every device, with no ads and no phone number.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="flex h-12 items-center rounded-xl bg-white px-7 text-[16px] font-bold text-[#2b2290] shadow-[0_6px_0_rgba(20,12,90,0.25)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_0_rgba(20,12,90,0.25)] active:translate-y-0 active:shadow-[0_3px_0_rgba(20,12,90,0.25)]"
              >
                Open Disband in your browser
              </Link>
              <a
                href="#download"
                className="flex h-12 items-center rounded-xl bg-[#1d1680]/70 px-7 text-[16px] font-bold text-white ring-1 ring-white/15 transition-[transform,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#1d1680]/90 active:translate-y-0"
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
                From two friends to a few thousand members, without the clutter.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 80}>
                  <div className="group h-full rounded-2xl border border-border-subtle bg-bg-secondary-alt p-6 transition-[border-color,transform] duration-300 ease-out hover:-translate-y-1 hover:border-border-strong motion-reduce:hover:translate-y-0">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand transition-transform duration-300 ease-out group-hover:scale-105">
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
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
            <Reveal>
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-brand">For developers</p>
              <h2 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.025em] text-header-primary sm:text-[38px]">
                Build the bot your space has been missing
              </h2>
              <p className="mt-3 text-[16px] leading-relaxed text-text-muted">
                A small HTTP API and two tidy libraries. Your bot runs wherever you like; Disband hands it messages,
                reactions, members and commands, and spaces choose exactly what it may do.
              </p>
              <ul className="mt-5 space-y-2.5">
                {BOT_POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[15px] text-text-normal">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/developers/applications"
                  className="inline-flex h-11 items-center rounded-xl bg-brand px-5 text-[15px] font-bold text-brand-foreground transition-colors duration-200 hover:bg-brand-hover"
                >
                  Open the developer portal
                </Link>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center rounded-xl border border-border-subtle px-5 text-[15px] font-bold text-header-primary transition-colors duration-200 hover:border-border-strong hover:bg-bg-secondary-alt"
                >
                  Read the docs
                </a>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <CodeCard />
            </Reveal>
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
                className="relative z-[1] shrink-0 rounded-xl bg-white px-6 py-3 text-[15px] font-bold text-[#2b2290] transition-transform duration-200 ease-out hover:-translate-y-0.5 sm:ml-auto"
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
              className="mt-8 inline-flex h-12 items-center rounded-xl bg-brand px-7 text-[16px] font-bold text-brand-foreground transition-colors duration-200 hover:bg-brand-hover"
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

/**
 * The headline's last word, changing every few seconds. Every word sits in
 * the same grid cell, so the box is as wide as the longest and the line
 * around it never shifts; the words slide and fade rather than retype.
 * Still, on the first word, with reduced motion.
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
  return (
    <span aria-hidden className="inline-grid overflow-hidden pb-[0.1em] align-bottom">
      {words.map((word, i) => (
        <span
          key={word}
          className={`col-start-1 row-start-1 whitespace-nowrap text-[#ffd8fb] transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            i === index
              ? "translate-y-0 opacity-100"
              : i === previous
                ? "-translate-y-[55%] opacity-0"
                : "translate-y-[55%] opacity-0"
          }`}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

/**
 * Fades its content up as it scrolls into view. Visible by default, so the
 * page reads fine before JavaScript runs; only what starts below the fold is
 * held back to arrive.
 */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"static" | "waiting" | "shown">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("waiting");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={state === "shown" ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${className} h-full ${
        state === "waiting"
          ? "translate-y-5 opacity-0"
          : state === "shown"
            ? "translate-y-0 opacity-100 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            : ""
      }`}
    >
      {children}
    </div>
  );
}

/** A bot in a dozen lines, for the developers section. */
function CodeCard() {
  const k = "text-[#ff7b72]";
  const s = "text-[#a5d6ff]";
  const f = "text-[#d2a8ff]";
  const c = "text-[#8b949e]";
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f1013] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[12px] text-white/50">bot.js</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.75] text-[#e6edf3]">
        <code>
          <span className={k}>import</span> {"{ Client }"} <span className={k}>from</span> <span className={s}>&quot;@disband/bot&quot;</span>;{"\n\n"}
          <span className={k}>const</span> client = <span className={k}>new</span> <span className={f}>Client</span>({"{"}{"\n"}
          {"  token: process.env.DISBAND_BOT_TOKEN,"}{"\n"}
          {"});"}{"\n\n"}
          client.<span className={f}>on</span>(<span className={s}>&quot;messageCreate&quot;</span>, <span className={k}>async</span> (message) =&gt; {"{"}{"\n"}
          {"  "}<span className={k}>if</span> (message.content === <span className={s}>&quot;!ping&quot;</span>) {"{"}{"\n"}
          {"    "}<span className={k}>await</span> client.<span className={f}>sendTyping</span>(message.channelId);{"\n"}
          {"    "}<span className={k}>await</span> message.<span className={f}>reply</span>(<span className={s}>&quot;pong&quot;</span>);{"\n"}
          {"  }"}{"\n"}
          {"});"}{"\n\n"}
          <span className={c}>{"// Slash commands, buttons, forums, reactions…"}</span>{"\n"}
          <span className={k}>await</span> client.<span className={f}>connect</span>();
        </code>
      </pre>
    </div>
  );
}
