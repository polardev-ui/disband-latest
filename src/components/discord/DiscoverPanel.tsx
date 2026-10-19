"use client";

import { useEffect, useMemo, useState } from "react";
import { CommunityBackdrop } from "@/components/ui/CommunityBackdrop";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconCheck, IconClose, IconSearch, IconCompass, IconSparkle, IconVerified } from "@/components/icons";
import { serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
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
  online_count?: number;
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
  { id: "popular", label: "Home", icon: <IconCompass size={22} />, hint: "Most members" },
  { id: "new", label: "New Spaces", icon: <IconSparkle size={22} />, hint: "Recently created" },
];

export function DiscoverSidebar({ tab, onTabChange }: DiscoverSidebarProps) {
  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg-secondary">
      <h1 className="px-4 pb-3 pt-6 text-[24px] font-bold leading-[30px] text-header-primary">Discover</h1>
      <nav aria-label="Browse spaces" className="channel-scroll min-h-0 flex-1 overflow-y-auto px-2">
        {SORTS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              aria-current={active ? "page" : undefined}
              className={`mb-0.5 flex h-11 w-full items-center gap-3 rounded-[4px] px-2 text-left text-[16px] font-medium transition-colors duration-100 ${
                active ? "bg-brand text-white" : "text-channels-default hover:bg-interactive-hover hover:text-interactive-active"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${active ? "text-white" : ""}`}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

const BANNER_FALLBACK =
  "var(--brand)";

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

function Counts({ server }: { server: DiscoverableServer }) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-header-secondary">
      {typeof server.online_count === "number" && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-status-online" aria-hidden />
          {server.online_count.toLocaleString()} Online
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[#80848e]" aria-hidden />
        {server.member_count.toLocaleString()} {server.member_count === 1 ? "Member" : "Members"}
      </span>
    </p>
  );
}

function JoinButton({
  joined,
  joining,
  onJoin,
}: {
  joined: boolean;
  joining: boolean;
  onJoin: () => void;
}) {
  if (joined) {
    return (
      <span className="inline-flex h-8 shrink-0 items-center gap-1 px-1 text-[14px] font-medium text-header-secondary">
        <IconCheck size={15} /> Joined
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={joining}
      onClick={onJoin}
      className="inline-flex h-8 shrink-0 items-center justify-center rounded-[3px] bg-button-green px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-green-hover disabled:opacity-50"
    >
      {joining ? "Joining…" : "Join"}
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

  const heading = query.trim()
    ? `${visible.length.toLocaleString()} ${visible.length === 1 ? "result" : "results"} for “${query.trim()}”`
    : tab === "popular"
      ? "Featured spaces"
      : "New spaces";

  return (
    <main className="chat-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-bg-primary">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-4 sm:px-8 sm:pt-8">
        <header className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-lg bg-brand px-5 py-10 text-center sm:min-h-[280px] sm:px-12">
          <CommunityBackdrop className="opacity-35" />
          <div className="relative w-full max-w-[680px]">
            <h1 className="text-[24px] font-bold leading-[30px] text-white sm:text-[28px]">Find your community on Disband</h1>
            <p className="mt-2 text-[16px] leading-5 text-white/90">From gaming, to music, to learning, there&apos;s a place for you.</p>

            <div className="relative mx-auto mt-6 w-full max-w-[560px]">
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    onQueryChange("");
                  }
                }}
                placeholder="Explore spaces"
                aria-label="Search spaces"
                className="h-11 w-full rounded-[4px] bg-white pl-4 pr-11 text-[16px] text-[#060607] outline-none placeholder:text-[#5c5e66] shadow-[var(--elevation-high)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-[#5c5e66] hover:text-[#060607]"
                >
                  <IconClose size={18} />
                </button>
              ) : (
                <IconSearch size={20} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5c5e66]" />
              )}
            </div>
          </div>
        </header>

        {onTabChange && (
          <div role="group" aria-label="Sort spaces" className="mt-6 flex gap-2 md:hidden">
            {SORTS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                title={t.hint}
                onClick={() => onTabChange(t.id)}
                className={`h-8 rounded-full px-3 text-[14px] font-medium transition-colors ${
                  tab === t.id ? "bg-brand text-white" : "bg-bg-secondary text-header-secondary hover:text-header-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <h2 className="mb-4 mt-8 text-[20px] font-semibold leading-6 text-header-primary" aria-live="polite">
          {loading ? (tab === "popular" ? "Featured spaces" : "New spaces") : heading}
        </h2>

        {loading ? (
          <ul aria-label="Loading spaces" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(248px,1fr))]">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="animate-pulse overflow-hidden rounded-lg bg-bg-secondary">
                <div className="h-[138px] w-full bg-bg-tertiary" />
                <div className="px-4 pb-4">
                  <div className="-mt-6 mb-3 h-12 w-12 rounded-[14px] bg-bg-tertiary ring-4 ring-bg-secondary" />
                  <div className="h-4 w-2/3 rounded bg-bg-tertiary" />
                  <div className="mt-2 h-3 w-full rounded bg-bg-tertiary" />
                  <div className="mt-1.5 h-3 w-4/5 rounded bg-bg-tertiary" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className="max-w-md rounded-lg bg-bg-secondary p-5" role="alert">
            <h3 className="text-[16px] font-semibold text-header-primary">Couldn&apos;t load spaces</h3>
            <p className="mt-1 text-[14px] text-header-secondary">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex h-8 items-center rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white hover:bg-button-secondary-hover"
            >
              Try Again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <IconSearch size={40} className="text-interactive-muted" />
            <h3 className="mt-4 text-[20px] font-semibold text-header-primary">
              {query ? "No results found" : "Nothing to discover yet"}
            </h3>
            <p className="mt-2 max-w-sm text-[16px] leading-5 text-header-secondary">
              {query ? "Try searching for something else, or a topic instead of a name." : "Public spaces will show up here once people create them."}
            </p>
          </div>
        ) : (
          <ul key={tab} className="view-enter grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(248px,1fr))]">
            {visible.map((server) => {
              const banner = safeImageUrl(server.banner_url);
              return (
                <li
                  key={server.id}
                  className="group flex flex-col overflow-hidden rounded-lg bg-bg-secondary transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-bg-secondary-alt hover:shadow-[var(--elevation-high)]"
                >
                  <div className="relative h-[138px] w-full shrink-0" style={{ background: BANNER_FALLBACK }}>
                    {banner && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={banner} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute -bottom-[26px] left-3 rounded-[16px] bg-bg-secondary p-1 transition-colors group-hover:bg-bg-secondary-alt">
                      <SpaceIcon server={server} className="h-10 w-10 rounded-[12px] text-[14px]" />
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-9">
                    <p className="flex min-w-0 items-center gap-1 text-[16px] font-semibold leading-5 text-header-primary">
                      {server.verified && (
                        <Tooltip label="Verified" side="top">
                          <IconVerified size={16} className="shrink-0 text-[#23a55a]" />
                        </Tooltip>
                      )}
                      <span className="truncate">{server.name}</span>
                    </p>
                    <p className="mt-1 line-clamp-3 min-h-[54px] flex-1 text-[14px] leading-[18px] text-header-secondary">
                      {server.description || "No description yet."}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Counts server={server} />
                      <JoinButton joined={joinedIds.has(server.id)} joining={joiningId === server.id} onJoin={() => onJoin(server)} />
                    </div>
                    {joinError?.id === server.id && (
                      <p role="alert" className="mt-2 text-[12px] text-status-dnd">{joinError.message}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
