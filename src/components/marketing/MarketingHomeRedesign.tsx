"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MarketingFooter, MarketingNav } from "./MarketingLayout";
import { DownloadSection } from "./DownloadSection";
import { LiveOnlineCount } from "./LiveOnlineCount";
import { AsciiField } from "./AsciiField";

const AUDIENCES = ["people", "friends", "team", "raid crew", "study group", "community"];

const FEATURES = [
  { cmd: "spaces", text: "channels, roles, invites and moderation tools" },
  { cmd: "messages", text: "replies, reactions, 50 MB uploads and private notes" },
  { cmd: "calls", text: "voice and video, one-to-one or group, with screen share" },
  { cmd: "everywhere", text: "windows · macos · linux · ios · android · web" },
];

/**
 * The homepage: a short, terminal-flavoured page over a scrolling ASCII
 * field (AsciiField). Content sits on the page background colour at the
 * edges so the field reads as depth, not noise behind the text.
 */
export function MarketingHomeRedesign() {
  return (
    <div className="relative min-h-screen bg-[#0e0f13] text-[#dbdee1]">
      <AsciiField />
      <div className="relative z-10">
        <MarketingNav />

        <main>
          <section className="flex min-h-[100svh] flex-col items-center justify-center px-6 pb-[18vh] pt-24 text-center">
            <p className="font-mono text-[12px] tracking-[0.18em] text-[#6e727a]">
              <span className="text-brand">●</span> <LiveOnlineCount />
            </p>
            <h1 className="mt-6 font-mono text-[3.25rem] font-semibold leading-none tracking-[-0.04em] text-white sm:text-[5.5rem]">
              disband
            </h1>
            <p className="mt-6 min-h-[3.5rem] max-w-xl font-mono text-[17px] leading-relaxed text-[#b5bac1] sm:min-h-0 sm:text-[20px]">
              <span className="text-[#6e727a]">$</span> a place for your <TypedWord words={AUDIENCES} />
            </p>
            <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
              <Link
                href="/login"
                className="rounded-md bg-brand px-7 py-3 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover"
              >
                Open Disband
              </Link>
              <a
                href="#download"
                className="rounded-md border border-white/[0.14] bg-[#0e0f13]/60 px-7 py-3 text-[15px] font-medium text-[#dbdee1] backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white"
              >
                Download
              </a>
            </div>
            <p className="mt-4 text-xs text-[#6e727a]">Free. No ads. No phone number.</p>
          </section>

          <section className="px-6 py-24 sm:py-32">
            <div className="mx-auto max-w-2xl rounded-lg border border-white/[0.06] bg-[#0e0f13]/80 p-6 font-mono backdrop-blur-sm sm:p-10">
              <p className="text-[12px] tracking-[0.16em] text-[#6e727a]">// what&apos;s inside</p>
              <ul className="mt-6 space-y-4">
                {FEATURES.map((f, i) => (
                  <Reveal
                    key={f.cmd}
                    as="li"
                    delay={i * 90}
                    className="grid gap-1 text-[15px] sm:grid-cols-[8.5rem_1fr] sm:gap-4"
                  >
                    <span className="text-white">
                      <span className="text-brand">&gt;</span> {f.cmd}
                    </span>
                    <span className="text-[#9aa0a8]">{f.text}</span>
                  </Reveal>
                ))}
              </ul>
            </div>
          </section>

          <section className="px-6 py-24 text-center sm:py-32">
            <Reveal>
              <p className="mx-auto max-w-2xl text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[2.5rem]">
                No ads. No trackers in chat.
                <br />
                <span className="text-[#9aa0a8]">Your space, your rules.</span>
              </p>
            </Reveal>
          </section>

          <div className="bg-[#0e0f13]/85 backdrop-blur-sm">
            <DownloadSection />
          </div>

          <section className="px-6 py-28 text-center sm:py-36">
            <Reveal>
              <h2 className="font-mono text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
                start talking in about a minute_
              </h2>
              <Link
                href="/login"
                className="mt-8 inline-block rounded-md bg-brand px-7 py-3 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover"
              >
                Create an account
              </Link>
            </Reveal>
          </section>
        </main>

        <MarketingFooter />
      </div>
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
    <span className="text-brand">
      {text}
      <span className="ml-px inline-block w-[0.6em] animate-pulse text-[#b5bac1]" aria-hidden>
        _
      </span>
    </span>
  );
}

/** Fades its content up the first time it scrolls into view. */
function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: {
  children: React.ReactNode;
  delay?: number;
  as?: "div" | "li";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
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
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      style={{ transitionDelay: `${delay}ms` }}
      className={`${className} motion-safe:transition-[opacity,transform] motion-safe:duration-700 ${
        shown ? "translate-y-0 opacity-100" : "motion-safe:translate-y-3 motion-safe:opacity-0"
      }`}
    >
      {children}
    </Tag>
  );
}
