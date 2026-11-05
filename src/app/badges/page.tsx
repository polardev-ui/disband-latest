import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingLayout";
import { BadgeGlyph } from "@/lib/badge-icons";
import { BADGE_GUIDE, RARITY_COLOURS, rarityFor, type BadgeAvailability, type Rarity } from "@/lib/badge-guide";
import { getServiceSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Badges",
  description: "Every Disband profile badge: what it means, how to get it, and how rare it is.",
  alternates: { canonical: "/badges" },
};

// Holder counts are recounted at most once an hour.
export const revalidate = 3600;

interface BadgeRow {
  key: string;
  name: string;
  description: string;
  category: string;
  accent: string;
  sort: number;
}

interface CatalogueEntry extends BadgeRow {
  holders: number | null;
}

const CATEGORIES: { key: string; title: string; blurb: string }[] = [
  { key: "staff", title: "Team", blurb: "The people who run and moderate Disband." },
  { key: "tenure", title: "Supporters and veterans", blurb: "For being here early, and for sticking around." },
  { key: "community", title: "Community", blurb: "For building spaces and bringing people together." },
  { key: "development", title: "Builders", blurb: "For bots, code and translations." },
  { key: "quality", title: "Bug hunting", blurb: "For helping make Disband better and safer." },
  { key: "platform", title: "Platform", blurb: "For trying Disband in new places." },
];

async function loadCatalogue(): Promise<{ badges: CatalogueEntry[]; users: number | null }> {
  const service = getServiceSupabase();
  if (!service) return { badges: [], users: null };

  const { data } = await service.from("badges").select("key, name, description, category, accent, sort").order("sort");
  const rows = (data ?? []) as BadgeRow[];

  const [users, ...counts] = await Promise.all([
    service.from("profiles").select("id", { count: "exact", head: true }).or("is_bot.is.null,is_bot.eq.false"),
    ...rows.map((b) => service.from("user_badges").select("user_id", { count: "exact", head: true }).eq("badge_key", b.key)),
  ]);

  return {
    users: users.count ?? null,
    badges: rows.map((b, i) => ({ ...b, holders: counts[i]?.count ?? null })),
  };
}

function availabilityLabel(a: BadgeAvailability, now: number): { text: string; tone: "open" | "limited" | "closed" | "staff" } {
  switch (a.kind) {
    case "open":
      return { text: "Available", tone: "open" };
    case "until":
      return now < Date.parse(a.date)
        ? { text: `Available until ${a.label}`, tone: "limited" }
        : { text: "No longer available", tone: "closed" };
    case "staff":
      return { text: "Given by Disband", tone: "staff" };
    case "retired":
      return { text: "No longer available", tone: "closed" };
  }
}

const TONE_CLASSES = {
  open: "border-[#3ba55d]/30 bg-[#3ba55d]/10 text-[#6fd391]",
  limited: "border-[#f0b232]/35 bg-[#f0b232]/10 text-[#f5c862]",
  closed: "border-white/10 bg-white/[0.04] text-[#9aa0a8]",
  staff: "border-[#5865f2]/30 bg-[#5865f2]/10 text-[#a5adff]",
};

function formatShare(holders: number, users: number): string {
  const pct = (holders / users) * 100;
  if (holders === 0) return "Nobody yet";
  if (pct < 0.01) return "under 0.01%";
  if (pct < 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(1)}%`;
}

function BadgeCard({ badge, users, now }: { badge: CatalogueEntry; users: number | null; now: number }) {
  const guide = BADGE_GUIDE[badge.key];
  const availability = guide ? availabilityLabel(guide.availability, now) : null;
  const rarity: Rarity | null = badge.holders !== null && users ? rarityFor(badge.holders, users) : null;

  return (
    <li
      id={badge.key}
      className="flex min-w-0 scroll-mt-20 flex-col gap-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"
    >
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
          style={{ color: badge.accent, backgroundColor: `${badge.accent}1a`, borderColor: `${badge.accent}40` }}
        >
          <BadgeGlyph badgeKey={badge.key} size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold leading-tight text-white">{badge.name}</h3>
          <p className="mt-1 text-[14px] leading-snug text-[#b5bac1]">{badge.description}</p>
        </div>
      </div>

      {guide && (
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#6e727a]">How to get it</p>
          <p className="mt-1 text-[14px] leading-relaxed text-[#9aa0a8]">{guide.howTo}</p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {rarity && (
          <span
            className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold"
            style={{ color: RARITY_COLOURS[rarity], borderColor: `${RARITY_COLOURS[rarity]}55`, backgroundColor: `${RARITY_COLOURS[rarity]}14` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RARITY_COLOURS[rarity] }} />
            {rarity}
          </span>
        )}
        {availability && (
          <span className={`inline-flex h-6 items-center rounded-full border px-2.5 text-[12px] font-medium ${TONE_CLASSES[availability.tone]}`}>
            {availability.text}
          </span>
        )}
        {badge.holders !== null && users ? (
          <span className="ml-auto text-[12px] tabular-nums text-[#6e727a]">
            {badge.holders.toLocaleString("en-GB")} {badge.holders === 1 ? "person" : "people"} · {formatShare(badge.holders, users)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export default async function BadgesPage() {
  const { badges, users } = await loadCatalogue();
  // Rendered at most hourly, so "now" only needs to be roughly right.
  const now = Date.now();
  const known = new Set(CATEGORIES.map((c) => c.key));
  const sections = [
    ...CATEGORIES,
    ...[...new Set(badges.map((b) => b.category))]
      .filter((c) => !known.has(c))
      .map((c) => ({ key: c, title: c.charAt(0).toUpperCase() + c.slice(1), blurb: "" })),
  ]
    .map((c) => ({ ...c, badges: badges.filter((b) => b.category === c.key) }))
    .filter((c) => c.badges.length > 0);

  return (
    <div className="min-h-screen bg-[#1e1f22]">
      <MarketingNav />
      <main className="px-4 pb-24 pt-28 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6e727a]">Profile badges</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-white sm:text-[2.5rem]">Badges</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#9aa0a8]">
            Badges sit on your profile next to your name. Here&apos;s what each one means, how to get it, and how many
            people have it.
          </p>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[#9aa0a8]">
            {(Object.keys(RARITY_COLOURS) as Rarity[]).map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RARITY_COLOURS[r] }} />
                <span className="font-medium" style={{ color: RARITY_COLOURS[r] }}>{r}</span>
                <span className="text-[#6e727a]">{RARITY_RANGES[r]}</span>
              </span>
            ))}
          </div>

          {sections.length === 0 ? (
            <p className="mt-16 text-[15px] text-[#9aa0a8]">Badges couldn&apos;t be loaded right now. Try again in a minute.</p>
          ) : (
            sections.map((section) => (
              <section key={section.key} className="mt-14">
                <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">{section.title}</h2>
                {section.blurb && <p className="mt-1 text-[14px] text-[#9aa0a8]">{section.blurb}</p>}
                <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.badges.map((b) => (
                    <BadgeCard key={b.key} badge={b} users={users} now={now} />
                  ))}
                </ul>
              </section>
            ))
          )}

          {users ? (
            <p className="mt-14 text-[13px] text-[#6e727a]">
              Rarity is the share of all {users.toLocaleString("en-GB")} Disband accounts holding each badge, updated hourly.
            </p>
          ) : null}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

const RARITY_RANGES: Record<Rarity, string> = {
  Legendary: "under 0.05%",
  Epic: "under 0.5%",
  Rare: "under 5%",
  Uncommon: "under 20%",
  Common: "20% or more",
};
