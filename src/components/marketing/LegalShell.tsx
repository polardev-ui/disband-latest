"use client";

/*
 Shared frame for the policy pages (Privacy, Terms, EULA, EU and UK,
 Copyright): an indigo title band, then the document in a bordered card with
 an "On this page" list built from its section headings, which stays in view
 beside the text on wide screens.
*/

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MarketingFooter, MarketingNav } from "./MarketingLayout";

const POLICIES: [string, string][] = [
  ["Privacy Policy", "/privacy"],
  ["Terms of Service", "/terms"],
  ["EULA", "/eula"],
  ["EU and UK", "/legal/eu-uk"],
  ["Copyright", "/copyright"],
  ["Legal information", "/legal"],
];

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
}

export function LegalShell({ title, updated, path, children }: { title: string; updated: string; path: string; children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const used = new Set<string>();
    const items = [...body.querySelectorAll("h2")].map((h) => {
      const text = (h.textContent ?? "").trim();
      let id = h.id || slug(text);
      while (used.has(id)) id = `${id}-x`;
      used.add(id);
      h.id = id;
      h.style.scrollMarginTop = "96px";
      return { id, text };
    });
    setToc(items);
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px" },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-bg-secondary text-text-normal">
      <MarketingNav />
      <header className="aero-hero relative overflow-hidden px-6 pb-14 pt-32 text-white">
        <div className="relative z-[1] mx-auto max-w-6xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/70">Disband legal</p>
          <h1 className="mt-2 text-[36px] font-extrabold tracking-[-0.03em] sm:text-[48px]">{title}</h1>
          <p className="mt-2 text-[15px] text-white/80">Last updated {updated}</p>
          <nav aria-label="Policies" className="mt-6 flex flex-wrap gap-2">
            {POLICIES.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 transition-colors ${
                  href === path ? "bg-white text-[#2b2290] ring-white" : "bg-black/20 text-white/85 ring-white/15 hover:bg-black/30 hover:text-white"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          {toc.length > 0 && (
            <nav aria-label="On this page" className="sticky top-24">
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">On this page</p>
              <ul className="max-h-[calc(100vh-140px)] space-y-0.5 overflow-y-auto pr-1">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`block rounded-lg px-3 py-1.5 text-[13px] leading-snug transition-colors ${
                        active === item.id ? "bg-interactive-selected font-semibold text-header-primary" : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                      }`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
        <div
          ref={bodyRef}
          className="legal-body min-w-0 rounded-2xl border border-border-subtle bg-bg-secondary-alt px-6 py-8 sm:px-10"
        >
          {children}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
