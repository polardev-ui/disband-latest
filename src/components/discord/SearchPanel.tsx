import { LoadingDots } from "@/components/ui/LoadingDots";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { Avatar } from "@/components/ui/Avatar";
import { formatMessageTime } from "@/lib/utils";
import { useI18n } from "@/contexts/I18nContext";
import type { Profile } from "@/lib/supabase/types";
import { SearchChipInput } from "./SearchChipInput";

/*
 Message search, Discord-style.

 The query is plain text with filters in it ("from:aug in:general has:image
 cats"). This panel:
   - suggests filters as you type, with people, channels, attachment types
     and dates to pick from, and shows each active filter as a removable chip;
   - runs search_messages_v2 (migration 0279), which understands every filter
     and returns the total with the page;
   - groups results by channel, highlights the matched words, and pages
     through them 25 at a time.
*/

export interface SearchResultRow {
  message_id: string;
  source_kind: string;
  container_id: string;
  author_id: string;
  content: string;
  created_at: string;
  authorName: string;
  authorAvatar: string | null;
  authorProfile?: Profile | null;
  attachmentCount: number;
}

type FilterKey = "from" | "in" | "has" | "mentions" | "before" | "after" | "during";
const FILTER_KEYS: FilterKey[] = ["from", "in", "has", "mentions", "before", "after", "during"];
const HAS_VALUES = ["link", "embed", "image", "video", "file"] as const;
const PAGE = 25;

interface Parsed {
  filters: Partial<Record<FilterKey, string>>;
  text: string;
}

const TOKEN = /(^|\s)(from|in|has|mentions|before|after|during):("[^"]*"|\S*)/gi;

function parseQuery(q: string): Parsed {
  const filters: Partial<Record<FilterKey, string>> = {};
  const text = q.replace(TOKEN, (_m, lead: string, key: string, value: string) => {
    const v = value.replace(/^"|"$/g, "").replace(/^[#@]/, "");
    if (v) filters[key.toLowerCase() as FilterKey] = v;
    return lead;
  });
  return { filters, text: text.replace(/\s+/g, " ").trim() };
}

/** The filter being typed at the end of the box, if any ("from:au"). */
function trailingFilter(q: string): { key: FilterKey; partial: string } | null {
  const m = q.match(/(?:^|\s)(from|in|has|mentions|before|after|during):([^\s"]*)$/i);
  return m ? { key: m[1]!.toLowerCase() as FilterKey, partial: m[2]!.replace(/^[#@]/, "").toLowerCase() } : null;
}

function removeFilter(q: string, key: FilterKey): string {
  return q.replace(new RegExp(`(^|\\s)${key}:("[^"]*"|\\S*)`, "i"), " ").replace(/\s+/g, " ").trim();
}

const isDate = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function highlightCmd(text: string, term: string): React.ReactNode[] {
  const words = term.trim().split(/\s+/).filter((w) => w.length > 0).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return [text];
  const regex = new RegExp(`(${words.join("|")})`, "gi");
  return text.split(regex).map((chunk, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded-[3px] bg-[#f0b232]/35 px-px text-text-normal">{chunk}</mark> : <span key={i}>{chunk}</span>,
  );
}

// --- Icons (inline so the panel stays self-contained) ---------------------------------

const I = {
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
  hash: <path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" />,
  clip: <path d="m21 11-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8L13.4 3a3.7 3.7 0 0 1 5.2 5.2l-8.7 8.7a1.8 1.8 0 0 1-2.6-2.6L15.5 6.1" />,
  at: <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5" /></>,
  sort: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  clipSmall: <path d="m21 11-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8L13.4 3a3.7 3.7 0 0 1 5.2 5.2l-8.7 8.7a1.8 1.8 0 0 1-2.6-2.6L15.5 6.1" />,
};
function Ico({ d, size = 18 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      {d}
    </svg>
  );
}

interface Props {
  scopeKind: "server" | "channel" | "dm" | "group";
  serverId: string | null;
  containerId: string | null;
  onJump: (messageId: string, containerId: string, sourceKind: string) => void;
  onClose: () => void;
  initialQuery?: string;
  /** Set when the header search box owns the query; the panel then shows results only (its own box stays for narrow screens). */
  query?: string;
  onQueryChange?: (query: string) => void;
}

type Sort = "newest" | "oldest" | "relevance";
const SORT_LABEL: Record<Sort, string> = { newest: "Newest", oldest: "Oldest", relevance: "Most relevant" };

export default function SearchPanel({ scopeKind, serverId, containerId, onJump, onClose, initialQuery, query: controlledQuery, onQueryChange }: Props) {
  const { t } = useI18n();
  const app = useApp();
  const [ownQuery, setOwnQuery] = useState(initialQuery ?? "");
  const controlled = controlledQuery !== undefined;
  const query = controlled ? controlledQuery : ownQuery;
  const setQuery = useCallback((next: string | ((current: string) => string)) => {
    const value = typeof next === "function" ? next(query) : next;
    if (controlled) onQueryChange?.(value);
    else setOwnQuery(value);
  }, [controlled, onQueryChange, query]);

  const [sort, setSort] = useState<Sort>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const typing = trailingFilter(query);

  // People who can be picked for from:/mentions:, for this scope.
  const people: Profile[] = useMemo(() => {
    if (scopeKind === "dm") {
      const thread = app.dmThreads.find((d) => d.id === containerId);
      return [thread?.friend, app.profile].filter(Boolean) as Profile[];
    }
    if (scopeKind === "group") {
      return (app.groupChats.find((g) => g.id === containerId)?.members ?? []) as Profile[];
    }
    return app.members.map((m) => m.profile).filter(Boolean);
  }, [scopeKind, containerId, app.dmThreads, app.groupChats, app.members, app.profile]);

  const textChannels = useMemo(
    () => (serverId ? app.channels.filter((c) => c.server_id === serverId && c.type !== "voice") : []),
    [app.channels, serverId],
  );
  const channelById = useMemo(() => new Map(app.channels.map((c) => [c.id, c])), [app.channels]);
  const categoryById = useMemo(() => new Map(app.categories.map((c) => [c.id, c.name])), [app.categories]);

  const inChannelId = useMemo(() => {
    const name = parsed.filters.in?.toLowerCase();
    if (!name) return null;
    return textChannels.find((c) => c.name.toLowerCase() === name || c.id === name)?.id ?? null;
  }, [parsed.filters.in, textChannels]);

  const hasSomething = !!parsed.text || Object.keys(parsed.filters).length > 0;
  const unknownChannel = !!parsed.filters.in && !inChannelId && scopeKind === "server";

  const runSearch = useCallback(async (toPage: number) => {
    if (!hasSomething || unknownChannel) {
      setResults([]);
      setTotal(0);
      return;
    }
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const f = parsed.filters;
    try {
      const { data, error: err } = await supabase.rpc("search_messages_v2", {
        p_scope: scopeKind,
        p_server_id: serverId,
        p_container_id: containerId,
        p_query: parsed.text || null,
        p_channel_id: inChannelId,
        p_from: f.from ?? null,
        p_mentions: f.mentions ?? null,
        p_has: f.has && (HAS_VALUES as readonly string[]).includes(f.has.toLowerCase()) ? f.has.toLowerCase() : null,
        p_before: isDate(f.before) ? f.before : null,
        p_after: isDate(f.after) ? f.after : null,
        p_during: isDate(f.during) ? f.during : null,
        p_sort: sort,
        p_limit: PAGE,
        p_offset: (toPage - 1) * PAGE,
      });
      if (err) throw err;
      if (id !== runId.current) return;
      const raw = (data ?? []) as { message_id: string; source_kind: string; container_id: string; author_id: string; content: string; created_at: string; attachment_count: number; total: number }[];
      const map = await fetchProfilesByIds(supabase, [...new Set(raw.map((r) => r.author_id))]);
      if (id !== runId.current) return;
      setResults(raw.map((r) => {
        const p = map.get(r.author_id) as Profile | undefined;
        return {
          message_id: r.message_id,
          source_kind: r.source_kind,
          container_id: r.container_id,
          author_id: r.author_id,
          content: r.content,
          created_at: r.created_at,
          authorName: p?.display_name || p?.username || "Unknown",
          authorAvatar: p?.avatar_url ?? null,
          authorProfile: p ?? null,
          attachmentCount: Number(r.attachment_count) || 0,
        };
      }));
      setTotal(raw.length ? Number(raw[0]!.total) : 0);
      setPage(toPage);
      listRef.current?.scrollTo({ top: 0 });
    } catch (e: unknown) {
      if (id === runId.current) setError(e instanceof Error ? e.message : t("Search failed."));
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }, [hasSomething, unknownChannel, parsed, scopeKind, serverId, containerId, inChannelId, sort, t]);

  const focusInput = useCallback(() => {
    const header = controlled ? document.getElementById("header-search-input") : null;
    if (header && header.offsetParent !== null) header.focus();
    else inputRef.current?.focus();
  }, [controlled]);
  useEffect(() => { focusInput(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search a moment after typing stops, unless a filter is half-typed.
  useEffect(() => {
    if (typing && !typing.partial) return;
    const h = setTimeout(() => void runSearch(1), 280);
    return () => clearTimeout(h);
  }, [query, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Replace whatever filter is being typed with a finished one. */
  const complete = (key: FilterKey, value: string) => {
    const v = /\s/.test(value) ? `"${value}"` : value;
    setQuery((q) => {
      const base = q.replace(/(?:^|\s)(from|in|has|mentions|before|after|during):[^\s"]*$/i, "").trim();
      const cleaned = removeFilter(base, key);
      return `${cleaned ? `${cleaned} ` : ""}${key}:${v} `;
    });
    focusInput();
  };

  const startFilter = (key: FilterKey) => {
    setQuery((q) => `${removeFilter(q, key)}${q.trim() ? " " : ""}${key}:`.replace(/^\s+/, ""));
    focusInput();
  };

  // --- Suggestions --------------------------------------------------------------------

  let suggestions: React.ReactNode = null;
  if (typing) {
    const p = typing.partial;
    if (typing.key === "from" || typing.key === "mentions") {
      const list = people
        .filter((x) => !p || x.username?.toLowerCase().includes(p) || x.display_name?.toLowerCase().includes(p))
        .slice(0, 8);
      suggestions = (
        <SuggestBox title={typing.key === "from" ? t("From user") : t("Mentions user")}>
          {list.length === 0 ? <p className="px-3 py-2 text-[13px] text-text-muted">{t("No one matches.")}</p> : list.map((x) => (
            <SuggestRow key={x.id} onClick={() => complete(typing.key, x.username ?? x.id)}>
              <Avatar profile={x} size="sm" className="!h-6 !w-6" />
              <span className="truncate font-semibold text-header-primary">{x.display_name || x.username}</span>
              <span className="truncate text-text-muted">{x.username}</span>
            </SuggestRow>
          ))}
        </SuggestBox>
      );
    } else if (typing.key === "in") {
      const list = textChannels.filter((c) => !p || c.name.toLowerCase().includes(p)).slice(0, 10);
      suggestions = (
        <SuggestBox title={t("In channel")}>
          {scopeKind !== "server" ? <p className="px-3 py-2 text-[13px] text-text-muted">{t("in: works when searching a space.")}</p>
            : list.length === 0 ? <p className="px-3 py-2 text-[13px] text-text-muted">{t("No channel matches.")}</p>
            : list.map((c) => (
              <SuggestRow key={c.id} onClick={() => complete("in", c.name)}>
                <span className="text-text-muted"><Ico d={I.hash} size={16} /></span>
                <span className="truncate font-semibold text-header-primary">{c.name}</span>
                {c.category_id && <span className="ml-auto truncate text-[12px] uppercase text-text-muted">{categoryById.get(c.category_id)}</span>}
              </SuggestRow>
            ))}
        </SuggestBox>
      );
    } else if (typing.key === "has") {
      suggestions = (
        <SuggestBox title={t("Message contains")}>
          {HAS_VALUES.filter((v) => !p || v.startsWith(p)).map((v) => (
            <SuggestRow key={v} onClick={() => complete("has", v)}>
              <span className="text-text-muted"><Ico d={I.clip} size={16} /></span>
              <span className="font-semibold text-header-primary">{v}</span>
            </SuggestRow>
          ))}
        </SuggestBox>
      );
    } else {
      suggestions = (
        <SuggestBox title={typing.key === "before" ? t("Before date") : typing.key === "after" ? t("After date") : t("On date")}>
          {[["Today", 0], ["Yesterday", -1], ["A week ago", -7], ["A month ago", -30]].map(([label, off]) => (
            <SuggestRow key={label as string} onClick={() => complete(typing.key, isoDay(off as number))}>
              <span className="text-text-muted"><Ico d={I.calendar} size={16} /></span>
              <span className="font-semibold text-header-primary">{t(label as string)}</span>
              <span className="ml-auto text-text-muted">{isoDay(off as number)}</span>
            </SuggestRow>
          ))}
          <p className="px-3 pb-1 pt-2 text-[12px] text-text-muted">{t("Or type a date: YYYY-MM-DD")}</p>
        </SuggestBox>
      );
    }
  }

  const filterMenu = (
    <SuggestBox title={t("Filters")}>
      <MenuRow icon={I.user} label={t("From a specific user")} hint="from: user" onClick={() => startFilter("from")} />
      {scopeKind === "server" && <MenuRow icon={I.hash} label={t("Sent in a specific channel")} hint="in: channel" onClick={() => startFilter("in")} />}
      <MenuRow icon={I.clip} label={t("Includes a specific type of data")} hint="has: link, embed, image, video or file" onClick={() => startFilter("has")} />
      <MenuRow icon={I.at} label={t("Mentions a specific user")} hint="mentions: user" onClick={() => startFilter("mentions")} />
      <MenuRow icon={I.calendar} label={t("Sent on, before or after a date")} hint="during: before: after: date" onClick={() => startFilter("during")} />
    </SuggestBox>
  );

  // --- Results -------------------------------------------------------------------------

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const groups = useMemo(() => {
    const out: { key: string; rows: SearchResultRow[] }[] = [];
    for (const r of results) {
      const last = out[out.length - 1];
      if (last && last.key === r.container_id) last.rows.push(r);
      else out.push({ key: r.container_id, rows: [r] });
    }
    return out;
  }, [results]);

  const chips = (Object.entries(parsed.filters) as [FilterKey, string][]).filter(([k]) => FILTER_KEYS.includes(k));
  const showMenu = !typing && !hasSomething;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-secondary">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.05] px-4">
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-header-primary">
          {hasSomething && !typing
            ? loading && !results.length
              ? t("Searching…")
              : t(total === 1 ? "{count} Result" : "{count} Results", { count: total.toLocaleString() })
            : t("Search")}
        </span>
        {hasSomething && !typing && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              aria-expanded={sortOpen}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-bg-tertiary px-2.5 text-[13px] font-medium text-header-secondary hover:text-header-primary"
            >
              <Ico d={I.sort} size={15} /> {t(SORT_LABEL[sort])}
            </button>
            {sortOpen && (
              <div className="menu-pop absolute right-0 top-9 z-20 w-44 rounded-lg border border-white/[0.06] bg-bg-floating p-1 shadow-[var(--elevation-high)]">
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setSort(s); setSortOpen(false); }}
                    className={`flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] ${sort === s ? "bg-brand text-white" : "text-text-normal hover:bg-interactive-hover"}`}
                  >
                    {t(SORT_LABEL[s])}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button type="button" onClick={onClose} aria-label={t("Close search")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active">
          <Ico d={I.close} size={18} />
        </button>
      </div>

      <div className={`px-3 pt-3 ${controlled ? "lg:hidden" : ""}`}>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"><Ico d={I.search} size={15} /></span>
          <SearchChipInput
            ref={inputRef}
            value={query}
            onChange={(v) => setQuery(v)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void runSearch(1); }
              if (e.key === "Escape") { e.preventDefault(); inputRef.current?.blur(); onClose(); }
            }}
            ariaLabel={t("Search messages")}
            placeholder={t("Search")}
            className="h-9 w-full rounded-lg border border-transparent bg-bg-tertiary pl-8 pr-2 focus-within:border-brand"
          />
        </div>
      </div>

      {chips.length > 0 && (
        <div className="hidden">
          {chips.map(([k, v]) => (
            <span key={k} className={`inline-flex h-7 items-center gap-1 rounded-md pl-2 pr-1 text-[12.5px] ${k === "in" && unknownChannel ? "bg-status-dnd/15 text-status-dnd" : "bg-bg-tertiary text-text-normal"}`}>
              <b className="font-semibold">{k}:</b>
              <span className="max-w-[140px] truncate">{k === "in" ? `#${v}` : k === "from" || k === "mentions" ? `@${v}` : v}</span>
              <button type="button" aria-label={t("Remove filter")} onClick={() => setQuery((q) => removeFilter(q, k))} className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-interactive-hover hover:text-header-primary">
                <Ico d={I.close} size={12} />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => setQuery("")} className="h-7 rounded-md px-2 text-[12.5px] font-medium text-text-muted hover:text-header-primary">{t("Clear all")}</button>
        </div>
      )}

      <div ref={listRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {typing ? (
          suggestions
        ) : showMenu ? (
          <>
            {filterMenu}
            <p className="mt-3 px-1 text-[12px] text-text-muted">
              {t("Searching")} {scopeKind === "server" ? t("this space") : scopeKind === "channel" ? t("this channel") : t("this conversation")}. {t("Combine filters with words, like from:alex has:image cats.")}
            </p>
          </>
        ) : unknownChannel ? (
          <EmptyResult text={t("There's no channel called #{name} here.", { name: parsed.filters.in ?? "" })} />
        ) : loading && results.length === 0 ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[76px] animate-pulse rounded-xl bg-bg-primary" />)}</div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-status-dnd">{error}</p>
            <button type="button" onClick={() => void runSearch(page)} className="mt-3 h-8 rounded-md bg-button-secondary px-4 text-[14px] font-medium text-white hover:bg-button-secondary-hover">{t("Try Again")}</button>
          </div>
        ) : results.length === 0 ? (
          <EmptyResult text={t("We searched far and wide. Unfortunately, no results were found.")} />
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {groups.map((g, gi) => {
              const ch = scopeKind === "server" ? channelById.get(g.key) : null;
              return (
                <section key={`${g.key}-${gi}`} className="mb-3">
                  {ch && (
                    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[13px]">
                      <span className="text-text-muted"><Ico d={I.hash} size={14} /></span>
                      <span className="truncate font-semibold text-header-primary">{ch.name}</span>
                      {ch.category_id && <span className="ml-auto truncate text-[11px] font-semibold uppercase tracking-wide text-text-muted">{categoryById.get(ch.category_id)}</span>}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {g.rows.map((r) => (
                      <button
                        key={r.message_id}
                        type="button"
                        onClick={() => onJump(r.message_id, r.container_id, r.source_kind)}
                        className="group relative flex w-full gap-3 rounded-xl border border-white/[0.04] bg-bg-primary p-3 text-left transition-[box-shadow,border-color] hover:border-white/[0.1] hover:shadow-[var(--elevation-high)]"
                      >
                        <Avatar profile={r.authorProfile ?? { display_name: r.authorName, avatar_url: r.authorAvatar }} size="sm" className="!h-9 !w-9 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-[14px] font-semibold text-header-primary">{r.authorName}</span>
                            <span className="shrink-0 text-[11.5px] text-text-muted">{formatMessageTime(r.created_at)}</span>
                          </span>
                          {r.content && <span className="mt-0.5 line-clamp-6 block whitespace-pre-wrap break-words text-[14px] leading-[19px] text-text-normal">{highlightCmd(r.content, parsed.text)}</span>}
                          {r.attachmentCount > 0 && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-bg-tertiary px-1.5 py-0.5 text-[11.5px] text-text-muted">
                              <Ico d={I.clipSmall} size={12} /> {t(r.attachmentCount === 1 ? "{count} attachment" : "{count} attachments", { count: r.attachmentCount })}
                            </span>
                          )}
                        </span>
                        <span className="absolute right-2 top-2 rounded-md bg-bg-secondary px-2 py-0.5 text-[11.5px] font-semibold text-text-normal opacity-0 transition-opacity group-hover:opacity-100">{t("Jump")}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {pages > 1 && <Pager page={page} pages={pages} onPage={(p) => void runSearch(p)} />}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-bg-floating py-2 shadow-[var(--elevation-low)]">
      <p className="px-3 pb-1.5 text-[12px] font-bold text-header-secondary">{title}</p>
      {children}
    </div>
  );
}

function SuggestRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mx-1.5 flex h-9 w-[calc(100%-12px)] items-center gap-2 rounded-md px-2 text-left text-[14px] hover:bg-interactive-hover">
      {children}
    </button>
  );
}

function MenuRow({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-interactive-hover">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-header-secondary"><Ico d={icon} size={20} /></span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-header-primary">{label}</span>
        <span className="block truncate text-[12.5px] text-text-muted"><b className="font-semibold text-header-secondary">{hint.split(" ")[0]}</b> {hint.split(" ").slice(1).join(" ")}</span>
      </span>
    </button>
  );
}

function EmptyResult({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span className="text-text-muted/50"><Ico d={I.search} size={56} /></span>
      <p className="mt-4 text-[15px] text-header-secondary">{text}</p>
    </div>
  );
}

/** Previous · 1 2 3 4 5 · Next, centred on the current page. */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[14px] font-semibold";
  return (
    <nav aria-label="Result pages" className="mt-4 flex items-center justify-center gap-1">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={`${btn} text-header-secondary hover:text-header-primary disabled:opacity-40`}>‹ Previous</button>
      {nums.map((n) => (
        <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)} className={`${btn} ${n === page ? "bg-brand text-white" : "text-header-secondary hover:bg-interactive-hover hover:text-header-primary"}`}>
          {n}
        </button>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={`${btn} text-header-secondary hover:text-header-primary disabled:opacity-40`}>Next ›</button>
    </nav>
  );
}
