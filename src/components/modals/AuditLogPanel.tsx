"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/utils";
import type { Profile, ServerMember } from "@/lib/supabase/types";

interface AuditRow {
  id: number;
  action: string;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  "member.kick": "Kicked a member",
  "member.ban": "Banned a member",
  "member.unban": "Unbanned a member",
  "member.timeout": "Timed out a member",
  "member.untimeout": "Removed a timeout",
  "channel.message.delete": "Deleted a message",
  "dm.message.delete": "Deleted a DM",
  "group.message.delete": "Deleted a group message",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AuditLogPanel({ serverId, members }: { serverId: string; members: (ServerMember & { profile: Profile })[] }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const names = new Map<string, string>();
  for (const m of members) {
    if (m.profile) names.set(m.user_id, displayName(m.profile));
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    void getSupabaseClient()
      .from("audit_log")
      .select("id, action, actor_id, target_type, target_id, details, created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (live) {
          setRows((data as AuditRow[] | null) ?? []);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [serverId]);

  if (loading) {
    return <p className="py-6 text-center text-sm text-text-muted">Loading audit log…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-normal">Audit Log</h2>
        <p className="mt-1 text-sm text-text-muted">The last 100 moderation actions on this server.</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-divider bg-bg-secondary px-4 py-6 text-center text-sm text-text-muted">
          Nothing here yet. Kicks, bans, timeouts and deletions will show up.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 rounded-lg border border-divider bg-bg-secondary px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-normal">
                  {ACTION_LABELS[row.action] ?? row.action}
                </p>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  {row.actor_id ? (names.get(row.actor_id) ?? "Someone") : "System"}
                  {row.target_id && row.target_type === "user"
                    ? ` → ${names.get(row.target_id) ?? "a user"}`
                    : ""}
                  {typeof row.details?.reason === "string" && row.details.reason
                    ? ` · ${row.details.reason}`
                    : ""}
                  {typeof row.details?.seconds === "number" ? ` · ${row.details.seconds}s` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-text-muted">{timeAgo(row.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
