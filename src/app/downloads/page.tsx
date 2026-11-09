import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";
import { DownloadSection } from "@/components/marketing/DownloadSection";

export const metadata: Metadata = {
  title: "Download Disband",
  description:
    "Get Disband on PC (Windows, macOS, Linux) and iPhone — no account needed to download.",
  alternates: { canonical: "/downloads" },
};

export default function DownloadsPage() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <MarketingNav />
      <main className="pt-14">
        <DownloadSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
