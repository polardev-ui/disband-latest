"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

// Privacy, Terms and the rest live in the footer; the bar keeps to what
// people come for.
const links = [
  { href: "/downloads", label: "Download" },
  { href: "/developers/docs", label: "Developers" },
  { href: "/review", label: "Reviews" },
  { href: "/donate", label: "Donate" },
];

/**
 * The bar across the top of the marketing pages: a floating glass bar, not a
 * strip. Over the homepage's indigo hero (`overHero`) it's clear glass that
 * lets the colour through; scrolled, or anywhere else, it's darker glass with
 * a soft shadow, so it reads over any page. 60px tall in all, like the bar it
 * replaced, so pages that pad for it don't move.
 */
export function MarketingNav({ overHero = false }: { overHero?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The menu closes when you go somewhere or press Escape.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const clear = overHero && !scrolled && !menuOpen;
  const isActive = (href: string) => pathname === href || Boolean(pathname?.startsWith(`${href}/`));

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-2 sm:px-5">
      <div
        className={`pointer-events-auto mx-auto max-w-5xl overflow-hidden rounded-[20px] ring-1 backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow] duration-300 ease-out ${
          clear
            ? "bg-white/[0.07] shadow-[0_8px_30px_-14px_rgba(20,10,80,0.45)] ring-white/[0.14]"
            : "bg-[#16151c]/80 shadow-[0_14px_40px_-18px_rgba(0,0,0,0.8)] ring-white/[0.09]"
        }`}
      >
        <div className="flex h-[52px] items-center gap-3 pl-3.5 pr-2">
          <Link href="/home" className="flex shrink-0 items-center gap-2 rounded-full pr-1 font-bold tracking-[-0.01em] text-white">
            <Logo size={28} className="h-7 w-7" priority />
            <span className="text-[16px]">Disband</span>
          </Link>

          <nav aria-label="Marketing" className="mx-auto hidden items-center gap-0.5 md:flex">
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors duration-200 ${
                    active ? "bg-white/[0.13] text-white" : "text-white/70 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Link
              href="/login"
              className="hidden rounded-full px-3.5 py-1.5 text-[14px] font-semibold text-white/80 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white sm:block"
            >
              Log in
            </Link>
            <Link
              href="/app"
              className="rounded-full bg-white px-4 py-[7px] text-[14px] font-bold text-[#2b2290] shadow-[0_2px_12px_rgba(10,6,40,0.28)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(10,6,40,0.32)] active:translate-y-0"
            >
              Open Disband
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="marketing-mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d={menuOpen ? "M6 6l12 12" : "M4 8h16"} className="transition-all duration-200" />
                <path d={menuOpen ? "M18 6 6 18" : "M4 16h16"} className="transition-all duration-200" />
              </svg>
            </button>
          </div>
        </div>

        {/* Phones: the links slide open inside the same bar. */}
        <div
          id="marketing-mobile-nav"
          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
            menuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <nav aria-label="Marketing mobile" className="min-h-0 overflow-hidden" inert={!menuOpen}>
            <div className="border-t border-white/[0.08] px-2 pb-2 pt-1.5">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center justify-between rounded-2xl px-3 py-3 text-[16px] font-medium transition-colors ${
                    isActive(l.href) ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {l.label}
                  <span aria-hidden className="text-white/35">›</span>
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="mt-1.5 block rounded-2xl bg-white/[0.08] px-3 py-3 text-center text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.12]"
              >
                Log in
              </Link>
            </div>
          </nav>
        </div>
      </div>
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
    links: [["Donate", "/donate"], ["Bug Report", "/bug-report"], ["Copyright", "/copyright"], ["EU & UK", "/legal/eu-uk"]],
  },
  {
    title: "Legal",
    links: [["Legal Information", "/legal"], ["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["EULA", "/eula"]],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border-subtle bg-bg-secondary px-6 pb-8 pt-14">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5">
            <Logo size={28} className="h-7 w-7" />
            <p className="text-lg font-semibold text-header-primary">Disband</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            Chat, voice, and communities — built for privacy.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:contents">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{col.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-interactive-normal transition-colors hover:text-header-primary">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-white/5 pt-6 text-xs text-text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Genysis IQ LLC. All rights reserved.</p>
        <p>Disband is operated by Genysis IQ LLC, Orlando, Florida.</p>
      </div>
    </footer>
  );
}
