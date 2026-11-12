import type { Metadata } from "next";
import { MarketingHomeGate } from "@/components/marketing/MarketingHomeGate";
import { SITE_URL } from "@/app/layout";

export const metadata: Metadata = {
  title: "Free voice & text chat for your people",
  description:
    "Disband is a free, privacy-first chat app — spaces and channels, direct messages, group chats, and voice and video calls across desktop, mobile, and the web.",
  alternates: { canonical: "/home" },
  openGraph: {
    title: "Disband — A place for your people to talk",
    description:
      "Spaces and channels, DMs, group chats, and WebRTC voice and video calls in one free, privacy-first app — desktop, mobile, and web.",
    url: "/home",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Disband — A place for your people to talk",
    description:
      "Spaces and channels, DMs, group chats, and WebRTC voice and video calls in one free, privacy-first app — desktop, mobile, and web.",
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
        "Free, privacy-first chat for your people — spaces, direct messages, group chats, and voice and video calls.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Disband",
      url: SITE_URL,
      description:
        "Disband is a free, privacy-first chat app for spaces and channels, direct messages, group chats, and WebRTC voice and video calls.",
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

// Runs before the page paints. A saved session usually means the visitor is
// on their way to /app, so the page stays hidden while MarketingHomeGate
// checks; everyone else sees it straight away, server-rendered.
const SIGNED_IN_HINT = `try{if(Object.keys(localStorage).some(function(k){return /^sb-.+-auth-token$/.test(k)}))document.documentElement.dataset.signedIn="1"}catch(e){}`;

export default function HomeRoute() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_HINT }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <MarketingHomeGate />
    </>
  );
}