"use client";

import { Logo } from "@/components/ui/Logo";
import { allowMobileWeb } from "@/lib/mobile-detect";

const APP_STORE_URL = "https://apps.apple.com/app/id6783881800";

/**
 * What a phone browser sees.
 *
 * This used to be a waitlist: "Disband is desktop-only for now", collect an
 * email, promise to write when mobile exists. Mobile exists — Disband is on the
 * App Store — so the screen now sends people there, with an escape hatch for
 * anyone who would rather stay in the browser.
 */
export function MobileWaitlistScreen() {
  function continueOnWeb() {
    allowMobileWeb();
    window.location.replace("/app");
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg-tertiary px-6 py-10 text-text-normal">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="text-center">
          <div className="mx-auto mb-5 flex justify-center">
            <Logo adaptive size={72} className="h-18 w-18" priority />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Disband is available on the Apple App Store
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
            The iOS app is built for your phone — calls, notifications and all. Grab it there for
            the best experience.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <a
            href={APP_STORE_URL}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand py-4 text-[16px] font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
          >
            <AppleLogo />
            Get it on the App Store
          </a>

          <button
            type="button"
            onClick={continueOnWeb}
            className="w-full rounded-xl border border-black/20 bg-bg-secondary py-4 text-[15px] font-semibold text-text-normal transition-colors hover:bg-bg-accent"
          >
            Continue on the web
          </button>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-text-muted">
          The web app works on a phone, but it is designed for a larger screen. Android is on the
          way.
        </p>
      </div>
    </div>
  );
}

function AppleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 384 512" className="h-[18px] w-[18px] fill-current">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-36.8-2.8-77 21.3-91.7 21.3-15.6 0-51.2-20.2-79.2-20.2C56.6 141.8 0 184.5 0 271.6c0 25.7 4.7 52.2 14.1 79.5 12.6 35.9 55.2 122.9 99.6 121.6 23.2-.6 39.6-16.5 69.8-16.5 29.3 0 44.5 16.5 70.4 16.5 44.8-.6 83.3-79.7 95.3-115.7-59.9-28.2-30.5-82.7-30.5-88.3zm-59.3-162.5c19.9-23.6 18.1-45.1 17.5-52.8-17.6 1-38 12-49.6 25.5-12.8 14.5-20.3 32.4-18.7 52.4 19 1.5 36.3-8.3 50.8-25.1z" />
    </svg>
  );
}
