import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";

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
  return parts.map((chunk, i) => regex.test(chunk) ? <mark key={i} className="rounded bg-brand/30 px-0.5 text-text-normal">{chunk}</mark> : <span key={i}>{chunk}</span>);
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-secondary">
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-divider px-3">
        <span className="text-[14px] font-semibold text-text-normal">Search</span>
        <span className="ml-auto text-[12px] text-text-muted">{loading && results.length === 0 ? "Searching…" : total ? `${total} results` : ""}</span>
        <button type="button" onClick={onClose} aria-label="Close search" className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal">×</button>
      </div>

      <div className="border-b border-divider px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runSearch(true); } if (e.key === "Escape") { e.preventDefault(); inputRef.current?.blur(); onClose(); } }}
          placeholder="Search messages…"
          className="h-8 w-full rounded-md bg-bg-accent px-3 text-[13px] text-text-normal placeholder:text-text-muted outline-none focus:ring-1 focus:ring-brand/40"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {["from:","in:#","has:link","has:image","has:file","before:","after:","mentions:"].map((s) => (
            <button key={s} type="button" onClick={() => setQuery((q) => q.includes(s) ? q : (q ? q + " " + s : s))} className="rounded-full bg-bg-accent px-2 py-0.5 text-[10px] text-text-muted hover:text-text-normal">{s}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 border-b border-divider px-3 py-1.5 text-[12px]">
        {(["newest", "oldest", "relevance"] as const).map((s) => (
          <button key={s} onClick={() => { setSort(s); }} className={`rounded px-2 py-0.5 ${sort === s ? "bg-brand/20 text-text-normal" : "text-text-muted hover:bg-interactive-hover"}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && results.length === 0 && (
          <div className="space-y-2 p-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-bg-accent" />)}</div>
        )}
        {!loading && results.length === 0 && !error && query.trim() && (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">No results. Try another term or filter.</div>
        )}
        {!query.trim() && (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">Type to search messages in this {scopeKind === "server" ? "server" : scopeKind}.</div>
        )}
        {error && (
          <div className="px-3 py-8 text-center">
            <p className="text-[13px] text-status-dnd">{error}</p>
            <button type="button" onClick={() => void runSearch(true)} className="mt-2 rounded border border-divider px-3 py-1.5 text-[12px] text-text-normal hover:bg-interactive-hover">Retry</button>
          </div>
        )}
        {results.map((r) => (
          <button
            key={r.message_id}
            type="button"
            onClick={() => onJump(r.message_id, r.container_id, r.source_kind)}
            className="mb-1.5 block w-full rounded-lg border border-divider bg-bg-accent/30 px-3 py-2 text-left transition-colors hover:bg-interactive-hover"
          >
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-text-normal">{r.authorName}</span>
              <span className="text-[11px] text-text-muted">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-1 line-clamp-3 text-[12.5px] text-text-normal">{highlightCmd(r.content, filters.text)}</p>
          </button>
        ))}
        {hasMore && (
          <button type="button" onClick={() => void runSearch(false)} disabled={loading} className="w-full rounded border border-divider py-2 text-[12.5px] text-text-muted hover:bg-interactive-hover disabled:opacity-60">
            {loading ? "Loading…" : "Load more (25)"}
          </button>
        )}
      </div>
    </div>
  );
}
