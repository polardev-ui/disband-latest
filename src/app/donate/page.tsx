import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";
import { PinchedBill } from "@/components/donate/PinchedBill";
import { DonateClient } from "@/components/donate/DonateClient";

export const metadata: Metadata = {
  title: "Donate",
  description:
    "Disband is run by a small team and paid for every month. Subscriptions don’t cover the cost of running it for everyone, so donations help keep Disband online.",
  alternates: { canonical: "/donate" },
};

const COSTS = [
  {
    title: "Servers and hosting",
    body: "The website, the app back end and the API that every message, upload and sign-in goes through.",
    icon: "M4 6h16v5H4zM4 13h16v5H4zM8 8.5h.01M8 15.5h.01",
  },
  {
    title: "Database and storage",
    body: "Your messages, spaces, profiles, images and files, stored safely and backed up.",
    icon: "M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  },
  {
    title: "Voice, video and screen sharing",
    body: "Relay servers that connect calls and carry streams, even on networks that block direct connections.",
    icon: "M15 10l4.5-2.5v9L15 14M4 7h11v10H4z",
  },
  {
    title: "Safety",
    body: "Tools that detect and remove harmful content, including child sexual abuse material, and help us act on reports quickly.",
    icon: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4",
  },
  {
    title: "Email and notifications",
    body: "Sign-in codes, security alerts, push notifications, and replies to your reports and appeals.",
    icon: "M4 6h16v12H4zM4 7l8 6 8-6",
  },
  {
    title: "App stores and certificates",
    body: "Developer accounts and code-signing certificates needed to publish Disband on iOS, Android and desktop.",
    icon: "M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM11 18h2",
  },
];

const FAQ = [
  {
    q: "Who receives my donation?",
    a: "Genysis IQ LLC, the Florida company that owns and runs Disband. Every donation goes towards the cost of keeping Disband online.",
  },
  {
    q: "Is my donation tax-deductible?",
    a: "No. Genysis IQ is a company, not a registered charity, so donations aren’t tax-deductible in the United States or anywhere else.",
  },
  {
    q: "Do I get anything for donating?",
    a: "No. A donation doesn’t unlock features, badges or a subscription. It simply helps Disband stay running. If you’d like perks, have a look at Aero and Lite.",
  },
  {
    q: "What shows on the wall?",
    a: "The amount, the time, and your message if you leave one. If you’re logged in and choose to show your name, your display name and avatar appear too; otherwise you’re listed as Anonymous. We remove messages that break our Terms of Service.",
  },
  {
    q: "Can I get a refund?",
    a: "Donations are final. If you donated by mistake or were charged the wrong amount, email legal@disband.dev within 14 days and we’ll look into it. This doesn’t affect any rights you have under the law.",
  },
  {
    q: "Is my payment secure?",
    a: "Yes. You pay on Stripe’s checkout page, and your card details go straight to Stripe. Disband never sees or stores them.",
  },
];

export default function DonatePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6 sm:pt-28">
        {/* Hero */}
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#86dca3]">Support Disband</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
              Help keep Disband running.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[#b5bac1]">
              Disband is built and run by a small team. Every message, call and
              upload runs on servers we pay for each month, and right now what Disband earns
              doesn&rsquo;t cover the bill. If Disband matters to you, a donation helps keep it online.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#give"
                className="inline-flex h-12 items-center rounded-xl bg-brand px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Donate now
              </a>
              <a
                href="#costs"
                className="inline-flex h-12 items-center rounded-xl border border-white/10 px-6 text-[15px] font-semibold text-[#dbdee1] transition-colors hover:border-white/25 hover:text-white"
              >
                Where the money goes
              </a>
            </div>
          </div>
          <PinchedBill className="mx-auto w-full max-w-[440px]" />
        </section>

        {/* Why */}
        <section className="mt-24 grid gap-10 border-t border-white/[0.06] pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">Why we&rsquo;re asking</h2>
          <div className="space-y-5 text-[16px] leading-relaxed text-[#b5bac1]">
            <p>
              Running a chat platform isn&rsquo;t cheap. Messages have to be stored, files and images
              served, calls relayed, and harmful content caught before it spreads. Those costs grow with
              every person who joins, whether or not they ever pay.
            </p>
            <p>
              Aero and Lite help, and we&rsquo;re grateful to everyone who subscribes. But
              subscriptions alone don&rsquo;t cover what it costs to run Disband for everyone who uses
              it. We don&rsquo;t sell your data, and we don&rsquo;t want to lock the basics behind a
              paywall, so we&rsquo;re asking the people who use Disband to help close the gap.
            </p>
            <p className="text-white">
              Any amount helps. A few dollars from enough people is what keeps the servers on.
            </p>
          </div>
        </section>

        {/* Costs */}
        <section id="costs" className="mt-20 scroll-mt-24">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">Where the money goes</h2>
          <p className="mt-2 max-w-2xl text-[15px] text-[#949ba4]">
            Donations pay for the services that keep Disband working, day and night.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COSTS.map((c) => (
              <div key={c.title} className="rounded-2xl border border-white/[0.06] bg-[#232428] p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#86dca3]/10 text-[#86dca3]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={c.icon} />
                  </svg>
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-white">{c.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[#949ba4]">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Give + wall */}
        <section className="mt-20">
          <DonateClient />
        </section>

        {/* Fine print */}
        <section className="mt-24 border-t border-white/[0.06] pt-16">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">Good to know</h2>
          <dl className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="text-[16px] font-semibold text-white">{f.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-[#949ba4]">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-[13px] leading-relaxed text-[#6d6f78]">
            Donations are processed by Stripe on behalf of Genysis IQ LLC, 10524 Moss Park Rd, Suite
            204-653, Orlando, Florida 32832, United States. See our{" "}
            <Link href="/terms" className="text-brand hover:underline">Terms of Service</Link> and{" "}
            <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>. Questions:
            legal@disband.dev.
          </p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
