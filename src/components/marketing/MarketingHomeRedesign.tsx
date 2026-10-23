"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MarketingFooter, MarketingNav } from "./MarketingLayout";
import { DownloadSection } from "./DownloadSection";
import { LiveOnlineCount } from "./LiveOnlineCount";

const featureRows = [
  {
    code: "01 / Spaces",
    title: "Servers that behave like real servers",
    body:
      "Channels in categories, roles and permissions, invites, bans, and moderation tools. Create a server in a minute and bring every conversation back under one roof.",
  },
  {
    code: "02 / Calls",
    title: "Voice and video that start without a link",
    body:
      "WebRTC voice and video calls, one-to-one or group, with mic and camera controls. Screen sharing sits behind one tap when you need it.",
  },
  {
    code: "03 / Messages",
    title: "Threads, replies, reactions, and the space in between",
    body:
      "Replies, edits, reactions, uploads up to 50 MB, and Notes for things only you should read. Offline-friendly sync means your messages stay put.",
  },
  {
    code: "04 / Continuity",
    title: "One account across every screen",
    body:
      "Desktop, mobile, and web share the same data. Sign in on a new device and the servers, channels, and threads follow you.",
  },
];

const platformRows = [
  { label: "Desktop", value: "macOS · Windows · Linux" },
  { label: "Mobile", value: "iOS, Android" },
  { label: "Web", value: "Any modern browser" },
  { label: "Account", value: "One login, every device" },
];

const trustRows = [
  {
    code: "core.01",
    title: "No ads, no advertiser runtime",
    body: "No trackers in chat. The interface is the product — not the cover page.",
  },
  {
    code: "core.02",
    title: "A server is yours",
    body:
      "Permissions, roles, bans, audit-friendly history. Whether you host a friend group or a community, you keep the door.",
  },
  {
    code: "core.03",
    title: "Open in app or open in browser",
    body:
      "Read everything without installing, then come back later from the same place with desktop notifications.",
  },
];

export function MarketingHomeRedesign() {
  return (
    <div className="min-h-screen bg-[#131417] text-[#dbdee1]">
      <MarketingNav />

      <main className="pt-14">
        <section className="relative overflow-hidden border-b border-white/[0.06]">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 sm:py-24 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
            <div className="relative z-10">
              <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.2em] text-[#8b909a]">
                <span>Disband</span>
                <span className="h-px w-8 bg-white/[0.14]" />
                <span>chat, calls, rooms</span>
              </div>

              <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[4rem] lg:text-[4.5rem]">
                A simpler home
                <br />
                for <span className="text-brand">your people</span>.
              </h1>

              <p className="mt-6 max-w-md text-[16px] leading-relaxed text-[#9aa0a8]">
                Disband is voice and text chat with the shape of a desktop app:
                spaces, channels, direct messages, group chats, and calls over
                WebRTC. One account, every screen.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#download"
                  className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
                >
                  <span>Download</span>
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/login"
                  className="rounded-md border border-white/[0.12] px-5 py-3 text-sm font-medium text-[#dbdee1] transition-colors hover:border-white/30 hover:text-white"
                >
                  Use in browser
                </Link>
                <span className="text-xs text-[#6e727a]">
                  Free to start, no phone required.
                </span>
              </div>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-[#b5bac1]">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <LiveOnlineCount />
              </div>

              <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-white/[0.06] py-6 sm:grid-cols-4">
                {platformRows.map((row) => (
                  <div key={row.label}>
                    <dt className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#6e727a]">
                      {row.label}
                    </dt>
                    <dd className="mt-1.5 text-xs text-[#b5bac1]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <HeroScene />
          </div>
        </section>

        <section className="border-b border-white/[0.06] px-6 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[14rem_1fr]">
            <div className="lg:sticky lg:top-24 lg:h-fit">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#6e727a]">
                Inside
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
                Everything the product
                <br />
                is already good at
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#9aa0a8]">
                Each line is a feature the app already ships. No roadmap
                placeholders.
              </p>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {featureRows.map((feature) => (
                <article
                  key={feature.code}
                  className="grid gap-4 py-6 first:pt-0 sm:grid-cols-[9rem_1fr]"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand/80">
                    {feature.code}
                  </p>
                  <div>
                    <h3 className="text-base font-medium text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#9aa0a8]">
                      {feature.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/[0.06] bg-[#101114] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#6e727a]">
                  Values
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Calm software
                </h2>
              </div>
              <p className="max-w-md text-sm text-[#9aa0a8]">
                A chat app should get out of the way when you are talking to
                your friends and not sell their attention between messages.
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.04] sm:grid-cols-3">
              {trustRows.map((row, index) => (
                <div
                  key={row.code}
                  className="bg-[#101114] p-6 sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6e727a]">
                      {row.code}
                    </span>
                    <span className="text-xs text-white/[0.18]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-5 text-sm font-medium text-white">
                    {row.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#8b909a]">
                    {row.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/[0.06] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-[#6e727a]">
                Get the app
              </h2>
              <span className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <DownloadSection />
          </div>
        </section>

        <section className="px-6 py-16 sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 rounded-lg border border-white/[0.08] bg-[#101114] px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Start talking in about a minute.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[#9aa0a8]">
                Free to create an account. No automated trial countdown, no
                card request. Better conversations when the software is on
                your side.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/login"
                className="rounded-md bg-brand px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
              >
                Create account
              </Link>
              <a
                href="#download"
                className="rounded-md border border-white/[0.12] px-5 py-3 text-sm font-medium text-[#dbdee1] transition-colors hover:border-white/30 hover:text-white"
              >
                Download
              </a>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

const heroMessages = [
  {
    name: "Nova",
    color: "#e0669a",
    text: "shipped the search jump — people can finally find old messages",
    time: "10:24",
  },
  {
    name: "Kai",
    color: "#3aa8c1",
    text: "and muted alerts never buzz on my phone anymore",
    time: "10:26",
  },
  {
    name: "Mila",
    color: "#8b6fd4",
    text: "frame click → pinned DM → we all have context now",
    time: "10:31",
  },
];



const sceneChannels = [
  { name: "general", kind: "#", count: "2", active: true },
  { name: "launch", kind: "#", count: "1", active: false },
  { name: "design-review", kind: "#", count: "4", active: false },
  { name: "roadmap", kind: "#", count: "", active: false },
];

const sceneCall = [
  { name: "Nova", color: "#e0669a", bars: [4, 8, 5, 10, 7] },
  { name: "Kai", color: "#3aa8c1", bars: [6, 4, 8, 6, 9] },
  { name: "Mila", color: "#8b6fd4", bars: [5, 10, 4, 7, 6] },
];

const sceneInbox = [
  {
    icon: "@",
    title: "Mila mentioned you in design-review",
    time: "02:14",
  },
  {
    icon: "#",
    title: "3 new pins in launch",
    time: "02:08",
  },
  {
    icon: "•",
    title: "Kai muted general for 6 h",
    time: "01:52",
  },
];







function HeroScene() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [rotation, setRotation] = useState({ x: -5, y: -15 });

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
      const normalizedY = (event.clientY / window.innerHeight) * 2 - 1;
      setRotation({
        x: -5 - normalizedY * 12,
        y: -15 + normalizedX * 20,
      });
    };
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, []);

  const slices = Array.from({ length: 8 }, (_, index) => index);

  return (
    <div className="relative flex min-h-[34rem] items-center justify-center bg-transparent">
      <div
        ref={sceneRef}
        style={{ perspective: "1300px" }}
        className="relative h-[460px] w-[460px]"
      >
        <div
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            transition: "transform 120ms ease-out",
            transformStyle: "preserve-3d",
          }}
          className="relative h-full w-full"
        >
          {slices.map((index) => {
            const depth = (8 - index) * 2.8;
            const lightness = 0.95;
            return (
              <div
                key={index}
                style={{
                  transform: `translateZ(${depth}px)`,
                  opacity: lightness,
                  position: "absolute",
                  inset: 0,
                }}
              >
                <img
                  src="/logo.png"
                  alt="Disband"
                  width={440}
                  height={440}
                  draggable={false}
                  className="mx-auto block select-none"
                  style={{
                    filter: `brightness(0) invert(1) drop-shadow(0 ${depth * 0.6}px ${Math.max(2, depth * 0.35)}px rgba(0,0,0,0.75))`,
                    imageRendering: "auto",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
