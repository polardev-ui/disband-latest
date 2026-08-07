import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disband",
  description: "Disband — one codebase, every platform.",
  icons: {
    // Transparent mark — sits cleanly on light and dark browser chrome.
    icon: "/logo.png",
    // Apple touch icons must stay opaque: iOS composites transparency onto
    // black, so the transparent mark would render as a dark square.
    apple: "/logo-app.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e1f22",
  width: "device-width",
  initialScale: 1,
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
      <body>{children}</body>
    </html>
  );
}
