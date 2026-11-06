"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

const links = [
  { href: "/home", label: "Home" },
  { href: "/downloads", label: "Downloads" },
  { href: "/review", label: "Reviews" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#1e1f22]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/home" className="flex items-center gap-2.5 font-bold text-white">
          <Logo size={32} className="h-8 w-8" priority />
          Disband
        </Link>
        <nav aria-label="Marketing" className="hidden items-center gap-5 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm transition-colors ${
                pathname === l.href ? "text-white" : "text-[#b5bac1] hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Log in
          </Link>
          {/* Mobile nav: the link row used to be hidden below sm with no
              replacement, leaving phones with zero navigation. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#b5bac1] transition-colors hover:bg-white/10 hover:text-white sm:hidden"
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav aria-label="Marketing mobile" className="border-t border-white/5 px-6 py-3 sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`block rounded-md px-2 py-2.5 text-[15px] transition-colors ${
                pathname === l.href ? "text-white" : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

const FOOTER_COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [["Downloads", "/downloads"], ["Badges", "/badges"], ["Reviews", "/review"], ["Log in", "/login"]],
  },
  {
    title: "Support",
    links: [["Bug Report", "/bug-report"], ["Copyright", "/copyright"], ["EU & UK", "/legal/eu-uk"]],
  },
  {
    title: "Legal",
    links: [["Legal Information", "/legal"], ["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["EULA", "/eula"]],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#1e1f22] px-6 pb-8 pt-14">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5">
            <Logo size={28} className="h-7 w-7" />
            <p className="text-lg font-semibold text-white">Disband</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#949ba4]">
            Chat, voice, and communities — built for privacy.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:contents">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6e727a]">{col.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-[#b5bac1] transition-colors hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-white/5 pt-6 text-xs text-[#72767d] sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Genysis IQ LLC. All rights reserved.</p>
        <p>Disband is operated by Genysis IQ LLC, Orlando, Florida.</p>
      </div>
    </footer>
  );
}
