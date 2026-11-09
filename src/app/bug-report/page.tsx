import type { Metadata } from "next";
import { BugReportForm } from "@/components/bugreport/BugReportForm";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

export const metadata: Metadata = {
  title: "Report a Bug",
  description: "Tell the Disband team about a bug so we can fix it.",
  alternates: { canonical: "/bug-report" },
  robots: { index: false, follow: true },
};

export default function BugReportPage() {
  return (
    <div className="min-h-screen bg-bg-secondary text-text-normal">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-24 sm:pt-28">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">Report a bug</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-muted">
          Something not working? Tell us what you expected, what happened instead, and the steps to
          make it happen again. Screenshots and recordings help a lot.
        </p>
        <div className="mt-10">
          <BugReportForm />
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
