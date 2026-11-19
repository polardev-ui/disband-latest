"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { isTauri, websiteHref } from "@/lib/platform";
import { safeWindowOpen, thumbImageUrl } from "@/lib/safe-url";
import { IconBot, IconChevronLeft, IconSearch, IconShield, IconStar } from "@/components/icons";
import { LoadingDots } from "@/components/ui/LoadingDots";

/*
 Discover > Bots: the bot marketplace.

 Approved bots, searchable by name, description, tag or command. A card
 opens a store-style page (no screenshots): who made it, how many spaces
 it's in, how many times it's been added, its rating and reviews (one per
 person), its commands, and an Add to space button that goes through the
 bot's invite link. Developers submit bots from here with that link; Tether
 reviews submissions daily (see bot-marketplace.server.ts).
*/

interface MarketBot {
  bot_id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  tags: string[] | null;
  creator_id: string | null;
  creator_username: string | null;
  creator_name: string | null;
  server_count: number;
  review_count: number;
  rating: number | null;
  authorization_count: number;
  invite_code: string;
  invite_ok: boolean;
  approved_at: string | null;
}

interface Review {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  reported: boolean;
}

interface BotDetail {
  bot: MarketBot;
  commands: { name: string; description: string | null }[];
  reviews: Review[];
  is_owner: boolean;
}

type Sort = "popular" | "new" | "rating";

const fmt = (n: number) => Number(n || 0).toLocaleString();

function BotAvatar({ bot, size }: { bot: Pick<MarketBot, "name" | "avatar_url">; size: number }) {
  const src = thumbImageUrl(bot.avatar_url, size);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="shrink-0 rounded-[28%] object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-[28%] bg-brand text-white" style={{ width: size, height: size }}>
      <IconBot size={Math.round(size * 0.5)} />
    </span>
  );
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden className={i <= Math.round(value) ? "text-[#f0b232]" : "text-text-muted/40"}>
          <path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
        </svg>
      ))}
    </span>
  );
}

function openInvite(code: string) {
  const path = `/bot-invite/${encodeURIComponent(code)}`;
  if (isTauri()) safeWindowOpen(websiteHref(path));
  else window.location.href = path;
}

// --- The list ---------------------------------------------------------------------

export function BotMarketplace({ onBackToSpaces }: { onBackToSpaces?: (tab: "popular" | "new") => void }) {
  const { t } = useI18n();
  const { profile } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [bots, setBots] = useState<MarketBot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await getSupabaseClient().rpc("marketplace_bots", { p_query: query.trim() || null, p_sort: sort, p_limit: 60, p_offset: 0 });
    if (err) {
      setError(err.message);
      setBots([]);
      return;
    }
    setBots((data as MarketBot[]) ?? []);
  }, [query, sort]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(id);
  }, [load, query]);

  if (openId) return <BotPage botId={openId} onBack={() => { setOpenId(null); void load(); }} />;

  return (
    <main className="chat-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-bg-primary">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-4 sm:px-8 sm:pt-8">
        <header className="relative overflow-hidden rounded-lg bg-brand px-5 py-10 text-center sm:px-12">
          <h1 className="text-[24px] font-bold leading-[30px] text-white sm:text-[28px]">{t("Find the right bot for your space")}</h1>
          <p className="mt-2 text-[16px] leading-5 text-white/90">{t("Moderation, music, games, tickets and more. Every bot here is reviewed before it's listed.")}</p>
          <div className="relative mx-auto mt-6 w-full max-w-[560px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search bots, features or commands")}
              aria-label={t("Search bots")}
              className="h-11 w-full rounded-lg bg-white pl-4 pr-11 text-[16px] text-[#060607] outline-none placeholder:text-[#5c5e66] shadow-[var(--elevation-high)]"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5c5e66]"><IconSearch size={20} /></span>
          </div>
        </header>

        {onBackToSpaces && (
          // Phones don't have the Discover sidebar: the same switches as the spaces view.
          <div className="mt-4 flex gap-2 md:hidden">
            <button type="button" onClick={() => onBackToSpaces("popular")} className="h-8 rounded-full bg-bg-secondary px-3.5 text-[14px] font-semibold text-header-secondary">{t("Home")}</button>
            <button type="button" onClick={() => onBackToSpaces("new")} className="h-8 rounded-full bg-bg-secondary px-3.5 text-[14px] font-semibold text-header-secondary">{t("New Spaces")}</button>
            <button type="button" aria-pressed className="h-8 rounded-full bg-brand px-3.5 text-[14px] font-semibold text-white">{t("Bots")}</button>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["popular", "Popular"], ["new", "New"], ["rating", "Top rated"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
              className={`h-8 rounded-full px-3.5 text-[14px] font-semibold transition-colors ${sort === id ? "bg-brand text-white" : "bg-bg-secondary text-header-secondary hover:text-header-primary"}`}
            >
              {t(label)}
            </button>
          ))}
          <span className="flex-1" />
          {profile?.is_support_staff && (
            <button type="button" onClick={() => setStaffOpen(true)} className="flex h-8 items-center gap-1.5 rounded-full bg-bg-secondary px-3.5 text-[14px] font-semibold text-header-secondary hover:text-header-primary">
              <IconShield size={15} /> {t("Staff queue")}
            </button>
          )}
          <button type="button" onClick={() => setSubmitting(true)} className="h-8 rounded-full bg-bg-secondary px-3.5 text-[14px] font-semibold text-header-primary hover:bg-interactive-hover">
            {t("Submit your bot")}
          </button>
        </div>

        <h2 className="mb-3 mt-6 text-[20px] font-bold text-header-primary">
          {query.trim() ? t("Results for “{value}”", { value: query.trim() }) : sort === "new" ? t("New bots") : sort === "rating" ? t("Top rated bots") : t("Popular bots")}
        </h2>

        {bots === null ? (
          <div className="flex justify-center py-16"><LoadingDots /></div>
        ) : error ? (
          <p className="py-10 text-center text-text-muted">{t("The marketplace couldn't load. Try again in a moment.")}</p>
        ) : bots.length === 0 ? (
          <p className="py-10 text-center text-text-muted">{query.trim() ? t("No bots match that yet.") : t("No bots are listed yet. Be the first: submit yours.")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bots.map((b) => (
              <button
                key={b.bot_id}
                type="button"
                onClick={() => setOpenId(b.bot_id)}
                className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-secondary p-4 text-left transition-transform hover:-translate-y-0.5 hover:bg-interactive-hover"
              >
                <div className="flex items-center gap-3">
                  <BotAvatar bot={b} size={48} />
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-bold text-header-primary">{b.name}</p>
                    <p className="truncate text-[13px] text-text-muted">{t("by {value}", { value: b.creator_name ?? "unknown" })}</p>
                  </div>
                </div>
                <p className="line-clamp-2 min-h-[40px] text-[14px] leading-5 text-text-normal">{b.description || t("No description yet.")}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
                  {b.rating != null ? <span className="flex items-center gap-1"><Stars value={Number(b.rating)} size={12} /> {Number(b.rating).toFixed(1)} ({fmt(b.review_count)})</span> : <span>{t("No reviews yet")}</span>}
                  <span>{t("{count} spaces", { count: fmt(b.server_count) })}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {submitting && <SubmitBotModal onClose={() => setSubmitting(false)} />}
      {staffOpen && <StaffQueueModal onClose={() => { setStaffOpen(false); void load(); }} />}
    </main>
  );
}

// --- A bot's page -------------------------------------------------------------------

function BotPage({ botId, onBack }: { botId: string; onBack: () => void }) {
  const { t } = useI18n();
  const { user } = useApp();
  const [detail, setDetail] = useState<BotDetail | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Review | null>(null);

  const load = useCallback(async () => {
    const { data } = await getSupabaseClient().rpc("marketplace_bot", { p_bot_id: botId });
    const d = (data as BotDetail | null) ?? null;
    setDetail(d);
    const mine = d?.reviews.find((r) => r.user_id === user?.id);
    if (mine) {
      setRating(mine.rating);
      setBody(mine.body ?? "");
    }
  }, [botId, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const mine = useMemo(() => detail?.reviews.find((r) => r.user_id === user?.id) ?? null, [detail, user?.id]);
  const breakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    detail?.reviews.forEach((r) => (counts[r.rating - 1] += 1));
    return counts;
  }, [detail]);

  async function saveReview() {
    if (!rating) return setNote(t("Pick a star rating first."));
    setBusy(true);
    setNote(null);
    const { error } = await getSupabaseClient().rpc("upsert_bot_review", { p_bot_id: botId, p_rating: rating, p_body: body.trim() || null });
    setBusy(false);
    if (error) return setNote(error.message);
    setNote(mine ? t("Review updated.") : t("Thanks for your review!"));
    void load();
  }

  async function deleteReview() {
    setBusy(true);
    await getSupabaseClient().rpc("delete_my_bot_review", { p_bot_id: botId });
    setBusy(false);
    setRating(0);
    setBody("");
    void load();
  }

  if (detail === undefined) return <main className="flex flex-1 items-center justify-center bg-bg-primary"><LoadingDots /></main>;
  if (!detail) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-bg-primary text-text-muted">
        <p>{t("This bot isn't on the marketplace any more.")}</p>
        <button type="button" onClick={onBack} className="text-text-link hover:underline">{t("Back to bots")}</button>
      </main>
    );
  }
  const b = detail.bot;
  const avg = b.rating != null ? Number(b.rating) : null;

  return (
    <main className="chat-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-bg-primary">
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-12 pt-4 sm:px-8 sm:pt-6">
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-[14px] font-medium text-text-muted hover:text-header-primary">
          <IconChevronLeft size={18} /> {t("All bots")}
        </button>

        {/* Header: like a store listing, without screenshots. */}
        <section className="flex flex-col gap-5 rounded-2xl border border-border-subtle bg-bg-secondary p-6 sm:flex-row sm:items-center">
          <BotAvatar bot={b} size={112} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-extrabold leading-tight text-header-primary">{b.name}</h1>
            <p className="mt-1 text-[14px] text-text-muted">
              {t("by")} <span className="font-semibold text-text-normal">{b.creator_name ?? "unknown"}</span>
              {b.creator_username ? <span> @{b.creator_username}</span> : null}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-text-muted">
              <span className="flex items-center gap-1.5">{avg != null ? <><Stars value={avg} /> <b className="text-text-normal">{avg.toFixed(1)}</b></> : t("No ratings yet")}</span>
              <span><b className="text-text-normal">{fmt(b.review_count)}</b> {t(b.review_count === 1 ? "review" : "reviews")}</span>
              <span><b className="text-text-normal">{fmt(b.server_count)}</b> {t(b.server_count === 1 ? "space" : "spaces")}</span>
              <span><b className="text-text-normal">{fmt(b.authorization_count)}</b> {t("times added")}</span>
            </div>
            {b.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {b.tags.slice(0, 8).map((tag) => <span key={tag} className="rounded-full bg-bg-tertiary px-2.5 py-0.5 text-[12px] font-medium text-text-normal">{tag}</span>)}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-[200px]">
            <button
              type="button"
              disabled={!b.invite_ok}
              onClick={() => openInvite(b.invite_code)}
              className="h-11 rounded-lg bg-brand text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t("Add to space")}
            </button>
            {!b.invite_ok && <p className="text-center text-[12px] text-text-muted">{t("This bot's invite link has changed. Check back soon.")}</p>}
          </div>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-[18px] font-bold text-header-primary">{t("About")}</h2>
              <p className="whitespace-pre-wrap text-[15px] leading-6 text-text-normal">{b.description || t("The developer hasn't added a description.")}</p>
            </section>

            <section>
              <h2 className="mb-3 text-[18px] font-bold text-header-primary">{t("Reviews")}</h2>
              {detail.is_owner ? (
                <p className="mb-4 rounded-lg bg-bg-secondary p-3 text-[13px] text-text-muted">{t("This is your bot. You can't review it, but you can report reviews that are fake or spam.")}</p>
              ) : user ? (
                <div className="mb-5 rounded-xl border border-border-subtle bg-bg-secondary p-4">
                  <p className="mb-2 text-[14px] font-semibold text-header-primary">{mine ? t("Your review") : t("Leave a review")}</p>
                  <div className="mb-3 flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button key={i} type="button" aria-label={t("{count} stars", { count: i })} onClick={() => setRating(i)} className={i <= rating ? "text-[#f0b232]" : "text-text-muted/40 hover:text-[#f0b232]/70"}>
                        <IconStar size={24} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value.slice(0, 1000))}
                    rows={3}
                    placeholder={t("What's it like to use? (optional)")}
                    className="w-full resize-none rounded-lg border border-border-subtle bg-bg-tertiary px-3 py-2 text-[14px] text-text-normal outline-none placeholder:text-text-muted focus:border-brand"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => void saveReview()} className="h-9 rounded-lg bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50">
                      {mine ? t("Update review") : t("Post review")}
                    </button>
                    {mine && <button type="button" disabled={busy} onClick={() => void deleteReview()} className="h-9 rounded-lg px-3 text-[14px] font-medium text-status-dnd hover:bg-status-dnd/10">{t("Delete")}</button>}
                    {note && <span className="text-[13px] text-text-muted">{note}</span>}
                  </div>
                </div>
              ) : null}

              {detail.reviews.length === 0 ? (
                <p className="text-[14px] text-text-muted">{t("No reviews yet.")}</p>
              ) : (
                <ul className="space-y-3">
                  {detail.reviews.map((r) => (
                    <li key={r.id} className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-header-primary">{r.name ?? "Someone"}</span>
                        <Stars value={r.rating} size={13} />
                        <span className="text-[12px] text-text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                        <span className="flex-1" />
                        {detail.is_owner && (
                          r.reported
                            ? <span className="text-[12px] text-text-muted">{t("Reported")}</span>
                            : <button type="button" onClick={() => setReporting(r)} className="text-[12px] font-medium text-text-muted hover:text-status-dnd">{t("Report")}</button>
                        )}
                      </div>
                      {r.body && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-5 text-text-normal">{r.body}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
              <h2 className="mb-3 text-[15px] font-bold text-header-primary">{t("Ratings")}</h2>
              {[5, 4, 3, 2, 1].map((s) => {
                const n = breakdown[s - 1] ?? 0;
                const pct = detail.reviews.length ? (n / detail.reviews.length) * 100 : 0;
                return (
                  <div key={s} className="mb-1.5 flex items-center gap-2 text-[12px] text-text-muted">
                    <span className="w-3">{s}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-tertiary"><span className="block h-full rounded-full bg-[#f0b232]" style={{ width: `${pct}%` }} /></span>
                    <span className="w-6 text-right">{n}</span>
                  </div>
                );
              })}
            </section>
            <section className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
              <h2 className="mb-3 text-[15px] font-bold text-header-primary">{t("Commands")} ({detail.commands.length})</h2>
              {detail.commands.length === 0 ? (
                <p className="text-[13px] text-text-muted">{t("No slash commands listed.")}</p>
              ) : (
                <ul className="max-h-[420px] space-y-2 overflow-y-auto">
                  {detail.commands.map((c) => (
                    <li key={c.name}>
                      <p className="font-mono text-[13px] font-semibold text-header-primary">/{c.name}</p>
                      {c.description && <p className="text-[12px] text-text-muted">{c.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
      {reporting && <ReportReviewModal review={reporting} onClose={(sent) => { setReporting(null); if (sent) void load(); }} />}
    </main>
  );
}

// --- Modals --------------------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-border-subtle bg-bg-secondary p-6 shadow-2xl">
        <h2 className="mb-4 text-[20px] font-bold text-header-primary">{title}</h2>
        {children}
      </div>
    </div>
  );
}

interface MyListing { bot_id: string; status: string; review_note: string | null; submitted_at: string; bots: { name: string } | null }

function SubmitBotModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine, setMine] = useState<MyListing[]>([]);

  const loadMine = useCallback(async () => {
    const { data } = await getSupabaseClient().from("bot_listings").select("bot_id, status, review_note, submitted_at, bots(name)").order("submitted_at", { ascending: false });
    setMine(((data as unknown as MyListing[]) ?? []));
  }, []);
  useEffect(() => { void loadMine(); }, [loadMine]);

  async function submit() {
    if (!link.trim()) return setMessage({ ok: false, text: t("Paste your bot's invite link.") });
    setBusy(true);
    setMessage(null);
    const { error } = await getSupabaseClient().rpc("submit_bot_listing", { p_invite_code: link.trim(), p_description: description.trim() || null });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error.message });
    setMessage({ ok: true, text: t("Submitted! Tether reviews new bots once a day; you'll see the result here.") });
    setLink("");
    void loadMine();
  }

  const label: Record<string, string> = { pending: "Waiting for review", approved: "Listed", rejected: "Not approved" };

  return (
    <Modal title={t("Submit your bot")} onClose={onClose}>
      <p className="mb-4 text-[14px] text-text-muted">
        {t("Paste your bot's public invite link. Its name, avatar, description and commands are checked before it's listed (once a day). Anyone who adds it from the marketplace or the link counts towards its total.")}
      </p>
      <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-header-secondary">{t("Invite link")}</label>
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://disband.dev/bot-invite/…" className="mb-4 h-10 w-full rounded-lg border border-border-subtle bg-bg-tertiary px-3 text-[14px] text-text-normal outline-none focus:border-brand" />
      <label className="mb-1 block text-[12px] font-bold uppercase tracking-wide text-header-secondary">{t("Description (optional)")}</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} rows={4} placeholder={t("What does your bot do? Leave empty to use the bot's own description.")} className="mb-1 w-full resize-none rounded-lg border border-border-subtle bg-bg-tertiary px-3 py-2 text-[14px] text-text-normal outline-none focus:border-brand" />
      <p className="mb-4 text-right text-[12px] text-text-muted">{description.length} / 2000</p>
      {message && <p className={`mb-3 text-[13px] ${message.ok ? "text-status-online" : "text-status-dnd"}`}>{message.text}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-[14px] font-medium text-text-normal hover:bg-interactive-hover">{t("Close")}</button>
        <button type="button" disabled={busy} onClick={() => void submit()} className="h-9 rounded-lg bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50">{t("Submit for review")}</button>
      </div>
      {mine.length > 0 && (
        <div className="mt-6 border-t border-border-subtle pt-4">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-header-secondary">{t("Your bots")}</p>
          <ul className="space-y-2">
            {mine.map((l) => (
              <li key={l.bot_id} className="rounded-lg bg-bg-tertiary px-3 py-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-header-primary">{l.bots?.name ?? "Bot"}</span>
                  <span className={`rounded px-1.5 py-px text-[11px] font-bold ${l.status === "approved" ? "bg-status-online/20 text-status-online" : l.status === "rejected" ? "bg-status-dnd/20 text-status-dnd" : "bg-bg-secondary text-text-muted"}`}>{t(label[l.status] ?? l.status)}</span>
                  <span className="flex-1" />
                  <button type="button" onClick={() => void getSupabaseClient().rpc("withdraw_bot_listing", { p_bot_id: l.bot_id }).then(() => loadMine())} className="text-[12px] text-text-muted hover:text-status-dnd">{t("Remove")}</button>
                </div>
                {l.review_note && <p className="mt-1 text-text-muted">{l.review_note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function ReportReviewModal({ review, onClose }: { review: Review; onClose: (sent: boolean) => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("fake");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const { error: err } = await getSupabaseClient().rpc("report_bot_review", { p_review_id: review.id, p_reason: reason, p_details: details.trim() || null });
    setBusy(false);
    if (err) return setError(err.message);
    onClose(true);
  }
  return (
    <Modal title={t("Report review")} onClose={() => onClose(false)}>
      <p className="mb-3 text-[14px] text-text-muted">{t("Tether reviews reports once a day and passes anything unclear to staff. Honest negative reviews stay up.")}</p>
      <div className="mb-3 space-y-1.5">
        {([["fake", "It's fake"], ["not_real", "Not a real user of the bot"], ["spam", "Spam or advertising"], ["abusive", "Abusive"], ["other", "Something else"]] as const).map(([id, label]) => (
          <label key={id} className="flex cursor-pointer items-center gap-2 text-[14px] text-text-normal">
            <input type="radio" name="reason" checked={reason === id} onChange={() => setReason(id)} /> {t(label)}
          </label>
        ))}
      </div>
      <textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 500))} rows={3} placeholder={t("Anything that helps (optional)")} className="mb-3 w-full resize-none rounded-lg border border-border-subtle bg-bg-tertiary px-3 py-2 text-[14px] text-text-normal outline-none focus:border-brand" />
      {error && <p className="mb-3 text-[13px] text-status-dnd">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onClose(false)} className="h-9 rounded-lg px-4 text-[14px] font-medium text-text-normal hover:bg-interactive-hover">{t("Cancel")}</button>
        <button type="button" disabled={busy} onClick={() => void send()} className="h-9 rounded-lg bg-status-dnd px-4 text-[14px] font-semibold text-white disabled:opacity-50">{t("Send report")}</button>
      </div>
    </Modal>
  );
}

interface QueueListing { bot_id: string; description: string | null; submitted_at: string; bots: { name: string; avatar_url: string | null } }
interface QueueReport { id: string; reason: string; details: string | null; status: string; decision_note: string | null; bot_reviews: { rating: number; body: string | null; bots: { name: string } } }

function StaffQueueModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [queue, setQueue] = useState<{ listings: QueueListing[]; reports: QueueReport[] } | null>(null);
  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/marketplace");
    setQueue(res.ok ? await res.json() : { listings: [], reports: [] });
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(kind: "listing" | "report", id: string, decision: string) {
    await apiFetch("/api/admin/marketplace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, decision }) });
    void load();
  }
  const btn = "h-8 rounded-md px-3 text-[13px] font-semibold";
  return (
    <Modal title={t("Marketplace staff queue")} onClose={onClose}>
      {!queue ? <LoadingDots /> : (
        <div className="space-y-5">
          <section>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-header-secondary">{t("Bots waiting")} ({queue.listings.length})</p>
            {queue.listings.length === 0 ? <p className="text-[13px] text-text-muted">{t("Nothing waiting.")}</p> : queue.listings.map((l) => (
              <div key={l.bot_id} className="mb-2 rounded-lg bg-bg-tertiary p-3">
                <p className="font-semibold text-header-primary">{l.bots.name}</p>
                {l.description && <p className="mt-1 text-[13px] text-text-normal">{l.description}</p>}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void decide("listing", l.bot_id, "approve")} className={`${btn} bg-status-online text-white`}>{t("Approve")}</button>
                  <button type="button" onClick={() => void decide("listing", l.bot_id, "reject")} className={`${btn} bg-status-dnd text-white`}>{t("Reject")}</button>
                </div>
              </div>
            ))}
          </section>
          <section>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-header-secondary">{t("Reported reviews")} ({queue.reports.length})</p>
            {queue.reports.length === 0 ? <p className="text-[13px] text-text-muted">{t("Nothing reported.")}</p> : queue.reports.map((r) => (
              <div key={r.id} className="mb-2 rounded-lg bg-bg-tertiary p-3 text-[13px]">
                <p className="text-text-muted">{r.bot_reviews.bots.name} · {r.reason}{r.status === "needs_staff" ? ` · ${t("Tether passed this on")}` : ""}</p>
                <p className="mt-1 text-text-normal">{"★".repeat(r.bot_reviews.rating)} {r.bot_reviews.body ?? ""}</p>
                {r.details && <p className="mt-1 text-text-muted">“{r.details}”</p>}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void decide("report", r.id, "uphold")} className={`${btn} bg-status-dnd text-white`}>{t("Hide review")}</button>
                  <button type="button" onClick={() => void decide("report", r.id, "dismiss")} className={`${btn} bg-bg-secondary text-text-normal`}>{t("Keep review")}</button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </Modal>
  );
}
