import Link from "next/link";
import { MarketingFooter, MarketingNav } from "./MarketingLayout";
import { DownloadSection } from "./DownloadSection";
import { ProductFrame } from "./ProductFrame";

const capabilities = [
  {
    index: "01",
    title: "Servers and channels",
    body: "Text and voice channels grouped into categories, with roles, permissions, invite codes, bans, and moderation tools that work the way you expect.",
  },
  {
    index: "02",
    title: "Calls that just start",
    body: "One-to-one and group voice or video over WebRTC, with input and output device switching. No meeting links, no lobby. Screen sharing on Super.",
  },
  {
    index: "03",
    title: "Messages worth keeping",
    body: "Replies, edits, reactions, GIFs, and drag-and-drop uploads — 50 MB free, up to 500 MB on Super. Notes gives you a private space only you can read.",
  },
];

const platformSpecs = [
  { label: "Desktop", value: "macOS · Windows · Linux" },
  { label: "Mobile", value: "iOS" },
  { label: "Browser", value: "Any Chromium or WebKit" },
  { label: "Account", value: "One login, every device" },
];

export function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-[#131417] text-[#dbdee1]">
      <MarketingNav />

      <main className="pt-14">
        {/* Hero — asymmetric: argument on the left, the actual product on the right. */}
        <section className="border-b border-white/[0.06] px-6 py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7b7f87]">
                Disband for desktop, mobile &amp; web
              </p>

              <h1 className="mt-5 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[3.5rem]">
                A place for your
                <br />
                people to talk.
              </h1>

              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[#9aa0a8]">
                Servers, direct messages, group chats, and voice calls — in one app that runs
                natively on your machine and in the browser, from a single account.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#download"
                  className="rounded-md bg-brand px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover"
                >
                  Download for desktop
                </a>
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-1.5 rounded-md px-4 py-3 text-[15px] font-medium text-[#c4c9d0] transition-colors hover:text-white"
                >
                  Open in browser
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>

            <ProductFrame />
          </div>
        </section>

        {/* Specs — concrete facts in a hairline table, not floating cards. */}
        <section className="border-b border-white/[0.06] px-6">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-white/[0.06] lg:grid-cols-4">
            {platformSpecs.map((spec) => (
              <div key={spec.label} className="px-5 py-7 first:pl-0 last:pr-0">
                <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6e727a]">
                  {spec.label}
                </dt>
                <dd className="mt-2 text-sm text-[#c4c9d0]">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Capabilities — numbered columns on rules. No boxes, no backdrop blur. */}
        <section className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-xl text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[2rem]">
              Everything a community needs, and nothing it doesn&rsquo;t.
            </h2>

            <div className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => (
                <article key={item.index} className="border-t border-white/10 pt-6">
                  <p className="font-mono text-[11px] tracking-[0.14em] text-brand">{item.index}</p>
                  <h3 className="mt-4 text-[17px] font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#9aa0a8]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <DownloadSection />

        {/* Closing — a quiet band, not a glowing card. */}
        <section className="border-t border-white/[0.06] px-6 py-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">
                Start talking in about a minute.
              </h2>
              <p className="mt-2 text-[15px] text-[#9aa0a8]">
                Free to create an account. No card, no trial timer.
              </p>
            </div>
            <Link
              href="/login"
              className="shrink-0 rounded-md border border-white/15 px-6 py-3 text-[15px] font-medium text-white transition-colors hover:border-white/30 hover:bg-white/[0.04]"
            >
              Create an account
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
