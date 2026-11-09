import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";
import { ReviewPanel } from "@/app/review/ReviewPanel";

export const metadata: Metadata = {
  title: "Reviews — Disband",
  description: "What people think of Disband — ratings and reviews from the community.",
  alternates: { canonical: "/review" },
};

export default function ReviewPage() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <MarketingNav />
      <main className="pt-14">
        <ReviewPanel />
      </main>
      <MarketingFooter />
    </div>
  );
}
