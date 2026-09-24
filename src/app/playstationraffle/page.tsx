import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Official PlayStation 5 Giveaway — Disband",
  description:
    "Win a PlayStation 5 or a $600 gift card. Leave a 5-star review or refer friends — every 2 verified referrals earns you an extra entry. One winner, drawn December 15, open worldwide.",
  alternates: { canonical: "/playstationraffle" },
  openGraph: {
    title: "Win a PlayStation 5 — Official Disband Giveaway",
    description:
      "Leave a 5-star review or refer friends to earn entries. Every 2 verified referrals = one extra entry, stacked unlimited. One winner drawn December 15 — worldwide.",
    url: "/playstationraffle",
    type: "website",
  },
};

const steps = [
  {
    n: "01",
    title: "Rate Disband 5 stars",
    body: "Post a 5-star review on the Reviews page. One verified account = one review entry.",
    href: "/review",
    cta: "Write your review",
  },
  {
    n: "02",
    title: "Refer your people",
    body: "Share your personal referral link. Every 2 friends who join with a verified email earns you one extra entry — stack as many as you like.",
    href: "/leaderboards/referrals",
    cta: "See the leaderboard",
  },
  {
    n: "03",
    title: "We draw one winner",
    body: "On December 15 we randomly draw a single winner and email them at the address on their Disband account.",
  },
];

const facts = [
  {
    label: "Entries",
    body: "Every 5-star review counts as one entry, and every 2 verified referrals adds another — they stack, so referring more people never stops paying off.",
  },
  {
    label: "Referrals that stack",
    body: "A referral is counted the moment the invited friend verifies their email on Disband. Review entries and referral entries both count — they don't cancel each other.",
  },
  {
    label: "Prize",
    body: "A brand‑new PlayStation 5, shipped to the winner — or a $600 gift card if you'd rather take the cash. International winners welcome.",
  },
  {
    label: "Winner selection",
    body: "One winner is drawn at random on December 15 and contacted by email. You'll have 7 days to confirm your prize choice before a runner‑up is drawn.",
  },
];

export default function PlayStationRafflePage() {
  return (
    <div className="min-h-screen bg-[#1e1f22]">
      <MarketingNav />
      <main className="pt-14">
        {/* Hero */}
        <section className="border-b border-white/5 bg-gradient-to-b from-[#1858be]/25 via-transparent to-transparent">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
              Official Disband Giveaway
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Win a <span className="bg-gradient-to-r from-brand to-[#5865f2] bg-clip-text text-transparent">PlayStation 5</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#b5bac1]">
              Rate Disband 5 stars or refer your people — every step earns real entries.
              One winner drawn <span className="font-semibold text-white">December 15</span>, open worldwide.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/review"
                className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Enter now — leave a review
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Log in to get your link
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">How the giveaway works</h2>
          <p className="mt-2 max-w-2xl text-[#9aa0a8]">
            Three steps, real entries, one winner. No purchase required — a review or a referral gets you in.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-colors hover:border-white/20"
              >
                <span className="font-mono text-sm font-bold text-brand">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#9aa0a8]">{s.body}</p>
                {s.cta && s.href && (
                  <Link href={s.href} className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand hover:text-white">
                    {s.cta}
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Rules & details */}
        <section className="border-y border-white/5 bg-[#1a1b1e]">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">The details</h2>
            <p className="mt-2 max-w-2xl text-[#9aa0a8]">
              Everything you need to know, in plain language.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
                  <h3 className="font-semibold text-white">{f.label}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9aa0a8]">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Fine print */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-sm leading-relaxed text-[#8e939b]">
            <h2 className="font-semibold text-white">Official rules</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                One entry per verified 5-star review on the <Link href="/review" className="text-brand hover:text-white">Reviews page</Link>.
                Every 2 verified referrals adds one entry; entries stack with no cap.
              </li>
              <li>
                A referral counts when the invited friend verifies their email on Disband. Referrals and reviews both count — they combine.
              </li>
              <li>
                One winner is selected at random on December 15 and notified by email at the address on their Disband account. Winners have 7 days to confirm their prize (console shipped to the address they provide, or a $600 gift card); if they don't respond, a runner‑up is drawn.
              </li>
              <li>
                Open worldwide. No purchase required. Void where prohibited. Participation and prize fulfillment are subject to Disband's{" "}
                <Link href="/terms" className="text-brand hover:text-white">Terms of Service</Link> and{" "}
                <Link href="/privacy" className="text-brand hover:text-white">Privacy Policy</Link>.
              </li>
            </ul>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
