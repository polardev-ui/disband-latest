import type { Metadata } from "next";
import { MarketingHomeRedesign } from "@/components/marketing/MarketingHomeRedesign";

export const metadata: Metadata = {
  title: "Disband — redesign prototype",
  description:
    "Prototype of a redesigned Disband homepage, matching the in-app theme.",
  robots: { index: false, follow: false },
};

export default function HomeRedesignPrototypePage() {
  return <MarketingHomeRedesign />;
}
