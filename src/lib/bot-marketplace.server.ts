import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { deepseekChat, type DeepSeekContentPart } from "@/lib/deepseek";
import { usernameContainsBlockedWord } from "@/lib/username-policy";

/*
 Tether's daily marketplace review (run by /api/cron/bot-marketplace).

 Submissions: the bot's name, description, avatar and slash commands are
 checked for slurs, sexual content, hate, harassment, scams and the like, in
 any language (Tether translates anything not in English before judging it).
 A quick word filter runs first so obvious cases don't need the model.

 Reported reviews: the bot's developer says a review is fake, spam or
 abusive. Tether upholds it (the review is hidden), dismisses it, or, when it
 can't tell, hands it to staff, who decide from the staff queue.

 If the model can't be reached, nothing is decided: everything stays queued
 for the next run or for staff.
*/

type Service = NonNullable<ReturnType<typeof getServiceSupabase>>;

interface Verdict {
  decision: "approve" | "reject" | "unsure";
  reason: string;
}

function parseVerdict(text: string): Verdict | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { decision?: string; reason?: string };
    const d = j.decision === "approve" || j.decision === "reject" || j.decision === "unsure" ? j.decision : null;
    return d ? { decision: d, reason: String(j.reason ?? "").slice(0, 400) } : null;
  } catch {
    return null;
  }
}

const LISTING_RULES =
  "You review bots submitted to Disband's bot marketplace, a chat app used by teenagers and adults. " +
  "Reject a bot if its name, description, avatar image or any command name or description contains, in ANY language: slurs, hate speech, sexual or explicit content, " +
  "graphic violence or gore, harassment, self-harm encouragement, illegal goods, scams, phishing or impersonation of Disband or its staff, or a name that is itself offensive. " +
  "Translate anything not in English first and judge the meaning, including leetspeak and deliberate misspellings. " +
  "Mild words, jokes, gaming terms and normal moderation commands (ban, kick, mute) are fine. Do not reject for quality or grammar. " +
  'Answer with JSON only: {"decision":"approve"|"reject","reason":"one short sentence the developer will see"}.';

const REPORT_RULES =
  "A bot developer has reported a review of their bot on Disband's bot marketplace. Decide whether the review breaks the rules. " +
  "Uphold the report (hide the review) only if the review is clearly spam, gibberish, advertising, abusive, or plainly not about this bot. " +
  "An honest negative review is NOT fake: dismiss reports that just dislike criticism. If you genuinely can't tell (for example, a claim only staff could verify), answer unsure. " +
  'Answer with JSON only: {"decision":"approve"|"reject"|"unsure","reason":"one short sentence"} where approve means uphold the report and reject means dismiss it.';

async function reviewListing(service: Service, botId: string): Promise<"approved" | "rejected" | "skipped"> {
  const { data: bot } = await service.from("bots").select("id, name, avatar_url, description, revoked_at").eq("id", botId).maybeSingle();
  const { data: listing } = await service.from("bot_listings").select("description").eq("bot_id", botId).maybeSingle();
  if (!bot || bot.revoked_at) {
    await service.from("bot_listings").delete().eq("bot_id", botId);
    return "skipped";
  }
  const { data: commands } = await service.from("bot_commands").select("name, description").eq("bot_id", botId).limit(100);
  const description = (listing?.description as string | null) ?? (bot.description as string | null) ?? "";

  const decide = async (status: "approved" | "rejected", note: string) => {
    await service.from("bot_listings").update({
      status,
      review_note: note,
      reviewed_by: "tether",
      reviewed_at: new Date().toISOString(),
      ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }).eq("bot_id", botId).eq("status", "pending");
    return status;
  };

  // The quick filter: a blocked word in the name, or in any description word.
  const words = `${bot.name} ${description} ${(commands ?? []).map((c) => `${c.name} ${c.description ?? ""}`).join(" ")}`
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((w) => w.length >= 3);
  if (usernameContainsBlockedWord(String(bot.name)) || words.some((w) => usernameContainsBlockedWord(w))) {
    return decide("rejected", "The name, description or commands contain words that aren't allowed.");
  }

  const text =
    `Bot name: ${bot.name}\n` +
    `Description: ${description || "(none)"}\n` +
    `Commands:\n${(commands ?? []).map((c) => `/${c.name}: ${c.description ?? ""}`).join("\n") || "(none)"}`;
  const content: DeepSeekContentPart[] = [{ type: "text", text }];
  if (bot.avatar_url && /^https:\/\//.test(String(bot.avatar_url))) {
    content.push({ type: "text", text: "The bot's avatar image:" }, { type: "image_url", image_url: { url: String(bot.avatar_url) } });
  }

  let verdict: Verdict | null = null;
  try {
    const res = await deepseekChat({ system: LISTING_RULES, messages: [{ role: "user", content }], maxTokens: 200 });
    verdict = parseVerdict(res.content);
  } catch {
    // An image the model can't load: judge the text alone.
    if (content.length > 1) {
      try {
        const res = await deepseekChat({ system: LISTING_RULES, messages: [{ role: "user", content: text }], maxTokens: 200 });
        verdict = parseVerdict(res.content);
      } catch {
        verdict = null;
      }
    }
  }
  if (!verdict || verdict.decision === "unsure") return "skipped";
  return decide(verdict.decision === "approve" ? "approved" : "rejected", verdict.reason || (verdict.decision === "approve" ? "Looks good." : "This bot doesn't meet the marketplace rules."));
}

async function reviewReport(service: Service, report: { id: string; review_id: string; reason: string; details: string | null }): Promise<string> {
  const { data: review } = await service.from("bot_reviews").select("id, bot_id, rating, body").eq("id", report.review_id).maybeSingle();
  if (!review) {
    await service.from("bot_review_reports").update({ status: "dismissed", decided_by: "tether", decision_note: "The review was deleted.", decided_at: new Date().toISOString() }).eq("id", report.id);
    return "dismissed";
  }
  const { data: bot } = await service.from("bots").select("name, description").eq("id", review.bot_id).maybeSingle();
  const prompt =
    `Bot: ${bot?.name ?? "?"} — ${bot?.description ?? ""}\n` +
    `Review: ${review.rating}/5 stars. "${review.body ?? "(no text)"}"\n` +
    `Developer's report reason: ${report.reason}. Details: ${report.details ?? "(none)"}`;
  let verdict: Verdict | null = null;
  try {
    verdict = parseVerdict((await deepseekChat({ system: REPORT_RULES, messages: [{ role: "user", content: prompt }], maxTokens: 150 })).content);
  } catch {
    verdict = null;
  }
  const now = new Date().toISOString();
  if (!verdict || verdict.decision === "unsure") {
    await service.from("bot_review_reports").update({ status: "needs_staff", decision_note: verdict?.reason ?? "Tether couldn't decide." }).eq("id", report.id);
    return "needs_staff";
  }
  if (verdict.decision === "approve") {
    await service.from("bot_reviews").update({ hidden_at: now }).eq("id", review.id);
    await service.from("bot_review_reports").update({ status: "upheld", decided_by: "tether", decision_note: verdict.reason, decided_at: now }).eq("id", report.id);
    return "upheld";
  }
  await service.from("bot_review_reports").update({ status: "dismissed", decided_by: "tether", decision_note: verdict.reason, decided_at: now }).eq("id", report.id);
  return "dismissed";
}

/** The daily run. Returns what happened, for the cron log. */
export async function runMarketplaceReview(): Promise<Record<string, number>> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Service client unavailable.");
  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);

  const { data: pending } = await service.from("bot_listings").select("bot_id").eq("status", "pending").order("submitted_at").limit(100);
  for (const row of pending ?? []) bump(`listing_${await reviewListing(service, row.bot_id as string)}`);

  const { data: reports } = await service.from("bot_review_reports").select("id, review_id, reason, details").eq("status", "open").order("created_at").limit(200);
  for (const r of (reports ?? []) as { id: string; review_id: string; reason: string; details: string | null }[]) bump(`report_${await reviewReport(service, r)}`);

  return tally;
}
