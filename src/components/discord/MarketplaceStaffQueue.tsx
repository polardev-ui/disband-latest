"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { safeWindowOpen, thumbImageUrl } from "@/lib/safe-url";
import { IconBot, IconCheck, IconClose, IconShield, IconSparkle } from "@/components/icons";
import { LoadingDots } from "@/components/ui/LoadingDots";

/*
 The bot marketplace's staff queue: Team Support's Marketplace tab and the
 marketplace's own Staff queue window both show this.

 Every bot and reported review shows Tether's verdict (what it decided, why,
 and whether it needs a person). "Review now" moves an item to the top of
 Tether's list and has Tether look at it on the spot; staff can also decide
 directly.
*/

type TetherListing = "approve" | "reject" | "unsure" | null;
type TetherReport = "uphold" | "dismiss" | "unsure" | null;

interface Listing {
  bot_id: string;
  display_name: string | null;
  tagline: string | null;
  category: string | null;
  tags: string[] | null;
  description: string | null;
  website_url: string | null;
  support_url: string | null;
  privacy_url: string | null;
  terms_url: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: "tether" | "staff" | null;
  review_note: string | null;
  tether_decision: TetherListing;
  tether_reason: string | null;
  tether_reviewed_at: string | null;
  needs_human: boolean;
  priority_requested_at: string | null;
  bots: { name: string; avatar_url: string | null; authorization_count: number; profiles: { username: string | null; display_name: string | null } | null };
}

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "needs_staff" | "upheld" | "dismissed";
  decided_by: "tether" | "staff" | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  tether_decision: TetherReport;
  tether_reason: string | null;
  tether_reviewed_at: string | null;
  priority_requested_at: string | null;
  bot_reviews: { id: string; rating: number; body: string | null; created_at: string; hidden_at: string | null; bots: { name: string; avatar_url: string | null } };
}

interface Queue {
  listings: Listing[];
  decidedListings: Listing[];
  reports: Report[];
  decidedReports: Report[];
}

type Tab = "waiting" | "human" | "reports" | "decided";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const REASON: Record<string, string> = { fake: "Fake", not_real: "Not a real user", spam: "Spam", abusive: "Abusive", other: "Other" };

function Avatar({ url, name, size = 44 }: { url: string | null; name: string; size?: number }) {
  const src = thumbImageUrl(url, size);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="shrink-0 rounded-[28%] object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-[28%] bg-brand text-white" style={{ width: size, height: size }} aria-label={name}>
      <IconBot size={Math.round(size * 0.5)} />
    </span>
  );
}

function Chip({ tone, children }: { tone: "green" | "red" | "amber" | "brand" | "muted"; children: React.ReactNode }) {
  const cls = {
    green: "bg-status-online/15 text-status-online",
    red: "bg-status-dnd/15 text-status-dnd",
    amber: "bg-amber-400/15 text-amber-300",
    brand: "bg-brand/15 text-brand",
    muted: "bg-bg-tertiary text-text-muted",
  }[tone];
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

/** What Tether said about an item, or that it hasn't looked yet. */
function Verdict({
  decision,
  reason,
  at,
  needsHuman,
  labels,
}: {
  decision: string | null;
  reason: string | null;
  at: string | null;
  needsHuman: boolean;
  labels: Record<string, [string, "green" | "red" | "amber"]>;
}) {
  if (!decision) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/[0.08] px-3 py-2.5 text-[13px] text-text-muted">
        <IconSparkle size={15} /> Tether hasn&apos;t reviewed this yet.
      </div>
    );
  }
  const [label, tone] = labels[decision] ?? [decision, "amber"];
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-primary/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-header-secondary">
          <IconSparkle size={14} /> Tether
        </span>
        <Chip tone={tone}>{label}</Chip>
        {needsHuman ? <Chip tone="amber">Needs a human</Chip> : <Chip tone="muted">No human needed</Chip>}
        <span className="ml-auto text-[11px] text-text-muted">{when(at)}</span>
      </div>
      {reason && <p className="mt-1.5 text-[13px] leading-[18px] text-text-normal">{reason}</p>}
    </div>
  );
}

const LISTING_LABELS: Record<string, [string, "green" | "red" | "amber"]> = {
  approve: ["Would approve", "green"],
  reject: ["Would reject", "red"],
  unsure: ["Unsure", "amber"],
};
const REPORT_LABELS: Record<string, [string, "green" | "red" | "amber"]> = {
  uphold: ["Hide the review", "red"],
  dismiss: ["Keep the review", "green"],
  unsure: ["Unsure", "amber"],
};

const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition-[opacity,transform] hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50";

export function MarketplaceStaffQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("waiting");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/marketplace");
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't load the queue.");
      setQueue((await res.json()) as Queue);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the queue.");
      setQueue((q) => q ?? { listings: [], decidedListings: [], reports: [], decidedReports: [] });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(key: string, body: Record<string, unknown>, done: string) {
    setBusy(key);
    try {
      const res = await apiFetch("/api/admin/marketplace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as { outcome?: string; error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "That didn't work.");
      const outcome = json?.outcome;
      setFlash((f) => ({
        ...f,
        [key]: outcome
          ? outcome === "approved" ? "Tether approved it." : outcome === "rejected" ? "Tether rejected it." : outcome === "upheld" ? "Tether hid the review."
            : outcome === "dismissed" ? "Tether kept the review." : "Tether couldn't decide: it's flagged for a person."
          : done,
      }));
      await load();
    } catch (e) {
      setFlash((f) => ({ ...f, [key]: e instanceof Error ? e.message : "That didn't work." }));
    } finally {
      setBusy(null);
    }
  }

  const waiting = useMemo(() => queue?.listings.filter((l) => !l.needs_human) ?? [], [queue]);
  const human = useMemo(
    () => [...(queue?.listings.filter((l) => l.needs_human) ?? []), ...(queue?.reports.filter((r) => r.status === "needs_staff") ?? [])],
    [queue],
  );
  const reports = useMemo(() => queue?.reports.filter((r) => r.status === "open") ?? [], [queue]);

  if (!queue) return <div className="flex justify-center py-16"><LoadingDots /></div>;

  const tabs: [Tab, string, number, boolean][] = [
    ["waiting", "Bots waiting", waiting.length, false],
    ["human", "Needs a human", human.length, human.length > 0],
    ["reports", "Reported reviews", reports.length, false],
    ["decided", "Recent decisions", queue.decidedListings.length + queue.decidedReports.length, false],
  ];

  const listingCard = (l: Listing) => {
    const key = `listing:${l.bot_id}`;
    const owner = l.bots.profiles;
    return (
      <article key={l.bot_id} className="view-enter rounded-2xl border border-white/[0.06] bg-bg-secondary p-4 shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]">
        <div className="flex items-start gap-3">
          <Avatar url={l.bots.avatar_url} name={l.bots.name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[16px] font-bold text-header-primary">{l.display_name ?? l.bots.name}</h3>
              {l.category && <Chip tone="muted">{l.category}</Chip>}
              {l.priority_requested_at && l.status === "pending" && <Chip tone="brand">Top of Tether&apos;s list</Chip>}
              {l.status !== "pending" && <Chip tone={l.status === "approved" ? "green" : "red"}>{l.status === "approved" ? "Listed" : "Rejected"} by {l.reviewed_by ?? "?"}</Chip>}
            </div>
            {l.tagline && <p className="mt-0.5 text-[14px] text-text-normal">{l.tagline}</p>}
            <p className="mt-0.5 text-[12px] text-text-muted">
              by {owner?.display_name ?? owner?.username ?? "unknown"}{owner?.username ? ` (@${owner.username})` : ""} · submitted {when(l.submitted_at)}
              {l.display_name && l.display_name !== l.bots.name ? ` · account name “${l.bots.name}”` : ""}
            </p>
          </div>
        </div>

        {l.description && <p className="mt-3 line-clamp-4 whitespace-pre-wrap rounded-lg bg-bg-tertiary/50 px-3 py-2 text-[13px] leading-[18px] text-text-normal">{l.description}</p>}
        {(l.tags?.length || l.website_url || l.support_url || l.privacy_url || l.terms_url) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {(l.tags ?? []).map((t) => <Chip key={t} tone="muted">#{t}</Chip>)}
            {([["website_url", "Website"], ["support_url", "Support"], ["privacy_url", "Privacy"], ["terms_url", "Terms"]] as const).map(([k, label]) =>
              l[k] ? (
                <button key={k} type="button" onClick={() => safeWindowOpen(l[k]!)} title={l[k]!} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] font-semibold text-text-link hover:bg-interactive-hover">
                  {label} ↗
                </button>
              ) : null,
            )}
          </div>
        )}

        <div className="mt-3">
          <Verdict decision={l.tether_decision} reason={l.tether_reason} at={l.tether_reviewed_at} needsHuman={l.needs_human} labels={LISTING_LABELS} />
        </div>
        {l.status !== "pending" && l.review_note && <p className="mt-2 text-[12px] text-text-muted">Note to developer: {l.review_note}</p>}

        {l.status === "pending" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void act(key, { kind: "listing", id: l.bot_id, action: "review-now" }, "Reviewed.")} className={`${btn} bg-brand text-white`}>
              {busy === key ? <LoadingDots size={5} /> : <><IconSparkle size={15} /> Review now with Tether</>}
            </button>
            <input
              value={notes[key] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
              placeholder="Note for the developer (optional)"
              className="h-9 min-w-[180px] flex-1 rounded-lg border border-white/[0.07] bg-bg-primary/60 px-3 text-[13px] text-text-normal outline-none focus:border-brand"
            />
            <button type="button" disabled={busy !== null} onClick={() => void act(key, { kind: "listing", id: l.bot_id, decision: "approve", note: notes[key] }, "Approved.")} className={`${btn} bg-status-online text-white`}>
              <IconCheck size={15} /> Approve
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void act(key, { kind: "listing", id: l.bot_id, decision: "reject", note: notes[key] }, "Rejected.")} className={`${btn} bg-status-dnd text-white`}>
              <IconClose size={15} /> Reject
            </button>
          </div>
        )}
        {flash[key] && <p className="mt-2 text-[12px] font-medium text-text-muted">{flash[key]}</p>}
      </article>
    );
  };

  const reportCard = (r: Report) => {
    const key = `report:${r.id}`;
    const open = r.status === "open" || r.status === "needs_staff";
    return (
      <article key={r.id} className="view-enter rounded-2xl border border-white/[0.06] bg-bg-secondary p-4">
        <div className="flex items-start gap-3">
          <Avatar url={r.bot_reviews.bots.avatar_url} name={r.bot_reviews.bots.name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-bold text-header-primary">Review of {r.bot_reviews.bots.name}</h3>
              <Chip tone="red">{REASON[r.reason] ?? r.reason}</Chip>
              {r.priority_requested_at && open && <Chip tone="brand">Top of Tether&apos;s list</Chip>}
              {!open && <Chip tone={r.status === "upheld" ? "red" : "green"}>{r.status === "upheld" ? "Hidden" : "Kept"} by {r.decided_by ?? "?"}</Chip>}
            </div>
            <p className="mt-0.5 text-[12px] text-text-muted">reported {when(r.created_at)}</p>
          </div>
        </div>
        <blockquote className="mt-3 rounded-lg border-l-[3px] border-[#f0b232] bg-bg-tertiary/50 px-3 py-2 text-[13px] text-text-normal">
          <span className="text-[#f0b232]">{"★".repeat(r.bot_reviews.rating)}</span>
          <span className="text-text-muted/40">{"★".repeat(5 - r.bot_reviews.rating)}</span>
          {r.bot_reviews.body ? <span className="ml-2">{r.bot_reviews.body}</span> : <span className="ml-2 italic text-text-muted">No text</span>}
        </blockquote>
        {r.details && <p className="mt-2 text-[12.5px] text-text-muted">Developer says: “{r.details}”</p>}
        <div className="mt-3">
          <Verdict decision={r.tether_decision} reason={r.tether_reason} at={r.tether_reviewed_at} needsHuman={r.status === "needs_staff"} labels={REPORT_LABELS} />
        </div>
        {open && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void act(key, { kind: "report", id: r.id, action: "review-now" }, "Reviewed.")} className={`${btn} bg-brand text-white`}>
              {busy === key ? <LoadingDots size={5} /> : <><IconSparkle size={15} /> Review now with Tether</>}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void act(key, { kind: "report", id: r.id, decision: "uphold" }, "Review hidden.")} className={`${btn} bg-status-dnd text-white`}>Hide review</button>
            <button type="button" disabled={busy !== null} onClick={() => void act(key, { kind: "report", id: r.id, decision: "dismiss" }, "Review kept.")} className={`${btn} bg-bg-tertiary text-text-normal`}>Keep review</button>
          </div>
        )}
        {flash[key] && <p className="mt-2 text-[12px] font-medium text-text-muted">{flash[key]}</p>}
      </article>
    );
  };

  const list =
    tab === "waiting" ? waiting.map(listingCard)
    : tab === "human" ? human.map((x) => ("bot_id" in x ? listingCard(x) : reportCard(x)))
    : tab === "reports" ? reports.map(reportCard)
    : [...queue.decidedListings.map(listingCard), ...queue.decidedReports.map(reportCard)];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-bg-tertiary/60 p-1">
        {tabs.map(([id, label, n, urgent]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors ${tab === id ? "bg-bg-secondary text-header-primary shadow-[0_1px_4px_rgb(0_0_0/0.25)]" : "text-text-muted hover:text-header-primary"}`}
          >
            {label}
            <span className={`min-w-5 rounded-full px-1.5 text-[11px] tabular-nums ${urgent ? "bg-status-dnd text-white" : "bg-bg-primary/70 text-text-muted"}`}>{n}</span>
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="ml-auto h-9 rounded-lg px-3 text-[13px] font-medium text-text-muted hover:text-header-primary">Refresh</button>
      </div>
      {error && <p className="rounded-lg border border-status-dnd/30 bg-status-dnd/10 px-3 py-2 text-[13px] text-text-normal">{error}</p>}
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-text-muted"><IconShield size={22} /></span>
          <p className="text-[15px] font-semibold text-header-primary">Nothing here</p>
          <p className="text-[13px] text-text-muted">{tab === "decided" ? "Decisions will show up here." : "All caught up."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">{list}</div>
      )}
    </div>
  );
}
