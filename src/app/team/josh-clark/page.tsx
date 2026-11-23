import Link from "next/link";
import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

/*
 Unlisted profile of Josh Clark. It isn't linked from the site, isn't in the
 sitemap and asks search engines not to index it: it's only reachable from
 its link. Keep it in line with the Operator section of /legal.
*/

export const metadata: Metadata = {
  title: "Josh Clark — Lead Software Engineer",
  description: "Josh Clark is the lead software engineer and primary developer of Disband, and its former owner.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

const link = "text-text-link hover:underline";

export default function JoshClarkPage() {
  return (
    <div className="min-h-screen bg-bg-secondary text-text-normal">
      <MarketingNav />
      <header className="aero-hero relative overflow-hidden px-6 pb-14 pt-32 text-white">
        <div className="relative z-[1] mx-auto max-w-3xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/70">The Disband team</p>
          <h1 className="mt-2 text-[36px] font-extrabold tracking-[-0.03em] sm:text-[48px]">Josh Clark</h1>
          <p className="mt-2 text-[17px] text-white/85">Lead Software Engineer and primary developer</p>
        </div>
      </header>

      <main className="px-6 py-12">
        <article className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-border-subtle bg-bg-primary p-6 text-[15px] leading-relaxed text-interactive-normal sm:p-10">
          <p>
            Josh Clark is the lead software engineer and primary developer of{" "}
            <Link href="/home" className={link}>Disband</Link>, the chat platform for communities,
            friends and groups. He previously owned Disband, and today leads the engineering work behind
            it across the web, desktop, iOS and Android apps.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">Role</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Lead Software Engineer and primary developer of Disband.</li>
            <li>Former owner of Disband.</li>
          </ul>

          <h2 className="text-lg font-semibold text-header-primary">About Disband</h2>
          <p>
            Disband is owned and operated by Genysis IQ LLC, a Florida limited liability company. More
            details are on the <Link href="/legal" className={link}>legal information</Link> page.
          </p>

          <h2 className="text-lg font-semibold text-header-primary">Contact</h2>
          <p>
            For press and other enquiries, email{" "}
            <a href="mailto:legal@disband.dev" className={link}>legal@disband.dev</a>.
          </p>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
