import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disband",
  description: "Disband — one codebase, every platform.",
  icons: {
    icon: "/favicon.png",
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
