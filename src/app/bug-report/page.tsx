import type { Metadata } from "next";

import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Bug Report",
  description: "Disband bug reporting is retired and being refreshed into a better flow.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function BugReportPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />

      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-6 py-12">
        <section className="relative w-full max-w-2xl overflow-hidden rounded-[8px] p-8 sm:p-12">
          <div className="absolute left-0 right-0 top-0 h-4 bg-[repeating-linear-gradient(-45deg,#facc15_0px,#facc15_12px,#090a0c_12px,#090a0c_24px)]" />
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-[repeating-linear-gradient(45deg,#facc15_0px,#facc15_12px,#090a0c_12px,#090a0c_24px)]" />

          <div className="pt-2 text-center">
            <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.02em] text-yellow-300">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
              Under construction
            </p>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Bug reporting is retired and being refreshed
            </h1>

            <p className="mt-4 text-base leading-7 text-[#b5bac1]">
              We received over <strong className="text-white">3,200 unregulated bug reports</strong> in
              the old form and could not reliably measure, deduplicate, or triage all of them. The page
              has been taken down so we can rebuild it into a calmer, structured reporting flow.
            </p>

            <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
              <div className="rounded-lg border border-white/5 bg-white/[0.03] p-4">
                <p className="text-xs font-mono uppercase tracking-[0.02em] text-[#6e727a]">
                  Former count
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-white">3,200+</p>
                <p className="mt-1 text-sm text-[#9aa0a8]">unregulated reports</p>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.03] p-4">
                <p className="text-xs font-mono uppercase tracking-[0.02em] text-[#6e727a]">
                  New flow
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">Coming soon</p>
                <p className="mt-1 text-sm text-[#9aa0a8]">consistent steps &amp; verification</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/support"
                className="rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                Open Support
              </Link>
              <Link
                href="/app"
                className="rounded-md border border-white/15 px-5 py-3 text-sm font-medium text-[#e6e7eb] transition-colors hover:border-white/30 hover:text-white"
              >
                Back to Disband
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
