import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { LaunchAnnouncement } from "@/components/announcements/LaunchAnnouncement";
import { PUBLIC_ENV } from "@/lib/public-env";

export const SITE_URL = PUBLIC_ENV.webAppUrl;

const homeDescription =
  "Disband is a free, privacy-first chat app for your people — servers and channels, direct messages, group chats, and WebRTC voice and video calls across desktop, mobile, and the web.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Disband",
    template: "%s — Disband",
  },
  description: homeDescription,
  applicationName: "Disband",
  category: "communication",
  keywords: [
    "Disband",
    "chat app",
    "Discord alternative",
    "voice chat",
    "video calls",
    "free chat",
    "servers and channels",
    "group chat",
    "privacy-focused chat",
    "community chat",
  ],
  authors: [{ name: "Disband" }],
  creator: "Disband",
  publisher: "Disband",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Disband",
    title: "Disband — A place for your people to talk",
    description: homeDescription,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Disband — A place for your people to talk",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Disband — A place for your people to talk",
    description: homeDescription,
    images: ["/opengraph-image"],
  },
  icons: {
    // Transparent mark — sits cleanly on light and dark browser chrome.
    icon: "/logo.png",
    shortcut: "/favicon.png",
    // Apple touch icons must stay opaque: iOS composites transparency onto
    // black, so the transparent mark would render as a dark square.
    apple: "/logo-app.png",
  },
  appleWebApp: {
    title: "Disband",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1e1f22",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="referrer" content="no-referrer" />
        <Script id="theme-init" strategy="beforeInteractive">
          {`
(function () {
  try {
    var stored = localStorage.getItem('disband:theme');
    var valid = ['light','dark','midnight','sunset','ocean','rose-gold','plasma','nord'];
    var theme = valid.indexOf(stored) !== -1 ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  } catch (e) {}
})();
          `}
        </Script>
      </head>
      <body>
        {children}
        {/* Site-wide, every route. Renders nothing once dismissed. */}
        <LaunchAnnouncement />
      </body>
    </html>
  );
}
