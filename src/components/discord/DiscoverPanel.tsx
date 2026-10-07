"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconCheck, IconClose, IconSearch, IconCompass, IconSparkle, IconVerified } from "@/components/icons";
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

const SORTS: { id: DiscoverTab; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "popular", label: "Popular", icon: <IconCompass size={17} />, hint: "Most members" },
  { id: "new", label: "New", icon: <IconSparkle size={17} />, hint: "Recently created" },
];

export function DiscoverSidebar({ tab, onTabChange }: DiscoverSidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-divider bg-bg-secondary">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-divider px-4">
        <IconCompass size={18} className="text-text-muted" />
        <span className="flex-1 text-[15px] font-semibold text-text-normal">Discover</span>
      </header>

      <nav aria-label="Browse spaces" className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-3">
        <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted/80">Browse</p>
        {SORTS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              aria-current={active ? "page" : undefined}
              className={`mb-px flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] transition-colors duration-150 ${
                active
                  ? "bg-interactive-selected font-medium text-text-normal"
                  : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </nav>

      <CallIndicator />
    </aside>
  );
}

const BANNER_FALLBACK =
  "linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 46%, var(--color-bg-tertiary)) 0%, color-mix(in srgb, var(--color-brand) 10%, var(--color-bg-tertiary)) 100%)";

function SpaceIcon({ server, className }: { server: DiscoverableServer; className: string }) {
  const icon = safeImageUrl(server.icon_url);
  return icon ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon} alt="" className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center bg-brand font-semibold text-white ${className}`}>
      {serverInitials(server.name)}
    </span>
  );
}

function MemberCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-status-online" aria-hidden />
      {count.toLocaleString()} {count === 1 ? "member" : "members"}
    </span>
  );
}

function JoinButton({
  joined,
  joining,
  onJoin,
  wide,
}: {
  joined: boolean;
  joining: boolean;
  onJoin: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={joined || joining}
      onClick={onJoin}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-semibold transition-[background-color,opacity] ${
        wide ? "w-full" : ""
      } ${
        joined
          ? "cursor-default border border-divider text-text-muted"
          : "bg-text-normal text-bg-primary hover:opacity-90 disabled:opacity-50"
      }`}
    >
      {joined ? (
        <>
          <IconCheck size={15} /> Joined
        </>
      ) : joining ? (
        "Joining…"
      ) : (
        "Join space"
      )}
    </button>
  );
}

export interface DiscoverViewProps {
  tab: DiscoverTab;
  onTabChange?: (tab: DiscoverTab) => void;
  query: string;
  onQueryChange: (q: string) => void;
  items: DiscoverableServer[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  joinedIds: Set<string>;
  joiningId: string | null;
  joinError: { id: string; message: string } | null;
  onJoin: (server: DiscoverableServer) => void;
}

/** The discovery page itself, free of data fetching so it can be rendered on its own. */
export function DiscoverView({
  tab,
  onTabChange,
  query,
  onQueryChange,
  items,
  loading,
  error,
  onRetry,
  joinedIds,
  joiningId,
  joinError,
  onJoin,
}: DiscoverViewProps) {
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
      tab === "popular" ? b.member_count - a.member_count : b.created_at.localeCompare(a.created_at),
    );
  }, [items, query, tab]);

  // The biggest space gets a hero slot, but only on the unfiltered Popular
  // view with enough below it that the page doesn't become one big card.
  const featured = !query.trim() && tab === "popular" && visible.length >= 4 ? visible[0] : null;
  const grid = featured ? visible.slice(1) : visible;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-bg-primary">
      <div className="mx-auto w-full max-w-[1160px] px-8 pb-14 pt-10">
        <header>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-text-normal">
            Find your people
          </h1>
          <p className="mt-1.5 text-[15px] text-text-muted">
            Public spaces from across Disband. Join one in a click.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <IconSearch
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    onQueryChange("");
                  }
                }}
                placeholder="Search spaces by name, topic or owner"
                aria-label="Search spaces"
                className="h-12 w-full rounded-[14px] border border-divider bg-bg-accent pl-12 pr-11 text-[15px] text-text-normal outline-none transition-[border-color,box-shadow] placeholder:text-text-muted/80 focus:border-brand/50 focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand)_14%,transparent)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
                >
                  <IconClose size={15} />
                </button>
              )}
            </div>

            {onTabChange && (
              <div role="group" aria-label="Sort spaces" className="flex h-12 items-center gap-1 rounded-[14px] border border-divider bg-bg-accent p-1">
                {SORTS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={tab === t.id}
                    title={t.hint}
                    onClick={() => onTabChange(t.id)}
                    className={`h-full rounded-[10px] px-4 text-[14px] font-medium transition-colors ${
                      tab === t.id
                        ? "bg-interactive-selected text-text-normal shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                        : "text-text-muted hover:text-text-normal"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!loading && !error && (
            <p className="mt-4 text-[13px] text-text-muted" aria-live="polite">
              {query.trim()
                ? `${visible.length} ${visible.length === 1 ? "result" : "results"} for “${query.trim()}”`
                : `${visible.length} ${visible.length === 1 ? "space" : "spaces"}`}
            </p>
          )}
        </header>

        <div className="mt-6">
          {loading ? (
            <ul aria-label="Loading spaces" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="animate-pulse overflow-hidden rounded-[18px] border border-divider bg-bg-secondary">
                  <div className="h-[104px] w-full bg-bg-accent" />
                  <div className="p-5 pt-0">
                    <div className="-mt-8 mb-3 h-16 w-16 rounded-[16px] bg-bg-accent ring-4 ring-bg-secondary" />
                    <div className="h-4 w-2/3 rounded bg-bg-accent" />
                    <div className="mt-2 h-3 w-full rounded bg-bg-accent" />
                    <div className="mt-5 h-9 w-full rounded-[10px] bg-bg-accent" />
                  </div>
                </li>
              ))}
            </ul>
          ) : error ? (
            <div className="max-w-md rounded-2xl border border-status-dnd/30 bg-status-dnd/[0.07] p-5" role="alert">
              <h2 className="text-[15px] font-semibold text-text-normal">Couldn&apos;t load spaces</h2>
              <p className="mt-1 text-[13.5px] text-text-muted">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-text-normal px-4 text-[13.5px] font-semibold text-bg-primary hover:opacity-90"
              >
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-divider px-6 py-16 text-center">
              <IconSearch size={22} className="text-text-muted" />
              <h2 className="mt-3 text-[16px] font-semibold text-text-normal">
                {query ? "No spaces match that" : "Nothing to discover yet"}
              </h2>
              <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-text-muted">
                {query
                  ? "Try a shorter search, or a topic instead of a name."
                  : "Public spaces will show up here once people create them."}
              </p>
            </div>
          ) : (
            <div key={tab} className="view-enter">
              {featured && (
                <article className="relative mb-6 overflow-hidden rounded-[22px] border border-divider bg-bg-secondary">
                  <div className="relative h-[200px] w-full" style={{ background: BANNER_FALLBACK }}>
                    {safeImageUrl(featured.banner_url) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={safeImageUrl(featured.banner_url)!} alt="" className="h-full w-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-bg-secondary via-bg-secondary/30 to-transparent" />
                    <span className="absolute left-6 top-5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
                      Most popular
                    </span>
                  </div>
                  <div className="relative -mt-14 flex flex-wrap items-end gap-5 px-6 pb-6">
                    <SpaceIcon server={featured} className="h-[84px] w-[84px] rounded-[20px] text-2xl ring-[5px] ring-bg-secondary" />
                    <div className="min-w-0 flex-1">
                      <h2 className="flex items-center gap-1.5 text-[22px] font-semibold tracking-[-0.02em] text-text-normal">
                        <span className="truncate">{featured.name}</span>
                        {featured.verified && (
                          <Tooltip label="This space is officially verified by Disband">
                            <IconVerified size={18} className="shrink-0 text-sky-400" />
                          </Tooltip>
                        )}
                      </h2>
                      <p className="mt-1 line-clamp-2 max-w-2xl text-[14px] leading-relaxed text-text-muted">
                        {featured.description || "No description yet."}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[13px] text-text-muted">
                        <MemberCount count={featured.member_count} />
                        <span>by {featured.owner_name}</span>
                      </p>
                    </div>
                    <JoinButton
                      joined={joinedIds.has(featured.id)}
                      joining={joiningId === featured.id}
                      onJoin={() => onJoin(featured)}
                    />
                  </div>
                  {joinError?.id === featured.id && (
                    <p role="alert" className="px-6 pb-5 text-[12.5px] text-status-dnd">{joinError.message}</p>
                  )}
                </article>
              )}

              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {grid.map((server) => {
                  const banner = safeImageUrl(server.banner_url);
                  return (
                    <li
                      key={server.id}
                      className="flex flex-col overflow-hidden rounded-[18px] border border-divider bg-bg-secondary transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-text-muted/30"
                    >
                      <div className="h-[104px] w-full" style={{ background: BANNER_FALLBACK }}>
                        {banner && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={banner} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col p-5 pt-0">
                        <SpaceIcon server={server} className="-mt-8 mb-3 h-16 w-16 rounded-[16px] text-lg ring-4 ring-bg-secondary" />

                        <p className="flex min-w-0 items-center gap-1.5 text-[15.5px] font-semibold text-text-normal">
                          <span className="truncate">{server.name}</span>
                          {server.verified && (
                            <Tooltip label="This space is officially verified by Disband">
                              <IconVerified size={15} className="shrink-0 text-sky-400" />
                            </Tooltip>
                          )}
                        </p>
                        <p className="mt-1 line-clamp-2 min-h-[2.75rem] text-[13.5px] leading-relaxed text-text-muted">
                          {server.description || "No description yet."}
                        </p>

                        <p className="mt-3 flex min-w-0 items-center gap-x-3 text-[12.5px] text-text-muted">
                          <MemberCount count={server.member_count} />
                          <span className="truncate">by {server.owner_name}</span>
                        </p>

                        <div className="mt-4">
                          <JoinButton
                            wide
                            joined={joinedIds.has(server.id)}
                            joining={joiningId === server.id}
                            onJoin={() => onJoin(server)}
                          />
                        </div>
                        {joinError?.id === server.id && (
                          <p role="alert" className="mt-2 text-[12.5px] text-status-dnd">{joinError.message}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export function DiscoverPanel({
  tab,
  onTabChange,
  query,
  onQueryChange,
}: {
  tab: DiscoverTab;
  onTabChange?: (tab: DiscoverTab) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const { servers, joinServerById } = useApp();
  const { items, loading, error, reload } = useDiscoverableServers();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<{ id: string; message: string } | null>(null);
  const joinedIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers]);

  async function join(server: DiscoverableServer) {
    setJoiningId(server.id);
    setJoinError(null);
    const err = await joinServerById(server.id);
    setJoiningId(null);
    if (err) setJoinError({ id: server.id, message: err });
  }

  return (
    <DiscoverView
      tab={tab}
      onTabChange={onTabChange}
      query={query}
      onQueryChange={onQueryChange}
      items={items}
      loading={loading}
      error={error}
      onRetry={reload}
      joinedIds={joinedIds}
      joiningId={joiningId}
      joinError={joinError}
      onJoin={(s) => void join(s)}
    />
  );
}
