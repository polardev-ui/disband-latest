"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { displayName } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { IconLeave, IconLock, IconNotes, IconTimer, IconTrash } from "@/components/icons";
import { EmptyState, enterStyle } from "@/components/modals/server-settings/ui";
import type { Profile } from "@/lib/supabase/types";

interface AuditRow {
  id: number;
  action: string;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ACTIONS: Record<string, { label: string; icon: ComponentType<{ size?: number }>; tone: "danger" | "muted" }> = {
  "member.kick": { label: "kicked", icon: IconLeave, tone: "danger" },
  "member.ban": { label: "banned", icon: IconLock, tone: "danger" },
  "member.unban": { label: "lifted the ban on", icon: IconLock, tone: "muted" },
  "member.timeout": { label: "timed out", icon: IconTimer, tone: "danger" },
  "member.untimeout": { label: "removed the timeout on", icon: IconTimer, tone: "muted" },
  "channel.message.delete": { label: "deleted a message", icon: IconTrash, tone: "muted" },
  "dm.message.delete": { label: "deleted a DM", icon: IconTrash, tone: "muted" },
  "group.message.delete": { label: "deleted a group message", icon: IconTrash, tone: "muted" },
};

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

/** The last 100 moderation actions in a space. */
export function AuditLogPanel({ serverId }: { serverId: string }) {
  const { members } = useApp();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const byId = useMemo(() => new Map(members.map((m) => [m.user_id, m.profile])), [members]);
  const [extraProfiles, setExtraProfiles] = useState<Map<string, Profile>>(new Map());

  // The member rail loads a single page, so an actor or target outside it
  // would render as "Someone" / "a former member"; resolve those directly.
  useEffect(() => {
    const missing = new Set<string>();
    for (const r of rows) {
      if (r.actor_id && !byId.has(r.actor_id)) missing.add(r.actor_id);
      if (r.target_id && r.target_type === "user" && !byId.has(r.target_id)) missing.add(r.target_id);
    }
    if (missing.size === 0) {
      setExtraProfiles((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let live = true;
    void fetchProfilesByIds(getSupabaseClient(), [...missing]).then((map) => {
      if (live) setExtraProfiles(map);
    });
    return () => {
      live = false;
    };
  }, [rows, byId]);

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
        if (!live) return;
        setRows((data as AuditRow[] | null) ?? []);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [serverId]);

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg bg-bg-secondary">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-divider px-4 py-3.5 last:border-b-0">
            <div className="h-8 w-8 animate-pulse rounded-full bg-bg-accent" />
            <div className="h-3 flex-1 animate-pulse rounded bg-bg-accent" style={{ maxWidth: 220 + i * 40 }} />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg bg-bg-secondary">
        <EmptyState icon={<IconNotes size={20} />} title="Nothing logged yet" body="Kicks, bans, timeouts and deleted messages will show up here." />
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-lg bg-bg-secondary">
      {rows.map((row, i) => {
        const action = ACTIONS[row.action];
        const Icon = action?.icon ?? IconNotes;
        const actor = row.actor_id ? (byId.get(row.actor_id) ?? extraProfiles.get(row.actor_id) ?? null) : null;
        const target = row.target_id && row.target_type === "user" ? (byId.get(row.target_id) ?? extraProfiles.get(row.target_id) ?? null) : null;
        const reason = typeof row.details?.reason === "string" && row.details.reason ? row.details.reason : null;
        const seconds = typeof row.details?.seconds === "number" ? row.details.seconds : null;
        return (
          <li key={row.id} className="view-enter flex items-start gap-3 border-b border-divider px-4 py-3 last:border-b-0" style={enterStyle(i)}>
            <div className="relative shrink-0">
              {actor ? <Avatar profile={actor} size="sm" /> : <span className="block h-8 w-8 rounded-full bg-bg-accent" />}
              <span
                className={`absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-bg-secondary ${
                  action?.tone === "danger" ? "bg-status-dnd text-white" : "bg-bg-accent text-text-muted"
                }`}
              >
                <Icon size={10} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-snug text-text-muted">
                <span className="font-medium text-text-normal">{actor ? displayName(actor) : row.actor_id ? "Someone" : "Disband"}</span>{" "}
                {action?.label ?? row.action}
                {row.target_type === "user" && (
                  <>
                    {" "}
                    <span className="font-medium text-text-normal">{target ? displayName(target) : "a former member"}</span>
                  </>
                )}
                {seconds !== null && <> for {formatDuration(seconds)}</>}
              </p>
              {reason && <p className="mt-0.5 truncate text-[12.5px] text-text-muted">“{reason}”</p>}
            </div>
            <time dateTime={row.created_at} title={new Date(row.created_at).toLocaleString()} className="shrink-0 text-[12px] text-text-muted">
              {timeAgo(row.created_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
