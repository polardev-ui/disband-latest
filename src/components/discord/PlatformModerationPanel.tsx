"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";

interface PlatformBanRow {
  user_id: string;
  reason: string | null;
  email: string | null;
  created_at: string;
  profile?: { username: string | null; display_name: string | null } | null;
}

export function PlatformModerationPanel() {
  const { profile, platformBanUser, platformUnbanUser } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bans, setBans] = useState<PlatformBanRow[]>([]);

  const loadBans = useCallback(async () => {
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (!session) return;
    const res = await fetch("/api/moderation/platform-ban", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;
    const json = (await res.json()) as { bans?: PlatformBanRow[] };
    setBans(json.bans ?? []);
  }, []);

  useEffect(() => {
    if (profile?.show_owner_badge) void loadBans();
  }, [profile?.show_owner_badge, loadBans]);

  if (!profile?.show_owner_badge) return null;

  async function handleBan() {
    setError(null);
    setSuccess(null);
    setLoading(true);
    const err = await platformBanUser({ username: username.trim(), password, reason: reason.trim() || undefined });
    if (err) setError(err);
    else {
      setSuccess(`Banned @${username.trim().toLowerCase()}`);
      setUsername("");
      setReason("");
      await loadBans();
    }
    setLoading(false);
  }

  async function handleUnban(userId: string, uname: string | null) {
    setError(null);
    setSuccess(null);
    if (!password.trim()) {
      setError("Enter the owner password to unban.");
      return;
    }
    setLoading(true);
    const err = await platformUnbanUser({ userId, password });
    if (err) setError(err);
    else {
      setSuccess(`Unbanned ${uname ? `@${uname}` : "user"}`);
      await loadBans();
    }
    setLoading(false);
  }

  return (
    <div className="mt-8 space-y-4 border-t border-divider pt-6">
      <div>
        <h3 className="text-sm font-bold uppercase text-status-danger">Platform moderation</h3>
        <p className="mt-1 text-xs text-text-muted">
          Owner-only. Requires the <code className="text-text-normal">OWNER_PASSWORD</code> environment variable.
          Banned users are locked out of Disband and cannot re-register with the same email.
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-bold uppercase text-text-muted">Username to ban</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold uppercase text-text-muted">Reason (optional)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold uppercase text-text-muted">Owner password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <button
        type="button"
        disabled={loading || !username.trim() || !password}
        onClick={() => void handleBan()}
        className="rounded bg-status-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        Ban from Disband
      </button>

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {success && <p className="text-sm text-status-online">{success}</p>}

      {bans.length > 0 && (
        <div className="rounded-lg border border-divider bg-bg-secondary">
          <p className="border-b border-divider px-4 py-2 text-xs font-bold uppercase text-text-muted">Active platform bans</p>
          <ul className="divide-y divide-divider">
            {bans.map((ban) => (
              <li key={ban.user_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {ban.profile?.display_name || ban.profile?.username || ban.email || ban.user_id}
                  </p>
                  {ban.profile?.username && <p className="text-xs text-text-muted">@{ban.profile.username}</p>}
                  {ban.reason && <p className="text-xs text-text-muted">{ban.reason}</p>}
                </div>
                <button
                  type="button"
                  disabled={loading || !password}
                  onClick={() => void handleUnban(ban.user_id, ban.profile?.username ?? null)}
                  className="shrink-0 rounded border border-divider px-3 py-1 text-xs hover:bg-interactive-hover disabled:opacity-50"
                >
                  Unban
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
