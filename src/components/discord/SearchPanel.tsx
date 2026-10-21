import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { Avatar } from "@/components/ui/Avatar";
import { formatMessageTime } from "@/lib/utils";

export interface SearchResultRow {
  message_id: string;
  source_kind: string;
  container_id: string;
  author_id: string;
  content: string;
  created_at: string;
  authorName: string;
  authorAvatar: string | null;
}

function parseFilters(q: string) {
  const filters: { from?: string; in?: string; has?: string; before?: string; after?: string; mentions?: string; text: string } = { text: q };
  let rest = q;
  const rx: [RegExp, string][] = [
    [/from:(\S+)/i, "from"],
    [/in:#?(\S+)/i, "in"],
    [/has:(link|image|file)/i, "has"],
    [/before:(\d{4}-\d{2}-\d{2})/i, "before"],
    [/after:(\d{4}-\d{2}-\d{2})/i, "after"],
    [/mentions:(\S+)/i, "mentions"],
  ];
  for (const [rgx, key] of rx) {
    const m = rest.match(rgx);
    if (m) {
      (filters as Record<string, string>)[key] = m[1];
      rest = rest.replace(rgx, "").trim();
    }
  }
  filters.text = rest;
  return filters;
}

export function highlightCmd(text: string, term: string): React.ReactNode[] {
  if (!term.trim()) return [text];
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((chunk, i) => regex.test(chunk) ? <mark key={i} className="rounded-[2px] bg-[#f0b232]/40 text-text-normal">{chunk}</mark> : <span key={i}>{chunk}</span>);
}

interface Props {
  scopeKind: "server" | "channel" | "dm" | "group";
  serverId: string | null;
  containerId: string | null;
  onJump: (messageId: string, containerId: string, sourceKind: string) => void;
  onClose: () => void;
  initialQuery?: string;
}

export default function SearchPanel({ scopeKind, serverId, containerId, onJump, onClose, initialQuery }: Props) {
  useApp();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [sort, setSort] = useState<"newest" | "oldest" | "relevance">("newest");
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filters = useMemo(() => parseFilters(query), [query]);

  const runSearch = useCallback(async (reset: boolean, overrideQuery?: string) => {
    const q = overrideQuery ?? query;
    const f = parseFilters(q);
    if (!f.text && !f.from && !f.has && !f.mentions && !f.before && !f.after) {
      setResults([]); setTotal(0); return;
    }
    setLoading(true); setError(null);
    const supabase = getSupabaseClient();
    try {
      const offset = reset ? 0 : page * 25;
      const [rRes, cRes] = await Promise.all([
        supabase.rpc("search_messages", {
          p_query: f.text || null,
          p_scope: scopeKind,
          p_server_id: serverId,
          p_container_id: containerId,
          p_has: f.has ?? null,
          p_before: f.before ?? null,
          p_after: f.after ?? null,
          p_author_filter: f.from ?? null,
          p_mention_filter: f.mentions ?? null,
          p_sort: sort,
          p_limit: 25,
          p_offset: offset,
        }),
        supabase.rpc("count_search_messages", {
          p_query: f.text || null,
          p_scope: scopeKind,
          p_server_id: serverId,
          p_container_id: containerId,
          p_has: f.has ?? null,
          p_before: f.before ?? null,
          p_after: f.after ?? null,
          p_author_filter: f.from ?? null,
          p_mention_filter: f.mentions ?? null,
        }),
      ]);
      if (rRes.error) throw rRes.error;
      const raw = (rRes.data ?? []) as { message_id: string; source_kind: string; container_id: string; author_id: string; content: string; created_at: string }[];
      const map = await fetchProfilesByIds(supabase, [...new Set(raw.map((r) => r.author_id))]);
      const rows: SearchResultRow[] = raw.map((r) => ({
        message_id: r.message_id,
        source_kind: r.source_kind,
        container_id: r.container_id,
        author_id: r.author_id,
        content: r.content,
        created_at: r.created_at,
        authorName: map.get(r.author_id)?.display_name || map.get(r.author_id)?.username || "Unknown",
        authorAvatar: map.get(r.author_id)?.avatar_url ?? null,
      }));
      if (reset) { setResults(rows); setPage(1); } else { setResults((prev) => [...prev, ...rows]); setPage((p) => p + 1); }
      setTotal(Number(cRes.data ?? 0));
      const fetched = offset + rows.length;
      setHasMore(rows.length >= 25 && fetched < Number(cRes.data ?? 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [filters, scopeKind, serverId, containerId, sort, page]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) void runSearch(true);
      if (!query.trim()) { setResults([]); setTotal(0); }
    }, 250);
    return () => clearTimeout(t);
  }, [query, sort]);

  const SORT_LABEL = { newest: "New", oldest: "Old", relevance: "Relevant" } as const;
  const OPTIONS: { token: string; hint: string }[] = [
    { token: "from:", hint: "user" },
    { token: "mentions:", hint: "user" },
    { token: "has:", hint: "link, image or file" },
    { token: "in:", hint: "channel" },
    { token: "before:", hint: "YYYY-MM-DD" },
    { token: "after:", hint: "YYYY-MM-DD" },
  ];
  const searching = query.trim().length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-secondary">
      {/* Header: count on the left, sort tabs on the right. */}
      <div className="flex h-14 shrink-0 items-center gap-3 bg-bg-tertiary px-4">
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-header-primary">
          {loading && results.length === 0 ? "Searching…" : searching ? `${total.toLocaleString()} ${total === 1 ? "Result" : "Results"}` : "Search"}
        </span>
        {searching && (
          <div role="tablist" aria-label="Sort results" className="flex items-center gap-4">
            {(["newest", "oldest", "relevance"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={sort === s}
                onClick={() => setSort(s)}
                className={`relative h-14 text-[14px] font-medium transition-colors ${
                  sort === s
                    ? "text-header-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t after:bg-brand"
                    : "text-header-secondary hover:text-interactive-active"
                }`}
              >
                {SORT_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="flex h-6 w-6 shrink-0 items-center justify-center text-interactive-normal transition-colors hover:text-interactive-active"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="px-4 pb-2 pt-3">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(true); } if (e.key === "Escape") { e.preventDefault(); inputRef.current?.blur(); onClose(); } }}
          aria-label="Search messages"
          placeholder="Search"
          className="h-8 w-full rounded-[4px] border border-transparent bg-bg-tertiary px-2 text-[14px] text-text-normal placeholder:text-text-muted outline-none focus:border-[#00a8fc]"
        />
      </div>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!searching ? (
          <div className="rounded-[4px] bg-bg-floating py-2 shadow-[var(--elevation-low)]">
            <p className="px-3 pb-1 pt-1 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">Search Options</p>
            {OPTIONS.map((o) => (
              <button
                key={o.token}
                type="button"
                onClick={() => {
                  setQuery((q) => (q ? `${q} ${o.token}` : o.token));
                  inputRef.current?.focus();
                }}
                className="mx-2 flex h-8 w-[calc(100%-16px)] items-center gap-1.5 rounded-[3px] px-2 text-left text-[14px] hover:bg-interactive-hover"
              >
                <span className="font-semibold text-header-primary">{o.token}</span>
                <span className="text-header-secondary">{o.hint}</span>
              </button>
            ))}
            <p className="mx-3 mt-2 border-t border-bg-secondary pt-2 text-[12px] leading-4 text-header-secondary">
              Searching {scopeKind === "server" ? "this space" : scopeKind === "channel" ? "this channel" : "this conversation"}.
            </p>
          </div>
        ) : loading && results.length === 0 ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-lg bg-bg-primary" />)}</div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-status-dnd">{error}</p>
            <button type="button" onClick={() => void runSearch(true)} className="mt-3 h-8 rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white hover:bg-button-secondary-hover">
              Try Again
            </button>
          </div>
        ) : results.length === 0 && !loading ? (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <svg aria-hidden width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4e5058" strokeWidth="1.6" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
            <p className="mt-4 text-[16px] text-header-secondary">We searched far and wide. Unfortunately, no results were found.</p>
          </div>
        ) : (
          <>
            {results.map((r) => (
              <div key={r.message_id} className="group relative mb-2 rounded-lg bg-bg-primary py-2 pl-[72px] pr-4 transition-shadow hover:shadow-[var(--elevation-high)]">
                <span className="absolute left-4 top-2.5">
                  <Avatar profile={{ display_name: r.authorName, avatar_url: r.authorAvatar }} size="md" className="!h-10 !w-10" />
                </span>
                <p className="flex items-baseline gap-2">
                  <span className="truncate text-[16px] font-medium leading-[22px] text-header-primary">{r.authorName}</span>
                  <span className="shrink-0 text-[12px] text-text-muted">{formatMessageTime(r.created_at)}</span>
                </p>
                <p className="line-clamp-4 break-words text-[16px] leading-[22px] text-text-normal">{highlightCmd(r.content, filters.text)}</p>
                <button
                  type="button"
                  onClick={() => onJump(r.message_id, r.container_id, r.source_kind)}
                  className="absolute right-2 top-2 h-6 rounded-[3px] bg-bg-secondary px-2 text-[12px] font-medium text-text-normal opacity-0 transition-opacity hover:bg-interactive-selected focus-visible:opacity-100 group-hover:opacity-100"
                >
                  Jump
                </button>
              </div>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => void runSearch(false)}
                disabled={loading}
                className="mt-2 h-8 w-full rounded-[3px] bg-button-secondary text-[14px] font-medium text-white hover:bg-button-secondary-hover disabled:opacity-60"
              >
                {loading ? "Loading…" : "Load More"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
