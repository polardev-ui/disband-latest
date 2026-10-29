"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { confirmDialog } from "@/lib/dialogs";
import { SettingsSection, settingsInputClass } from "./SettingsPrimitives";
import { btn } from "@/components/modals/server-settings/ui";

type Role = "manager" | "staff" | "moderator";
interface Member { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; roles: string[] }

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff", moderator: "Moderator" };
const RESTRICTIONS = [
  ["send_messages", "Sending messages"], ["send_reactions", "Reacting"], ["join_servers", "Joining spaces"],
  ["send_friend_requests", "Friend requests"], ["create_groups", "Group chats"],
] as const;

async function userIdFor(username: string): Promise<string | null> {
  const { data } = await getSupabaseClient().from("profiles").select("id").ilike("username", username.trim().replace(/^@/, "")).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Disband Management. Managers get the team, space suspensions, strikes and
 * bots; staff get strikes and bots.
 */
export function ManagementPanel({ isOwner, isManager = true }: { isOwner: boolean; isManager?: boolean }) {
  const [team, setTeam] = useState<Member[]>([]);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [grantName, setGrantName] = useState("");
  const [grantRole, setGrantRole] = useState<Role>("staff");
  const [space, setSpace] = useState("");
  const [spaceReason, setSpaceReason] = useState("");
  const [sweep, setSweep] = useState(true);
  const [strikeName, setStrikeName] = useState("");
  const [severity, setSeverity] = useState(1);
  const [strikeReason, setStrikeReason] = useState("");
  const [restrict, setRestrict] = useState<string[]>([]);
  const [restrictDays, setRestrictDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const say = (tone: "ok" | "error", text: string) => setNote({ tone, text });
  const load = useCallback(async () => {
    const { data, error } = await getSupabaseClient().rpc("list_platform_team");
    if (error) say("error", error.message);
    else setTeam((data as Member[]) ?? []);
  }, []);
  useEffect(() => { if (isManager) void load(); }, [load, isManager]);

  async function setRole(userId: string, role: Role, grant: boolean) {
    const { error } = await getSupabaseClient().rpc("manager_set_role", { p_user: userId, p_role: role, p_grant: grant });
    if (error) say("error", error.message);
    else { say("ok", `${grant ? "Granted" : "Removed"} ${ROLE_LABEL[role]}.`); void load(); }
  }

  async function grant() {
    const id = await userIdFor(grantName);
    if (!id) return say("error", "No one has that username.");
    await setRole(id, grantRole, true);
    setGrantName("");
  }

  async function resolveSpace(input: string): Promise<string | null> {
    const v = input.trim().replace(/^https?:\/\/[^/]+\/server\//, "");
    if (/^[0-9a-f-]{36}$/i.test(v)) return v;
    const { data } = await getSupabaseClient().rpc("get_server_by_invite", { p_code: v });
    return (data as { id: string }[] | null)?.[0]?.id ?? null;
  }

  async function suspend(suspendIt: boolean) {
    const id = await resolveSpace(space);
    if (!id) return say("error", "Couldn't find that space. Use its ID or an invite link.");
    if (suspendIt && !(await confirmDialog({
      title: "Suspend this space?",
      body: sweep ? "It becomes read-only and closed to new members, and Sentinel reviews everyone who spoke there." : "It becomes read-only and closed to new members.",
      confirmLabel: "Suspend",
    }))) return;
    setBusy(true);
    const { error } = await getSupabaseClient().rpc("manager_suspend_server", { p_server: id, p_suspend: suspendIt, p_reason: spaceReason || null });
    if (error) { setBusy(false); return say("error", error.message); }
    if (suspendIt && sweep) {
      const res = await apiFetch("/api/moderation/server-sweep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverId: id }) });
      const json = (await res.json()) as { reviewed?: number; actions?: unknown[]; needsHumanReview?: string[]; error?: string };
      setBusy(false);
      if (!res.ok) return say("error", `Suspended, but the review failed: ${json.error ?? res.status}`);
      return say("ok", `Suspended. Sentinel reviewed ${json.reviewed} members and acted on ${json.actions?.length ?? 0}${json.needsHumanReview?.length ? `; ${json.needsHumanReview.length} need a human decision on a ban` : ""}.`);
    }
    setBusy(false);
    say("ok", suspendIt ? "Space suspended." : "Suspension lifted.");
  }

  async function strike() {
    const id = await userIdFor(strikeName);
    if (!id) return say("error", "No one has that username.");
    const { error } = await getSupabaseClient().rpc("staff_issue_strike", {
      p_user: id, p_severity: severity, p_reason: strikeReason, p_category: null,
      p_strike_days: 90, p_restrictions: restrict, p_restrict_days: restrict.length ? restrictDays : null,
    });
    if (error) say("error", error.message);
    else { say("ok", "Strike issued."); setStrikeName(""); setStrikeReason(""); setRestrict([]); }
  }

  return (
    <div className="space-y-6">
      {note && <p role="status" className={`rounded-md px-3 py-2 text-[14px] ${note.tone === "ok" ? "bg-status-online/15 text-status-online" : "bg-status-dnd/15 text-status-dnd"}`}>{note.text}</p>}

      {isManager && <>
      <SettingsSection title="Team" description={isOwner ? "Appoint managers, staff and moderators." : "Appoint staff and moderators. Only the owner appoints managers."}>
        <div className="flex flex-wrap gap-2 border-b border-divider px-5 py-4">
          <input value={grantName} onChange={(e) => setGrantName(e.target.value)} placeholder="username" className={`${settingsInputClass} max-w-[220px]`} />
          <select value={grantRole} onChange={(e) => setGrantRole(e.target.value as Role)} className="rounded-[3px] bg-bg-tertiary px-2 text-[14px]">
            {isOwner && <option value="manager">Manager</option>}
            <option value="staff">Staff</option>
            <option value="moderator">Moderator</option>
          </select>
          <button type="button" className={btn.primary} disabled={!grantName.trim()} onClick={() => void grant()}>Grant</button>
        </div>
        <ul className="divide-y divide-divider">
          {team.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1 truncate font-semibold text-header-primary">{m.display_name || m.username} <span className="font-normal text-text-muted">@{m.username}</span></span>
              <span className="flex flex-wrap gap-1.5">
                {m.roles.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-2 py-0.5 text-[12px]">
                    {ROLE_LABEL[r] ?? r}
                    {r !== "owner" && (r !== "manager" || isOwner) && (
                      <button type="button" aria-label={`Remove ${ROLE_LABEL[r]}`} className="text-text-muted hover:text-status-dnd" onClick={() => void setRole(m.user_id, r as Role, false)}>×</button>
                    )}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Suspend a space" description="A suspended space is read-only, hidden from Discover and closed to new members.">
        <div className="space-y-3 px-5 py-4">
          <input value={space} onChange={(e) => setSpace(e.target.value)} placeholder="Space ID or invite link" className={settingsInputClass} />
          <input value={spaceReason} onChange={(e) => setSpaceReason(e.target.value)} placeholder="Reason (required to suspend)" className={settingsInputClass} />
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} />
            Ask Sentinel to review everyone who spoke there and act on their standing
          </label>
          <div className="flex gap-2">
            <button type="button" className={btn.danger} disabled={busy || !space.trim() || !spaceReason.trim()} onClick={() => void suspend(true)}>{busy ? "Working…" : "Suspend space"}</button>
            <button type="button" className={btn.secondary} disabled={busy || !space.trim()} onClick={() => void suspend(false)}>Lift suspension</button>
          </div>
        </div>
      </SettingsSection>

      </>}

      <BotModeration />

      <SettingsSection title="Issue a strike" description="Strikes last 90 days and move the person's Account Standing.">
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <input value={strikeName} onChange={(e) => setStrikeName(e.target.value)} placeholder="username" className={`${settingsInputClass} max-w-[220px]`} />
            <select value={severity} onChange={(e) => setSeverity(Number(e.target.value))} className="rounded-[3px] bg-bg-tertiary px-2 text-[14px]">
              <option value={1}>Minor (1)</option><option value={2}>Serious (2)</option><option value={3}>Severe (3)</option>
            </select>
          </div>
          <input value={strikeReason} onChange={(e) => setStrikeReason(e.target.value)} placeholder="Reason the person will read" className={settingsInputClass} />
          <div className="flex flex-wrap gap-3 text-[14px]">
            {RESTRICTIONS.map(([id, label]) => (
              <label key={id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={restrict.includes(id)} onChange={(e) => setRestrict((v) => e.target.checked ? [...v, id] : v.filter((x) => x !== id))} />
                {label}
              </label>
            ))}
          </div>
          {restrict.length > 0 && (
            <label className="flex items-center gap-2 text-[14px]">For <input type="number" min={1} max={365} value={restrictDays} onChange={(e) => setRestrictDays(Number(e.target.value))} className="w-20 rounded-[3px] bg-bg-tertiary px-2 py-1" /> days</label>
          )}
          <button type="button" className={btn.danger} disabled={!strikeName.trim() || !strikeReason.trim()} onClick={() => void strike()}>Issue strike</button>
        </div>
      </SettingsSection>
    </div>
  );
}

interface ModBot {
  id: string; name: string; avatar_url: string | null; description: string | null; scopes: string[];
  revoked_at: string | null; created_at: string; last_seen_at: string | null; installs?: number;
  owner: { id?: string; username: string | null; display_name: string | null } | null;
}
interface BotDetail {
  bot: ModBot;
  owner: { username: string | null; display_name: string | null } | null;
  installs: { server_id: string; scopes: string[]; created_at: string; server: { name: string; suspended_at: string | null } | null }[];
  messages: { id: string; content: string | null; created_at: string; channel: string | null }[];
  log: { action: string; reason: string; created_at: string }[];
}

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");

/** Staff: find a bot, look at what it does, warn its owner or switch it off. */
function BotModeration() {
  const [query, setQuery] = useState("");
  const [bots, setBots] = useState<ModBot[] | null>(null);
  const [open, setOpen] = useState<BotDetail | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (q: string) => {
    const res = await apiFetch(`/api/admin/bots?q=${encodeURIComponent(q)}`);
    const json = (await res.json().catch(() => ({}))) as { bots?: ModBot[]; error?: string };
    if (!res.ok) setNote({ tone: "error", text: json.error ?? "Couldn't search bots." });
    setBots(json.bots ?? []);
  }, []);
  useEffect(() => { void search(""); }, [search]);

  async function openBot(id: string) {
    setNote(null);
    setReason("");
    const res = await apiFetch(`/api/admin/bots?id=${id}`);
    const json = (await res.json().catch(() => ({}))) as BotDetail & { error?: string };
    if (!res.ok) return setNote({ tone: "error", text: json.error ?? "Couldn't open that bot." });
    setOpen(json);
  }

  async function act(action: "warn" | "deactivate" | "reactivate") {
    if (!open) return;
    if (action === "deactivate" && !(await confirmDialog({ title: `Deactivate ${open.bot.name}?`, body: "Its token stops working at once in every space. The owner is told why.", confirmLabel: "Deactivate" }))) return;
    setBusy(true);
    const res = await apiFetch("/api/admin/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: open.bot.id, action, reason }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setNote({ tone: "error", text: json.error ?? "That didn't work." });
    setNote({ tone: "ok", text: action === "warn" ? "Owner warned." : action === "deactivate" ? "Bot deactivated and owner told." : "Bot reactivated." });
    void openBot(open.bot.id);
    void search(query);
  }

  return (
    <SettingsSection title="Bots" description="Check bots against the Terms of Service. Search by name, owner username, or bot ID.">
      <div className="space-y-3 px-5 py-4">
        {note && <p role="status" className={`rounded-md px-3 py-2 text-[14px] ${note.tone === "ok" ? "bg-status-online/15 text-status-online" : "bg-status-dnd/15 text-status-dnd"}`}>{note.text}</p>}
        <form onSubmit={(e) => { e.preventDefault(); void search(query); }} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bot name, owner or ID" className={settingsInputClass} />
          <button type="submit" className={btn.primary}>Search</button>
        </form>

        {open ? (
          <div className="rounded-lg bg-bg-secondary p-4">
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-header-primary">
                  {open.bot.name}
                  {open.bot.revoked_at && <span className="ml-2 rounded bg-status-dnd/20 px-1.5 py-0.5 text-[11px] font-bold uppercase text-status-dnd">Off</span>}
                </span>
                <span className="block text-[13px] text-text-muted">
                  Owner {open.owner?.display_name || open.owner?.username || "unknown"} (@{open.owner?.username ?? "?"}) · Made {shortDate(open.bot.created_at)} · Last seen {shortDate(open.bot.last_seen_at)}
                </span>
                <code className="mt-1 block text-[12px] text-text-muted">{open.bot.id}</code>
              </span>
              <button type="button" className="text-[13px] text-text-link hover:underline" onClick={() => setOpen(null)}>Back</button>
            </div>
            {open.bot.description && <p className="mt-2 text-[14px] text-text-normal">{open.bot.description}</p>}
            <p className="mt-2 text-[13px] text-text-muted">Permissions: {open.bot.scopes.join(", ") || "none"}</p>

            <p className="mt-4 text-[12px] font-bold uppercase text-header-secondary">Installed in {open.installs.length} {open.installs.length === 1 ? "space" : "spaces"}</p>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-[13px] text-text-normal">
              {open.installs.map((i) => (
                <li key={i.server_id} className="truncate">{i.server?.name ?? i.server_id}{i.server?.suspended_at ? " (suspended)" : ""} · since {shortDate(i.created_at)}</li>
              ))}
            </ul>

            <p className="mt-4 text-[12px] font-bold uppercase text-header-secondary">Recent messages it posted</p>
            <ul className="mt-1 max-h-56 space-y-1.5 overflow-y-auto">
              {open.messages.length === 0 && <li className="text-[13px] text-text-muted">None in spaces.</li>}
              {open.messages.map((m) => (
                <li key={m.id} className="rounded bg-bg-tertiary px-2.5 py-1.5 text-[13px]">
                  <span className="text-text-muted">#{m.channel ?? "?"} · {shortDate(m.created_at)}</span>
                  <p className="whitespace-pre-wrap break-words text-text-normal">{m.content || "(attachment)"}</p>
                </li>
              ))}
            </ul>

            {open.log.length > 0 && (
              <>
                <p className="mt-4 text-[12px] font-bold uppercase text-header-secondary">Staff history</p>
                <ul className="mt-1 space-y-0.5 text-[13px] text-text-normal">
                  {open.log.map((l, i) => <li key={i}>{shortDate(l.created_at)} · <span className="font-semibold capitalize">{l.action}</span>: {l.reason}</li>)}
                </ul>
              </>
            )}

            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason the owner will read" className={`${settingsInputClass} mt-4`} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !reason.trim()} className={btn.secondary} onClick={() => void act("warn")}>Warn owner</button>
              {open.bot.revoked_at ? (
                <button type="button" disabled={busy || !reason.trim()} className={btn.primary} onClick={() => void act("reactivate")}>Reactivate</button>
              ) : (
                <button type="button" disabled={busy || !reason.trim()} className={btn.danger} onClick={() => void act("deactivate")}>Deactivate</button>
              )}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-divider rounded-lg bg-bg-secondary">
            {bots === null && <li className="h-12 animate-pulse" />}
            {bots?.length === 0 && <li className="px-3 py-3 text-[14px] text-text-muted">No bots found.</li>}
            {bots?.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => void openBot(b.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-interactive-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-header-primary">
                      {b.name}
                      {b.revoked_at && <span className="ml-2 rounded bg-status-dnd/20 px-1.5 py-0.5 text-[11px] font-bold uppercase text-status-dnd">Off</span>}
                    </span>
                    <span className="block truncate text-[13px] text-text-muted">@{b.owner?.username ?? "?"} · {b.installs ?? 0} {(b.installs ?? 0) === 1 ? "space" : "spaces"} · last seen {shortDate(b.last_seen_at)}</span>
                  </span>
                  <span className="text-[13px] text-text-link">Review</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSection>
  );
}
