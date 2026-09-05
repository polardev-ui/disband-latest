"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { allowMobileWeb, hasAllowedMobileWeb, isMobileGateDisabled, isMobileUserAgent } from "@/lib/mobile-detect";
import { isTauri } from "@/lib/platform";

const APP_STORE_URL = "https://apps.apple.com/app/id6783881800";

/**
 * Paths that must never be interrupted.
 *
 * These are where an email link lands. Covering a password reset or an email
 * confirmation with anything — even a dismissible sheet — puts a step between
 * someone and the thing they came to do, and the old full-page redirect lost
 * the token out of the URL entirely.
 */
const UNINTERRUPTIBLE = ["/reset-password", "/verification", "/bot-invite", "/privacy", "/terms", "/mobile"];

/**
 * Suggests the iOS app to phone browsers.
 *
 * This used to be a redirect to /mobile, which replaced whatever you were
 * doing with a full page. Someone following a password-reset link was taken
 * away from the reset form and could not get back to it, and "Continue on the
 * web" only held for the current page load, so any reload started the argument
 * again. It is a sheet over the current page now: nothing navigates, the page
 * underneath keeps working, and dismissing it is remembered.
 */
export function MobileAppPromo() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isMobileGateDisabled() || isTauri()) return;
    if (!isMobileUserAgent(navigator.userAgent)) return;
    if (hasAllowedMobileWeb()) return;

    const path = window.location.pathname;
    if (UNINTERRUPTIBLE.some((p) => path.startsWith(p))) return;

    setVisible(true);
  }, []);

  function dismiss() {
    allowMobileWeb();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Disband for iOS"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-bg-secondary p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 flex justify-center">
          <Logo adaptive size={56} className="h-14 w-14" priority />
        </div>
        <h2 className="text-[19px] font-bold leading-snug text-text-normal">
          Disband is on the App Store
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
          The iOS app is built for your phone — calls, notifications and all.
        </p>

        <a
          href={APP_STORE_URL}
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <AppleLogo />
          Get it on the App Store
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-xl py-3 text-[14px] font-medium text-text-muted transition-colors hover:text-text-normal"
        >
          Continue on the web
        </button>
      </div>
    </div>
  );
}

function AppleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 384 512" className="h-[17px] w-[17px] fill-current">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-36.8-2.8-77 21.3-91.7 21.3-15.6 0-51.2-20.2-79.2-20.2C56.6 141.8 0 184.5 0 271.6c0 25.7 4.7 52.2 14.1 79.5 12.6 35.9 55.2 122.9 99.6 121.6 23.2-.6 39.6-16.5 69.8-16.5 29.3 0 44.5 16.5 70.4 16.5 44.8-.6 83.3-79.7 95.3-115.7-59.9-28.2-30.5-82.7-30.5-88.3zm-59.3-162.5c19.9-23.6 18.1-45.1 17.5-52.8-17.6 1-38 12-49.6 25.5-12.8 14.5-20.3 32.4-18.7 52.4 19 1.5 36.3-8.3 50.8-25.1z" />
    </svg>
  );
}
