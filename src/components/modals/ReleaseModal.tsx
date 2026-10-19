"use client";

import { useEffect, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { IconClose } from "@/components/icons";
import { renderMarkdown } from "@/lib/markdown";

/**
 * One-time release announcement. Shows once per device, the first time the
 * app loads after this release ships; dismissing (X or the primary button)
 * records that permanently under a versioned key, so bumping
 * RELEASE_VERSION is the only way to show a future announcement again.
 */
const RELEASE_VERSION = "1.13";
const SEEN_KEY = `disband-release-seen:${RELEASE_VERSION}`;
const COMMERCIAL_URL = "https://api.joshclark.xyz/v1/images/disband-commercial-16x9-1080p.mp4";

/** The changelog, in old Discord's "What's New" sections. */
const SECTIONS: { title: string; tone: "added" | "progress" | "fixed"; md: string }[] = [
  {
    title: "New Features",
    tone: "added",
    md: `Disband is here: a new home for your communities, built around privacy from the first line of code.

- **Servers and voice:** text channels, voice channels, and crystal-clear calls on desktop, web, and mobile, all in sync.
- **DMs and group chats:** fast, private conversations with the people who matter.
- **Tether, your built-in assistant:** mention @tether anywhere, or message it directly, to get answers, save notes, and manage your account.
- **Notes:** a private space for your own thoughts, right inside the app.`,
  },
  {
    title: "Now on Mobile",
    tone: "progress",
    md: `Aero unlocks Tether, bigger uploads, and more, and Catalysts let you back the servers you love. Both can now be bought right inside the iOS app, alongside web.

Thank you for being here at the start. This is only the beginning.`,
  },
];

const TONE: Record<(typeof SECTIONS)[number]["tone"], string> = {
  added: "#23a55a",
  progress: "#5865f2",
  fixed: "#f23f43",
};

const RELEASE_DATE = "June 21, 2026";

export function ReleaseModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // Storage unavailable: showing every load beats never showing.
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      // Best effort; without storage the modal returns next load.
    }
    setOpen(false);
  };

  useOverlayDismiss(dismiss, open);

  const { mounted, exiting } = usePresence(open);
  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 overlay-fade${exiting ? " overlay-fade-out" : ""}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Disband has officially released"
        className={`classic-modal relative flex max-h-[min(720px,calc(100dvh-32px))] w-full max-w-[600px] flex-col overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]${exiting ? " modal-pop-out" : ""}`}
      >
        <div className="flex shrink-0 items-start justify-between px-4 pb-4 pt-5">
          <div>
            <h2 className="text-[20px] font-semibold leading-6 text-header-primary">What&apos;s New</h2>
            <p className="mt-0.5 text-[14px] text-header-secondary">{RELEASE_DATE}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="flex h-8 w-8 items-center justify-center text-interactive-normal transition-colors hover:text-interactive-active"
          >
            <IconClose size={22} />
          </button>
        </div>

        <div className="channel-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <div className="overflow-hidden rounded-[4px] bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={COMMERCIAL_URL} controls playsInline preload="metadata" className="aspect-video w-full" />
          </div>
          {SECTIONS.map((sec) => (
            <section key={sec.title} className="mt-7">
              <h3
                className="flex items-center gap-2 text-[12px] font-bold uppercase leading-4 tracking-[0.02em]"
                style={{ color: TONE[sec.tone] }}
              >
                {sec.title}
                <span aria-hidden className="h-px flex-1" style={{ background: TONE[sec.tone] }} />
              </h3>
              <div className="release-md mt-4 space-y-3 text-[16px] leading-[22px] text-text-normal">{renderMarkdown(sec.md)}</div>
            </section>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 bg-bg-secondary p-4">
          <p className="text-[12px] text-header-secondary">Missed an update? Check the notes in Settings any time.</p>
          <button
            type="button"
            onClick={dismiss}
            className="h-[38px] shrink-0 rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Explore Disband
          </button>
        </div>
      </div>
    </div>
  );
}
