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

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#1e1f22] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={28} className="h-7 w-7" />
          <div>
            <p className="font-semibold text-white">Disband</p>
            <p className="mt-1 text-sm text-[#949ba4]">Chat, voice, and communities — built for privacy.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-[#b5bac1]">
          <Link href="/bug-report" className="hover:text-white">Bug Report</Link>
          <Link href="/downloads" className="hover:text-white">Downloads</Link>
          <Link href="/review" className="hover:text-white">Reviews</Link>
          <Link href="/legal" className="hover:text-white">Legal</Link>
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          <Link href="/login" className="hover:text-white">Log in</Link>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-xs text-[#72767d]">
        © {new Date().getFullYear()} Disband. All rights reserved.
      </p>
    </footer>
  );
}
