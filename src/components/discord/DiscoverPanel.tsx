"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconClose, IconFriends, IconSearch, IconCompass, IconSparkle, IconVerified } from "@/components/icons";
import { serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { CallIndicator } from "./CallIndicator";
import { Tooltip } from "./Tooltip";

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
  verified?: boolean;
}

export type DiscoverTab = "popular" | "new";

function useDiscoverableServers() {
  const [items, setItems] = useState<DiscoverableServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
  }, [attempt]);

  return { items, loading, error, reload: () => setAttempt((a) => a + 1) };
}

interface DiscoverSidebarProps {
  tab: DiscoverTab;
  onTabChange: (tab: DiscoverTab) => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
}

export function DiscoverSidebar({
  tab,
  onTabChange,
  onOpenSettings,
  onOpenProfile,
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
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <IconCompass size={18} />
        </span>
        <span className="flex-1 text-[15px] font-bold text-text-normal">Discover</span>
      </header>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
        <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-text-muted">
          Browse
        </p>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`mb-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-150 hover:bg-interactive-hover ${
              tab === t.id ? "bg-brand/15" : ""
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 ${
                tab === t.id ? "bg-brand text-white shadow-[0_2px_10px_-2px_var(--color-brand)]" : "bg-brand/15 text-brand"
              }`}
            >
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

      <CallIndicator />
    </aside>
  );
}

export function DiscoverPanel({ tab, query, onQueryChange }: { tab: DiscoverTab; query: string; onQueryChange: (q: string) => void }) {
  const { servers, joinServerById } = useApp();
  const { items, loading, error, reload } = useDiscoverableServers();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ id: string; message: string } | null>(null);

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
    if (err) setJoinError({ id: server.id, message: err });
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <div className="shrink-0 border-b border-black/20 bg-bg-secondary/60 px-6 pb-5 pt-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_4px_16px_-4px_var(--color-brand)]">
            <IconCompass size={22} />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-text-normal">
              {tab === "popular" ? "Popular spaces" : "New spaces"}
            </h1>
            {!loading && (
              <p className="text-[13px] text-text-muted">
                {visible.length} {visible.length === 1 ? "space" : "spaces"} to explore
              </p>
            )}
          </div>
        </div>
        <div className="relative mt-4 max-w-xl">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name, vibe, or owner…"
            aria-label="Search spaces"
            className="w-full rounded-full border border-divider bg-bg-tertiary py-2.5 pl-11 pr-10 text-[15px] text-text-normal shadow-sm outline-none transition-all placeholder:text-text-muted focus:border-brand/60 focus:ring-2 focus:ring-brand/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            >
              <IconClose size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <ul aria-label="Loading spaces" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="animate-pulse overflow-hidden rounded-2xl border border-divider bg-bg-secondary">
                <div className="h-20 w-full bg-bg-accent" />
                <div className="p-4 pt-0">
                  <div className="-mt-7 mb-3 h-14 w-14 rounded-2xl bg-bg-accent" />
                  <div className="h-4 w-2/3 rounded bg-bg-accent" />
                  <div className="mt-2 h-3 w-full rounded bg-bg-accent" />
                  <div className="mt-4 h-9 w-full rounded-md bg-bg-accent" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className="max-w-sm rounded-lg border border-status-dnd/30 bg-status-dnd/10 p-4" role="alert">
            <h2 className="text-[15px] font-semibold text-text-normal">Couldn&apos;t load spaces</h2>
            <p className="mt-1 text-sm text-text-muted">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-3 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover"
            >
              Try again
            </button>
          </div>
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
            <ul key={tab} className="view-enter grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((server) => {
                const joined = memberIds.has(server.id);
                const banner = safeImageUrl(server.banner_url);
                const icon = safeImageUrl(server.icon_url);
                return (
                  <li
                    key={server.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-divider bg-bg-secondary transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]"
                  >
                    <div className="h-20 w-full bg-gradient-to-br from-brand/40 via-brand/15 to-transparent">
                      {banner && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={banner} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col p-4 pt-0">
                      <div className="-mt-7 mb-3">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={icon}
                            alt=""
                            className="h-14 w-14 rounded-2xl border-4 border-bg-secondary object-cover shadow-lg"
                          />
                        ) : (
                          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-bg-secondary bg-brand text-lg font-bold text-white shadow-lg">
                            {serverInitials(server.name)}
                          </span>
                        )}
                      </div>

                      <p className="flex min-w-0 items-center gap-1 text-[15px] font-semibold text-text-normal">
                        <span className="truncate">{server.name}</span>
                        {server.verified && (
                          <Tooltip label="This space is officially verified by Disband">
                            <IconVerified size={15} className="shrink-0 text-sky-400" />
                          </Tooltip>
                        )}
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
                        className={`mt-4 w-full rounded-xl px-3 py-2.5 text-[13px] font-bold transition-all ${
                          joined
                            ? "cursor-default bg-bg-accent text-text-muted"
                            : "bg-brand text-white shadow-[0_4px_14px_-4px_var(--color-brand)] hover:bg-brand-hover hover:shadow-[0_6px_18px_-4px_var(--color-brand)] disabled:opacity-50"
                        }`}
                      >
                        {joined ? "Joined" : joiningId === server.id ? "Joining…" : "Join"}
                      </button>
                      {joinError?.id === server.id && (
                        <p role="alert" className="mt-2 text-xs text-status-dnd">{joinError.message}</p>
                      )}
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

