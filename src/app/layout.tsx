import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Noto_Sans } from "next/font/google";
import "./globals.css";
import { THEMES } from "@/lib/theme/themes";
import { PUBLIC_ENV } from "@/lib/public-env";
import { I18nProvider } from "@/contexts/I18nContext";

// Geist (Vercel) — self-hosted via next/font/google → woff2 bundled at build,
// served from our own origin, no runtime font CDN hit (privacy-first).
const GeistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
// The app UI uses Noto Sans — the face Discord itself falls back to when its
// proprietary gg sans is unavailable — so the classic layout keeps its metrics.
const NotoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto", weight: ["400", "500", "600", "700", "800"] });

export const SITE_URL = PUBLIC_ENV.webAppUrl;

const homeDescription =
  "Disband is a free, privacy-first chat app for your people — spaces and channels, direct messages, group chats, and WebRTC voice and video calls across desktop, mobile, and the web.";

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
    "spaces and channels",
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

    icon: "/logo.png",
    shortcut: "/favicon.png",

    apple: "/logo-app.png",
  },
  appleWebApp: {
    title: "Disband",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // On iOS the keyboard otherwise overlays the webview instead of resizing
  // it, which stranded the chat mid-history when the keyboard opened.
  interactiveWidget: "resizes-content",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning
          className={`${GeistSans.variable} ${NotoSans.variable}`}>
      <head>
        <meta name="referrer" content="no-referrer" />
        <link rel="preload" as="image" href="/logo.png" />
        <Script id="theme-init" strategy="beforeInteractive">
          {`
(function () {
  try {
    var stored = localStorage.getItem('disband:theme');
    var themes = ${JSON.stringify(THEMES.map(t=>({id:t.id,mode:t.mode||"dark"}))).replace(/</g,"\\u003c")};
    var valid = themes.map(function(t){return t.id;});
    var theme = valid.indexOf(stored) !== -1 ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = themes.find(function(t){return t.id===theme;}).mode;
  } catch (e) {}
  try {
    var motion = localStorage.getItem('disband:motion');
    if (motion === 'reduced' || motion === 'full') {
      document.documentElement.setAttribute('data-motion', motion);
    }
  } catch (e) {}
  try {
    var language = localStorage.getItem('disband:language');
    if (language) document.documentElement.lang = language;
  } catch (e) {}
  try {
    // Desktop (Tauri) detection, set before first paint so the shell never
    // flashes a selectable, browser-shaped page before the app styles land.
    var proto = window.location.protocol;
    var tauri = ('__TAURI_INTERNALS__' in window) || ('__TAURI__' in window)
      || proto === 'tauri:' || proto === 'asset:' || window.location.hostname === 'tauri.localhost';
    if (tauri) {
      var el = document.documentElement;
      var ua = navigator.userAgent || '';
      var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
      el.setAttribute('data-desktop', 'true');
      el.setAttribute('data-desktop-os',
        (/mac|darwin/i.test(plat) || /Mac OS X/i.test(ua)) ? 'macos'
        : (/win/i.test(plat) || /Windows/i.test(ua)) ? 'windows'
        : (/linux/i.test(plat) || /Linux/i.test(ua)) ? 'linux'
        : 'other');
    }
  } catch (e) {}
})();
          `}
        </Script>
      </head>
      <body>
        <I18nProvider>{children}</I18nProvider>
        {}
      </body>
    </html>
  );
}
