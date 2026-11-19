import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { deepseekChat, type DeepSeekContentPart } from "@/lib/deepseek";
import { usernameContainsBlockedWord } from "@/lib/username-policy";
import { PUBLIC_ENV } from "@/lib/public-env";

interface SitePreview { title?: string; description?: string; image?: string }

/**
 * What a submitted link shows: its title, description and preview image,
 * read through the CDN's link-preview service (which refuses private and
 * internal addresses), never fetched directly from here.
 */
async function previewSite(url: string): Promise<SitePreview | null> {
  try {
    const res = await fetch(`${PUBLIC_ENV.mediaApiUrl}/link/preview?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SitePreview & { error?: string };
    if (data.error || (!data.title && !data.description)) return null;
    return { title: data.title?.slice(0, 200), description: data.description?.slice(0, 500), image: data.image };
  } catch {
    return null;
  }
}

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
  "If a website is given, also reject when the site is adult, gambling, a scam or phishing page, malware or 'free nitro/currency' bait, hateful, or clearly unrelated to the bot. " +
  "The tagline must describe the bot; reject a tagline or name that impersonates Disband or another well-known product. " +
  'Answer with JSON only: {"decision":"approve"|"reject","reason":"one short sentence the developer will see"}.';

const REPORT_RULES =
  "A bot developer has reported a review of their bot on Disband's bot marketplace. Decide whether the review breaks the rules. " +
  "Uphold the report (hide the review) only if the review is clearly spam, gibberish, advertising, abusive, or plainly not about this bot. " +
  "An honest negative review is NOT fake: dismiss reports that just dislike criticism. If you genuinely can't tell (for example, a claim only staff could verify), answer unsure. " +
  'Answer with JSON only: {"decision":"approve"|"reject"|"unsure","reason":"one short sentence"} where approve means uphold the report and reject means dismiss it.';

async function reviewListing(service: Service, botId: string): Promise<"approved" | "rejected" | "skipped"> {
  const { data: bot } = await service.from("bots").select("id, name, avatar_url, description, revoked_at").eq("id", botId).maybeSingle();
  const { data: listing } = await service
    .from("bot_listings")
    .select("description, display_name, tagline, category, tags, website_url, privacy_url, terms_url, support_url, official")
    .eq("bot_id", botId)
    .maybeSingle();
  if (listing?.official) return "skipped";
  if (!bot || bot.revoked_at) {
    await service.from("bot_listings").delete().eq("bot_id", botId);
    return "skipped";
  }
  const { data: commands } = await service.from("bot_commands").select("name, description").eq("bot_id", botId).limit(100);
  const description = (listing?.description as string | null) ?? (bot.description as string | null) ?? "";

  const decide = async (status: "approved" | "rejected", note: string) => {
    const now = new Date().toISOString();
    await service.from("bot_listings").update({
      status,
      review_note: note,
      reviewed_by: "tether",
      reviewed_at: now,
      tether_decision: status === "approved" ? "approve" : "reject",
      tether_reason: note,
      tether_reviewed_at: now,
      needs_human: false,
      priority_requested_at: null,
      ...(status === "approved" ? { approved_at: now } : {}),
      updated_at: now,
    }).eq("bot_id", botId).eq("status", "pending");
    return status;
  };
  /** Tether couldn't decide: it stays waiting, flagged for a person, with why. */
  const handOff = async (reason: string) => {
    await service.from("bot_listings").update({
      tether_decision: "unsure",
      tether_reason: reason,
      tether_reviewed_at: new Date().toISOString(),
      needs_human: true,
      priority_requested_at: null,
    }).eq("bot_id", botId).eq("status", "pending");
    return "skipped" as const;
  };

  // The quick filter: a blocked word in the name, or in any description word.
  const shownName = (listing?.display_name as string | null) ?? String(bot.name);
  const tagline = (listing?.tagline as string | null) ?? "";
  const tags = ((listing?.tags as string[] | null) ?? []).join(", ");
  const words = `${shownName} ${bot.name} ${tagline} ${tags} ${description} ${(commands ?? []).map((c) => `${c.name} ${c.description ?? ""}`).join(" ")}`
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((w) => w.length >= 3);
  if (usernameContainsBlockedWord(shownName) || usernameContainsBlockedWord(String(bot.name)) || words.some((w) => usernameContainsBlockedWord(w))) {
    return decide("rejected", "The name, description or commands contain words that aren't allowed.");
  }

  // Every link given has to open. A dead or blocked site is a rejection the
  // developer can fix and resubmit.
  const links: [string, string | null][] = [
    ["website", (listing?.website_url as string | null) ?? null],
    ["privacy policy", (listing?.privacy_url as string | null) ?? null],
    ["terms", (listing?.terms_url as string | null) ?? null],
  ];
  const previews: Record<string, SitePreview> = {};
  for (const [label, url] of links) {
    if (!url) continue;
    const p = await previewSite(url);
    if (!p) return decide("rejected", `We couldn't open your ${label} (${url}). Check the link works for everyone, then resubmit.`);
    previews[label] = p;
  }
  const site = previews.website;

  const text =
    `Bot name: ${shownName}${shownName !== bot.name ? ` (account name: ${bot.name})` : ""}\n` +
    `Tagline: ${tagline || "(none)"}\n` +
    `Category: ${listing?.category ?? "(none)"}; tags: ${tags || "(none)"}\n` +
    `Description: ${description || "(none)"}\n` +
    (site ? `Website ${listing?.website_url}: title "${site.title ?? ""}", description "${site.description ?? ""}"\n` : "Website: (none)\n") +
    `Commands:\n${(commands ?? []).map((c) => `/${c.name}: ${c.description ?? ""}`).join("\n") || "(none)"}`;
  const content: DeepSeekContentPart[] = [{ type: "text", text }];
  if (bot.avatar_url && /^https:\/\//.test(String(bot.avatar_url))) {
    content.push({ type: "text", text: "The bot's avatar image:" }, { type: "image_url", image_url: { url: String(bot.avatar_url) } });
  }
  if (site?.image && /^https:\/\//.test(site.image)) {
    content.push({ type: "text", text: "The website's preview image:" }, { type: "image_url", image_url: { url: site.image } });
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
  if (!verdict) return handOff("Tether couldn't be reached or gave no clear answer. A person needs to check this one.");
  if (verdict.decision === "unsure") return handOff(verdict.reason || "Tether wasn't sure. A person needs to check this one.");
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
  const verdictFields = (d: "uphold" | "dismiss" | "unsure", reason: string) => ({
    tether_decision: d, tether_reason: reason, tether_reviewed_at: now, priority_requested_at: null,
  });
  if (!verdict || verdict.decision === "unsure") {
    const why = verdict?.reason || "Tether couldn't decide. A person needs to check this one.";
    await service.from("bot_review_reports").update({ status: "needs_staff", decision_note: why, ...verdictFields("unsure", why) }).eq("id", report.id);
    return "needs_staff";
  }
  if (verdict.decision === "approve") {
    await service.from("bot_reviews").update({ hidden_at: now }).eq("id", review.id);
    await service.from("bot_review_reports").update({ status: "upheld", decided_by: "tether", decision_note: verdict.reason, decided_at: now, ...verdictFields("uphold", verdict.reason) }).eq("id", report.id);
    return "upheld";
  }
  await service.from("bot_review_reports").update({ status: "dismissed", decided_by: "tether", decision_note: verdict.reason, decided_at: now, ...verdictFields("dismiss", verdict.reason) }).eq("id", report.id);
  return "dismissed";
}

/** The daily run. Returns what happened, for the cron log. */
export async function runMarketplaceReview(): Promise<Record<string, number>> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Service client unavailable.");
  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);

  // Anything staff asked Tether to look at first, then oldest first.
  const { data: pending } = await service
    .from("bot_listings")
    .select("bot_id")
    .eq("status", "pending")
    .order("priority_requested_at", { ascending: false, nullsFirst: false })
    .order("submitted_at")
    .limit(100);
  for (const row of pending ?? []) bump(`listing_${await reviewListing(service, row.bot_id as string)}`);

  const { data: reports } = await service
    .from("bot_review_reports")
    .select("id, review_id, reason, details")
    .eq("status", "open")
    .order("priority_requested_at", { ascending: false, nullsFirst: false })
    .order("created_at")
    .limit(200);
  for (const r of (reports ?? []) as { id: string; review_id: string; reason: string; details: string | null }[]) bump(`report_${await reviewReport(service, r)}`);

  return tally;
}

/**
 * "Review now" from the staff queue: move one item to the front of Tether's
 * list and have Tether review it immediately. If Tether can't be reached it
 * stays first in line for the next daily run.
 */
export async function reviewNow(kind: "listing" | "report", id: string): Promise<string> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Service client unavailable.");
  const now = new Date().toISOString();
  if (kind === "listing") {
    await service.from("bot_listings").update({ priority_requested_at: now }).eq("bot_id", id).eq("status", "pending");
    return reviewListing(service, id);
  }
  await service.from("bot_review_reports").update({ priority_requested_at: now, status: "open" }).eq("id", id).in("status", ["open", "needs_staff"]);
  const { data } = await service.from("bot_review_reports").select("id, review_id, reason, details").eq("id", id).maybeSingle();
  if (!data) return "missing";
  return reviewReport(service, data as { id: string; review_id: string; reason: string; details: string | null });
}
