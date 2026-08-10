"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

interface RestrictionRow {
  user_id: string;
  restriction: string;
  reason: string | null;
  applied_by: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
}

const RESTRICTION_LABELS: Record<string, string> = {
  join_servers: "Cannot join servers",
  send_messages: "Cannot send messages",
  send_friend_requests: "Cannot send friend requests",
  create_groups: "Cannot create groups",
};

const ALL_RESTRICTIONS = ["join_servers", "send_messages", "send_friend_requests", "create_groups"];

export function AccountRestrictionsPanel() {
  const { profile, refreshRestrictions } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RestrictionRow[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const isStaff = profile?.show_staff_badge || profile?.show_owner_badge;

  const loadRows = useCallback(async () => {
    if (!isStaff) return;
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (!session) return;
    try {
      const res = await fetch("/api/moderation/restrict", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { restrictions?: RestrictionRow[] };
      setRows(json.restrictions ?? []);
    } catch {
      // Ignore transient failures.
    }
  }, [isStaff]);

  useEffect(() => {
    if (isStaff) void loadRows();
  }, [isStaff, loadRows]);

  // Debounced user search.
  useEffect(() => {
    const term = query.trim();
    if (selected || term.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const escaped = term.replace(/[%_,]/g, (m) => `\\\\${m}`);
      const like = `%${escaped}%`;
      try {
        const [byUsername, byDisplayName] = await Promise.all([
          getSupabaseClient().from("profiles").select("*").ilike("username", like).limit(8),
          getSupabaseClient().from("profiles").select("*").ilike("display_name", like).limit(8),
        ]);
        const seen = new Map<string, Profile>();
        for (const row of [...(byUsername.data ?? []), ...(byDisplayName.data ?? [])]) {
          if (!seen.has(row.id)) seen.set(row.id, row as Profile);
        }
        setResults([...seen.values()].slice(0, 8));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
        setDropdownOpen(true);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, selected]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!isStaff) return null;

  async function applyRestriction(restriction: string) {
    if (!selected) return;
    setError(null); setSuccess(null); setLoading(true);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) { setError("Not authenticated"); return; }
      const res = await fetch("/api/moderation/restrict", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "apply", userId: selected.id, restriction }),
      });
      const json = (await res.json()) as { error?: string; success?: boolean };
      if (json.error) { setError(json.error); return; }
      setSuccess(`Applied: ${RESTRICTION_LABELS[restriction] ?? restriction}`);
      await loadRows();
      await refreshRestrictions();
    } catch {
      setError("An unexpected error occurred.");
    } finally { setLoading(false); }
  }

  async function removeRestriction(userId: string, restriction: string) {
    setError(null); setSuccess(null); setLoading(true);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      if (!session) { setError("Not authenticated"); return; }
      const res = await fetch("/api/moderation/restrict", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "remove", userId, restriction }),
      });
      const json = (await res.json()) as { error?: string; success?: boolean };
      if (json.error) { setError(json.error); return; }
      setSuccess("Restriction removed.");
      await loadRows();
      await refreshRestrictions();
    } catch {
      setError("An unexpected error occurred.");
    } finally { setLoading(false); }
  }

  const userRestrictions = selected
    ? rows.filter((r) => r.user_id === selected.id).map((r) => r.restriction)
    : [];

  return (
    <div className="mt-8 space-y-4 border-t border-divider pt-6">
      <div>
        <h3 className="text-sm font-bold uppercase text-orange-400">Account restrictions</h3>
        <p className="mt-1 text-xs text-text-muted">
          Staff &amp; owner only. Restrict specific capabilities without full platform bans.
        </p>
      </div>

      {/* User search */}
      <div ref={containerRef} className="relative">
        <span className="text-xs font-bold uppercase text-text-muted">User</span>
        {selected ? (
          <div className="mt-1 flex items-center gap-3 rounded bg-bg-accent px-3 py-2">
            <Avatar profile={selected} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName(selected)}</p>
              {selected.username && <p className="truncate text-xs text-text-muted">@{selected.username}</p>}
            </div>
            <button type="button" onClick={() => setSelected(null)} className="shrink-0 rounded border border-divider px-2 py-1 text-xs hover:bg-interactive-hover">Change</button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setDropdownOpen(true)}
              placeholder="Search by username or display name..."
              className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
            />
            {dropdownOpen && (searching || results.length > 0 || query.trim().length > 0) && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-divider bg-bg-secondary shadow-lg">
                {searching && <p className="px-3 py-3 text-xs text-text-muted">Searching...</p>}
                {!searching && results.length === 0 && <p className="px-3 py-3 text-xs text-text-muted">No users found.</p>}
                {!searching && results.map((user) => (
                  <button key={user.id} type="button" onClick={() => { setSelected(user); setQuery(""); setResults([]); setDropdownOpen(false); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-interactive-hover">
                    <Avatar profile={user} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{displayName(user)}</p>
                      {user.username && <p className="truncate text-xs text-text-muted">@{user.username}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Apply restrictions */}
      {selected && (
        <div>
          <span className="text-xs font-bold uppercase text-text-muted">Apply restriction</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {ALL_RESTRICTIONS.map((r) => {
              const active = userRestrictions.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  disabled={loading || active}
                  onClick={() => void applyRestriction(r)}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-status-online/20 text-status-online cursor-not-allowed"
                      : "bg-bg-accent text-text-normal hover:bg-interactive-hover"
                  }`}
                >
                  {RESTRICTION_LABELS[r] ?? r}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {success && <p className="text-sm text-status-online">{success}</p>}

      {/* Active restrictions list */}
      {rows.length > 0 && (
        <div className="rounded-lg border border-divider bg-bg-secondary">
          <p className="border-b border-divider px-4 py-2 text-xs font-bold uppercase text-text-muted">Active restrictions</p>
          <ul className="divide-y divide-divider">
            {rows.map((row, i) => (
              <li key={`${row.user_id}-${row.restriction}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{row.display_name || row.username || row.user_id}</p>
                  {row.username && <p className="text-xs text-text-muted">@{row.username}</p>}
                  <p className="text-xs text-orange-400">{RESTRICTION_LABELS[row.restriction] ?? row.restriction}</p>
                  {row.reason && <p className="text-xs text-text-muted italic">{row.reason}</p>}
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void removeRestriction(row.user_id, row.restriction)}
                  className="shrink-0 rounded border border-divider px-3 py-1 text-xs hover:bg-interactive-hover disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
