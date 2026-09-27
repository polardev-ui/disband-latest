"use client";

import { useEffect, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
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

const BODY_MD = `Disband is here — a new home for your communities, built around privacy from the first line of code.

**What you get from day one**

- **Servers and voice** — text channels, voice channels, and crystal-clear calls on desktop, web, and mobile, all in sync.
- **DMs and group chats** — fast, private conversations with the people who matter.
- **Tether, your built-in assistant** — mention @tether anywhere, or message it directly, to get answers, save notes, and manage your account.
- **Notes** — a private space for your own thoughts, right inside the app.

**Disband Aero and Catalysts, now on mobile**

Aero unlocks Tether, bigger uploads, and more — and Catalysts let you back the servers you love. Both are now purchasable right inside the iOS app, alongside web.

Thank you for being here at the start. This is only the beginning.`;

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Disband has officially released"
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-bg-secondary shadow-2xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
        >
          <IconClose size={18} />
        </button>

        <div className="shrink-0 bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={COMMERCIAL_URL}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <h2 className="text-2xl font-bold text-text-normal">
            Disband has officially released
          </h2>
          <div className="release-md mt-3 space-y-3 text-[15px] leading-relaxed text-text-normal">
            {renderMarkdown(BODY_MD)}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="mt-6 w-full rounded-xl bg-brand py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Explore Disband
          </button>
        </div>
      </div>
    </div>
  );
}
