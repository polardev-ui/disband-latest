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
 * The bar across the top of the marketing pages. With `overHero` (the
 * homepage) it starts clear, so the indigo hero runs to the top of the
 * window, and turns into a frosted bar once the page scrolls. Elsewhere it's
 * always the frosted bar, which reads on any page behind it.
 */
export function MarketingNav({ overHero = false }: { overHero?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overHero) return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  const solid = !overHero || scrolled || menuOpen;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-out ${
        solid
          ? "border-white/10 bg-[#15141b]/80 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.7)] backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent shadow-none"
      }`}
    >
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-5 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
        <Link href="/home" className="flex items-center gap-2.5 justify-self-start font-bold tracking-[-0.01em] text-white">
          <Logo size={30} className="h-[30px] w-[30px]" priority />
          <span className="text-[17px]">Disband</span>
        </Link>

        <nav aria-label="Marketing" className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname?.startsWith(`${l.href}/`));
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-200 ${
                  active ? "bg-white/[0.14] text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          <Link
            href="/login"
            className="rounded-full bg-white px-4 py-2 text-[14px] font-bold text-[#2b2290] shadow-[0_2px_10px_rgba(10,6,40,0.25)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(10,6,40,0.3)] active:translate-y-0"
          >
            Log in
          </Link>
          {/* Phones get the links in a menu instead. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white md:hidden"
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
        <nav id="marketing-mobile-nav" aria-label="Marketing mobile" className="border-t border-white/10 px-5 pb-4 pt-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`block rounded-xl px-3 py-3 text-[16px] font-medium transition-colors ${
                pathname === l.href ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/[0.06] hover:text-white"
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
