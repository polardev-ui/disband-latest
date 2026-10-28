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

/** Disband Management: the team, space suspensions and strikes. Managers only. */
export function ManagementPanel({ isOwner }: { isOwner: boolean }) {
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
  useEffect(() => { void load(); }, [load]);

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
