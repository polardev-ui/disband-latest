"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import { IconClose } from "@/components/icons";
import styles from "./ReleaseModal.module.css";

// Independent of the retired release notice, so existing users see this update too.
const SEEN_KEY = "disband-announcement-seen:community-update-2026-10";

export function ReleaseModal() {
  const [open, setOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      // The announcement can still be dismissed when storage is unavailable.
    }
    setOpen(false);
  };

  useOverlayDismiss(dismiss, open);
  const { mounted, exiting } = usePresence(open);

  useEffect(() => {
    if (mounted && !exiting) titleRef.current?.focus({ preventScroll: true });
  }, [mounted, exiting]);

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex="0"]',
    ));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!mounted) return null;

  return (
    <div className={`${styles.overlay} overlay-fade${exiting ? " overlay-fade-out" : ""}`}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-update-title"
        onKeyDown={trapFocus}
        className={`${styles.dialog} ${exiting ? "classic-modal-out" : "classic-modal"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/announcements/tether-sad.png"
          alt=""
          aria-hidden="true"
          width={1536}
          height={1024}
          draggable={false}
          className={styles.tether}
        />
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>A note from Polar</p>
              <h2 id="community-update-title" ref={titleRef} tabIndex={-1} className={styles.title}>
                The future of Disband
              </h2>
            </div>
            <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className={styles.close}>
              <IconClose size={20} />
            </button>
          </header>

          <div className={`${styles.body} channel-scroll`} tabIndex={0} aria-label="Community update">
            <p>
              Recently, Disband was beat by <a href="https://yapper.website" target="_blank" rel="noopener noreferrer">Yapper</a>,
              an entirely AI-coded platform that the owner didn&apos;t put effort into, and reached over 90k users just because a YouTuber posted about it.
            </p>
            <p>
              Additionally, we reached out to Antic, the YouTuber who created Yapper, potentially offering a partnership and a bridge between the platforms.
              Antic&apos;s team replied to us a week ago and we&apos;re still yet to hear from Antic himself.
            </p>
            <p>
              Disband user sign-ups have gone from around 1k a day to under 100, if even breaching 50 a day.
              We do not have the funds to keep this service running. My proposal is to let Disband run until I cannot fund the platform anymore.
              When that happens, Disband will shut down, our website will show a formal announcement, and all services will be deactivated.
            </p>
            <p>
              I do want to hear your thoughts on this; the community, considering the fact we&apos;ve received a lot of suggestions and bug reports.
              I think it&apos;s important to remember that I&apos;m a solo developer, I&apos;m 15, and I&apos;m a regular high schooler.
            </p>
            <aside className={styles.dataNotice}>
              <h3>Your data, if Disband shuts down</h3>
              <p>
                If Disband does shut down, all of your data will be downloadable to you only, then immediately purged.
                You will have <strong>30 days</strong> to reclaim your data.
              </p>
            </aside>
            <p className={styles.signature}>— Polar</p>
          </div>

          <footer className={styles.footer}>
            <span>Thank you for being part of Disband.</span>
            <button type="button" onClick={dismiss} className={styles.confirm}>I&apos;ve read this</button>
          </footer>
        </div>
      </div>
    </div>
  );
}
