import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";
import { DiscordConnectPanel } from "@/app/discord-connect/DiscordConnectPanel";

export const metadata: Metadata = {
  title: "Connect Discord — Disband",
  description: "Link your Discord account to Disband and get your username role.",
  alternates: { canonical: "/discord-connect" },
};

export default function DiscordConnectPage() {
  return (
    <div className="min-h-screen bg-[#1e1f22]">
      <MarketingNav />
      <main className="pt-14">
        <Suspense>
          <DiscordConnectPanel />
        </Suspense>
      </main>
      <MarketingFooter />
    </div>
  );
}
