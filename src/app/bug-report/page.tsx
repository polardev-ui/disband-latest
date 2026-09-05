import type { Metadata } from "next";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";
import { BugReportForm } from "@/components/bugreport/BugReportForm";
import { BUG_REPORT_EMAIL } from "@/lib/bug-reports";

export const metadata: Metadata = {
  title: "Bug Report",
  description: "Report a bug in Disband and earn the Bug Bounty Hunter badge if we fix it.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function BugReportPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#43b581]">Bug Report</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Help us fix Disband</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#b5bac1]">
          Found something broken? Tell us what happened, how to reproduce it, and attach
          screenshots or a video if you can. If we fix your bug, you&apos;ll receive the{" "}
          <span className="font-semibold text-[#43b581]">Bug Bounty Hunter</span> badge on your
          profile. Reports are also emailed to{" "}
          <a href={`mailto:${BUG_REPORT_EMAIL}`} className="text-[#00a8fc] hover:underline">
            {BUG_REPORT_EMAIL}
          </a>
          .
        </p>

        <div className="mt-10">
          <BugReportForm />
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
