import type { Metadata } from "next";
import { MobileWaitlistScreen } from "@/components/mobile/MobileWaitlistScreen";

export const metadata: Metadata = {
  title: "Disband for iOS",
  description:
    "Disband is available on the Apple App Store — free voice and text chat for your people, on iPhone and web.",
  alternates: { canonical: "/mobile" },
  openGraph: {
    title: "Disband for iOS — on the App Store",
    description: "Free voice and text chat for your people, now on iPhone — with the web app too.",
    url: "/mobile",
    type: "website",
  },
};

export default function MobilePage() {
  return <MobileWaitlistScreen />;
}
