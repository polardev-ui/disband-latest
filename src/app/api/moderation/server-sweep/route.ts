import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { deepseekChat } from "@/lib/deepseek";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/*
 Sentinel review of a space Disband has suspended (CSAM or other terms
 violations). Every member who spoke there in the last 30 days is judged
 on what they themselves said and the context: bystanders who said nothing
 wrong get nothing, people who took part get a strike sized to what they
 did and the limits that fit it.

 Severity 3 never bans automatically: it applies every limit indefinitely
 and is flagged for a human to decide on a platform ban.
*/

const MAX_AUTHORS = 60;
const MESSAGES_PER_AUTHOR = 30;
const RESTRICTIONS = ["send_messages", "send_reactions", "join_servers", "send_friend_requests", "create_groups"] as const;

interface Verdict {
  severity: 0 | 1 | 2 | 3;
  category: string;
  reason: string;
  restrictions: string[];
  restrict_days: number | null;
}

const SYSTEM = `You are Sentinel, Disband's trust and safety reviewer. A space was suspended for: "{REASON}".
You are given one member's own messages from that space, with a little surrounding context.
Judge only this member's conduct. Return JSON only:
{"severity":0-3,"category":"short label","reason":"one sentence a user will read","restrictions":[...],"restrict_days":number|null}
severity 0: did nothing wrong (bystander, unrelated chat). No restrictions.
severity 1: minor participation or rule-breaking. Usually no restrictions, or a short one.
severity 2: clear participation in the violation. Restrict for days (e.g. 7-30).
severity 3: sharing, requesting or soliciting illegal or sexual content involving minors, or other severe harm. Restrict everything, restrict_days null.
Allowed restrictions: ${RESTRICTIONS.join(", ")}. Never invent facts.`;

export async function POST(req: Request) {
  const actor = await getRouteUser(req);
  if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { data: isManager } = await supabase.rpc("is_platform_manager", { p_user: actor.id });
  if (!isManager) return NextResponse.json({ error: "Only Disband managers can run a review." }, { status: 403 });
  const limit = rateLimit(`sweep:${actor.id}`, 3, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const { serverId } = (await req.json().catch(() => ({}))) as { serverId?: string };
  if (!serverId || !/^[0-9a-f-]{36}$/i.test(serverId)) return NextResponse.json({ error: "Bad space id" }, { status: 400 });
  const { data: server } = await supabase.from("servers").select("id, name, owner_id, suspended_at, suspended_reason").eq("id", serverId).maybeSingle();
  if (!server?.suspended_at) return NextResponse.json({ error: "Suspend the space before reviewing it." }, { status: 409 });

  const { data: channels } = await supabase.from("channels").select("id").eq("server_id", serverId);
  const channelIds = (channels ?? []).map((c: { id: string }) => c.id);
  if (channelIds.length === 0) return NextResponse.json({ reviewed: 0, actions: [] });
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: rows } = await supabase.from("messages").select("author_id, content, created_at")
    .in("channel_id", channelIds).gte("created_at", since).order("created_at", { ascending: false }).limit(4000);

  const byAuthor = new Map<string, { content: string; created_at: string }[]>();
  for (const m of (rows ?? []) as { author_id: string; content: string | null; created_at: string }[]) {
    if (!m.content) continue;
    const list = byAuthor.get(m.author_id) ?? [];
    if (list.length < MESSAGES_PER_AUTHOR) list.push({ content: m.content, created_at: m.created_at });
    byAuthor.set(m.author_id, list);
  }

  const actions: { userId: string; severity: number; category: string; reason: string; restrictions: string[] }[] = [];
  const authors = [...byAuthor.entries()].slice(0, MAX_AUTHORS);
  for (const [userId, messages] of authors) {
    const { data: owner } = await supabase.rpc("is_platform_owner", { p_user: userId });
    if (owner) continue;
    let verdict: Verdict;
    try {
      const transcript = messages.reverse().map((m) => `[${m.created_at.slice(0, 16)}] ${m.content.slice(0, 500)}`).join("\n");
      const res = await deepseekChat({
        system: SYSTEM.replace("{REASON}", server.suspended_reason ?? "terms violation"),
        messages: [{ role: "user", content: `Messages by this member${userId === server.owner_id ? " (the space's owner)" : ""}:\n${transcript}` }],
        maxTokens: 300,
      });
      const json = res.content.slice(res.content.indexOf("{"), res.content.lastIndexOf("}") + 1);
      verdict = JSON.parse(json) as Verdict;
    } catch {
      continue; // A member the model couldn't judge is left for staff, not guessed at.
    }
    const severity = Math.max(0, Math.min(3, Math.round(verdict.severity))) as Verdict["severity"];
    if (severity === 0) continue;
    const restrictions = severity === 3
      ? [...RESTRICTIONS]
      : (verdict.restrictions ?? []).filter((r): r is (typeof RESTRICTIONS)[number] => (RESTRICTIONS as readonly string[]).includes(r));
    const days = severity === 3 ? null : Math.max(1, Math.min(90, Math.round(verdict.restrict_days ?? 7)));
    const reason = `${verdict.reason || "Took part in a space Disband suspended."}`.slice(0, 500);

    await supabase.from("account_strikes").insert({
      user_id: userId, severity, reason, category: verdict.category?.slice(0, 60) ?? null, source: "sentinel",
      server_id: serverId, created_by: actor.id,
      expires_at: severity === 3 ? null : new Date(Date.now() + 120 * 24 * 3600_000).toISOString(),
    });
    for (const r of restrictions) {
      await supabase.from("account_restrictions").upsert({
        user_id: userId, restriction: r, reason, applied_by: actor.id,
        expires_at: days === null ? null : new Date(Date.now() + days * 24 * 3600_000).toISOString(),
      }, { onConflict: "user_id,restriction" });
    }
    actions.push({ userId, severity, category: verdict.category, reason, restrictions });
  }

  return NextResponse.json({ reviewed: authors.length, actions, needsHumanReview: actions.filter((a) => a.severity === 3).map((a) => a.userId) });
}
