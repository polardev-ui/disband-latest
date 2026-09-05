import type { Metadata } from "next";
import { MarketingHomeGate } from "@/components/marketing/MarketingHomeGate";
import { SITE_URL } from "@/app/layout";

export const metadata: Metadata = {
  title: "Free voice & text chat for your people",
  description:
    "Disband is a free, privacy-first chat app — servers and channels, direct messages, group chats, and voice and video calls across desktop, mobile, and the web.",
  alternates: { canonical: "/home" },
  openGraph: {
    title: "Disband — A place for your people to talk",
    description:
      "Servers and channels, DMs, group chats, and WebRTC voice and video calls in one free, privacy-first app — desktop, mobile, and web.",
    url: "/home",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Disband — A place for your people to talk",
    description:
      "Servers and channels, DMs, group chats, and WebRTC voice and video calls in one free, privacy-first app — desktop, mobile, and web.",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Disband",
      url: SITE_URL,
      inLanguage: "en",
      description:
        "Free, privacy-first chat for your people — servers, direct messages, group chats, and voice and video calls.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Disband",
      url: SITE_URL,
      description:
        "Disband is a free, privacy-first chat app for servers and channels, direct messages, group chats, and WebRTC voice and video calls.",
      applicationCategory: "CommunicationApplication",
      operatingSystem: "macOS, Windows, Linux, iOS, Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      publisher: {
        "@type": "Organization",
        name: "Disband",
        url: SITE_URL,
      },
    },
    {
      "@type": "Organization",
      name: "Disband",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
  ],
};

export default function HomeRoute() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <MarketingHomeGate />
    </>
  );
}