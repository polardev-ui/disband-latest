"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconClose, IconFriends, IconSearch, IconCompass, IconSparkle } from "@/components/icons";
import { serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { UserPanel } from "./UserPanel";

export interface DiscoverableServer {
  id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  description: string | null;
  owner_id: string;
  owner_name: string;
  member_count: number;
  created_at: string;
}

export type DiscoverTab = "popular" | "new";

/**
 * Shared fetch for the discovery surface.
 *
 * Lives here rather than in AppContext because the list is only needed while
 * the Discover view is open, and it should be re-fetched each time rather than
 * held in global state where it would go stale.
 */
function useDiscoverableServers() {
  const [items, setItems] = useState<DiscoverableServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getSupabaseClient()
      .rpc("list_discoverable_servers")
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        setLoading(false);
        if (rpcError) {
          setError(rpcError.message);
          return;
        }
        setItems((data ?? []) as DiscoverableServer[]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

interface DiscoverSidebarProps {
  tab: DiscoverTab;
  onTabChange: (tab: DiscoverTab) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onUserPanelContext?: (e: React.MouseEvent) => void;
}

/** Sits between the server rail and the results, with the user panel pinned below. */
export function DiscoverSidebar({
  tab,
  onTabChange,
  query,
  onQueryChange,
  onOpenSettings,
  onOpenProfile,
  onUserPanelContext,
}: DiscoverSidebarProps) {
  const tabs: { id: DiscoverTab; label: string; icon: React.ReactNode; hint: string }[] = [
    {
      id: "popular",
      label: "Popular",
      icon: <IconCompass size={18} />,
      hint: "Most members",
    },
    {
      id: "new",
      label: "New",
      icon: <IconSparkle size={18} />,
      hint: "Recently created",
    },
  ];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden bg-bg-secondary">
      {/* Search sits in the top-left, in place of a title */}
      <header className="flex h-12 shrink-0 items-center border-b border-black/20 px-2 shadow-sm">
        <div className="relative w-full">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search spaces"
            aria-label="Search spaces"
            className="w-full rounded bg-bg-tertiary py-1.5 pl-8 pr-7 text-sm text-text-normal outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-normal"
            >
              <IconClose size={14} />
            </button>
          )}
        </div>
      </header>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
        <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-text-muted">
          Discover
        </p>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`mb-0.5 flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-interactive-hover ${
              tab === t.id ? "bg-interactive-selected" : ""
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand">
              {t.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-text-normal">
                {t.label}
              </span>
              <span className="block truncate text-[11px] text-text-muted">{t.hint}</span>
            </span>
          </button>
        ))}
      </nav>

      <UserPanel
        onOpenSettings={onOpenSettings}
        onOpenProfile={onOpenProfile}
        onContextMenu={onUserPanelContext}
      />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Main pane                                                           */
/* ------------------------------------------------------------------ */

/** Full-pane replacement for the old Discover modal. */
export function DiscoverPanel({ tab, query }: { tab: DiscoverTab; query: string }) {
  const { servers, joinServerById } = useApp();
  const { items, loading, error } = useDiscoverableServers();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description ?? "").toLowerCase().includes(q) ||
            s.owner_name.toLowerCase().includes(q),
        )
      : items;

    return [...filtered].sort((a, b) =>
      tab === "popular"
        ? b.member_count - a.member_count
        : b.created_at.localeCompare(a.created_at),
    );
  }, [items, query, tab]);

  async function join(server: DiscoverableServer) {
    setJoiningId(server.id);
    setJoinError(null);
    const err = await joinServerById(server.id);
    setJoiningId(null);
    if (err) setJoinError(err);
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-6 shadow-sm">
        <IconCompass size={20} className="shrink-0 text-text-muted" />
        <h1 className="text-[15px] font-semibold text-text-normal">
          {tab === "popular" ? "Popular spaces" : "New spaces"}
        </h1>
        {!loading && (
          <span className="text-[13px] text-text-muted">
            · {visible.length} {visible.length === 1 ? "space" : "spaces"}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <p className="text-sm text-text-muted">Loading spaces…</p>
        ) : error ? (
          <p className="text-sm text-status-dnd">{error}</p>
        ) : visible.length === 0 ? (
          <div className="max-w-sm">
            <h2 className="text-lg font-semibold text-text-normal">
              {query ? "No matches" : "Nothing to discover yet"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              {query
                ? `No spaces match “${query}”.`
                : "Public spaces will show up here once people create them."}
            </p>
          </div>
        ) : (
          <>
            {joinError && <p className="mb-4 text-sm text-status-dnd">{joinError}</p>}
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((server) => {
                const joined = memberIds.has(server.id);
                const banner = safeImageUrl(server.banner_url);
                const icon = safeImageUrl(server.icon_url);
                return (
                  <li
                    key={server.id}
                    className="flex flex-col overflow-hidden rounded-lg border border-divider bg-bg-secondary"
                  >
                    <div className="h-16 w-full bg-brand/20">
                      {banner && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={banner} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col p-4 pt-0">
                      <div className="-mt-6 mb-3">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={icon}
                            alt=""
                            className="h-12 w-12 rounded-xl border-4 border-bg-secondary object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-xl border-4 border-bg-secondary bg-brand text-base font-semibold text-white">
                            {serverInitials(server.name)}
                          </span>
                        )}
                      </div>

                      <p className="truncate text-[15px] font-semibold text-text-normal">
                        {server.name}
                      </p>
                      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-text-muted">
                        {server.description || "No description."}
                      </p>

                      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-text-muted">
                        <IconFriends size={12} />
                        {server.member_count.toLocaleString()}{" "}
                        {server.member_count === 1 ? "member" : "members"}
                        <span aria-hidden>·</span>
                        <span className="truncate">{server.owner_name}</span>
                      </p>

                      <button
                        type="button"
                        disabled={joined || joiningId === server.id}
                        onClick={() => void join(server)}
                        className={`mt-4 w-full rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                          joined
                            ? "cursor-default bg-bg-accent text-text-muted"
                            : "bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
                        }`}
                      >
                        {joined ? "Joined" : joiningId === server.id ? "Joining…" : "Join"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
