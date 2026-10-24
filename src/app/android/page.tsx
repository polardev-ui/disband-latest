import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";
import { Logo } from "@/components/ui/Logo";

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.wsgpolar.disband";

export const metadata: Metadata = {
  title: "Disband for Android",
  description:
    "Disband is on Google Play — chat, voice calls, and notifications on your Android phone.",
  alternates: { canonical: "/android" },
  openGraph: {
    title: "Disband for Android — on Google Play",
    description:
      "Chat, voice calls, and notifications on Android. Get Disband on Google Play.",
    url: "/android",
    type: "website",
  },
};

const steps = [
  {
    n: "1",
    title: "Open Google Play",
    body: "Tap “Get it on Google Play” on your phone, or search for Disband in the Play Store.",
  },
  {
    n: "2",
    title: "Install Disband",
    body: "Tap Install. Updates arrive automatically through Google Play as new versions ship.",
  },
  {
    n: "3",
    title: "Sign in",
    body: "Use the same account as everywhere else — your spaces, DMs, and friends are already there.",
  },
];

const highlights = [
  {
    title: "Full chat",
    body: "Servers, channels, DMs, group chats, threads of replies, reactions, and attachments — the same conversations as desktop and iPhone.",
  },
  {
    title: "Voice calls",
    body: "One-to-one calls and voice channels with an ongoing-call notification, so a call survives leaving the app.",
  },
  {
    title: "Push notifications",
    body: "Mentions, DMs, and calls arrive even with the app closed. Tapping one drops you in the right conversation.",
  },
  {
    title: "Your setup, kept",
    body: "Themes, Aero perks, badges, status, and referrals all carry over — it is your account, on your phone.",
  },
];

export default function AndroidPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22]">
      <MarketingNav />
      <main className="pt-14">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 py-20 sm:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(640px 320px at 50% -40px, rgba(88,101,242,0.28), transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mb-5 flex justify-center">
              <Logo size={72} className="h-18 w-18" priority />
            </div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#fee75c]/40 bg-[#fee75c]/10 px-4 py-1.5 text-xs font-bold tracking-[0.14em] text-[#fee75c] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-[#fee75c]" />
              Now on Google Play
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-[-0.02em] text-white sm:text-5xl">
              Disband is on Android
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-[#b5bac1]">
              Disband is out now on Google Play. Same account, same people, same
              conversations — now in your pocket.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-7 py-4 text-[16px] font-semibold text-white shadow-lg transition-opacity hover:opacity-90 sm:w-auto"
              >
                <PlayTriangle />
                Get it on Google Play
              </a>
              <Link
                href="/app"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-7 py-4 text-[15px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.04] sm:w-auto"
              >
                Continue on the web
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-[#6e727a]">
              Free. Requires Android 8.0 or later.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="border-t border-white/[0.06] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[2rem]">
              Get it in about a minute
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {steps.map((s) => (
                <div
                  key={s.n}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
                >
                  <p className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[15px] font-bold text-white">
                    {s.n}
                  </p>
                  <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#9aa0a8]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What's inside */}
        <section className="border-t border-white/[0.06] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[2rem]">
              What&apos;s in the app
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#9aa0a8]">
              It is the real app, not a demo — built to match the iPhone release feature for
              feature.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {highlights.map((h) => (
                <div
                  key={h.title}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
                >
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Check />
                    {h.title}
                  </h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#9aa0a8]">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bug report */}
        <section className="border-t border-white/[0.06] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl rounded-2xl border border-[#fee75c]/25 bg-[#fee75c]/[0.04] p-6 text-center sm:p-10">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white">
              Something not right? Tell us
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[#9aa0a8]">
              If something looks wrong, crashes, or just feels off next to the iPhone
              app, send a bug report and we&apos;ll fix it in the next update.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-7 py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                <PlayTriangle />
                Get it on Google Play
              </a>
              <Link
                href="/bug-report"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.04] sm:w-auto"
              >
                Report a bug
              </Link>
            </div>
          </div>
        </section>

        {/* Other platforms */}
        <section className="border-t border-white/[0.06] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl text-center">
            <p className="text-[15px] text-[#9aa0a8]">
              On iPhone instead?{" "}
              <Link href="/mobile" className="font-semibold text-white hover:underline">
                Get Disband on the App Store
              </Link>{" "}
              · On a computer?{" "}
              <Link href="/downloads" className="font-semibold text-white hover:underline">
                Download for desktop
              </Link>
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function PlayTriangle() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
      <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.5-6.86a1.03 1.03 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14Z" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-[#23a55a]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
