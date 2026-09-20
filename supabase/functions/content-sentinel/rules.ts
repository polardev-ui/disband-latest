// Text detection rules for Disband Sentinel.
//
// These match the *advertising* of illegal material — the seized space named
// what it was selling in its own description and channel names — not ordinary
// conversation about difficult subjects. Getting that distinction right is the
// whole job of this file:
//
//   severity "block"  -> the text is redacted automatically.
//   severity "review" -> a flag is opened for a human; nothing is changed.
//   suspend          -> always false here. A first dry run over real data had
//                        five of six "block" hits turn out to be people
//                        REPORTING abuse or quoting an insult; auto-banning on
//                        wording would have removed the reporters. Accounts are
//                        held on media evidence (a hash match or a classifier
//                        verdict on an actual image), never on text alone.
//
// Single ambiguous words are never enough on their own. "cp" is a Counter-Strike
// callout, a compiler flag and a copy command; it only counts next to trading
// language. Likewise "loli" and "gore" are flagged for review, not acted on:
// they describe legal (if unpleasant) fiction as often as not.
//
// Tuning: run `deno task rules:test` style checks against `SAMPLES` below
// before changing a pattern from review to block.

export interface Rule {
  id: string;
  category: "csam" | "bestiality" | "gore" | "solicitation";
  severity: "block" | "review";
  suspend: boolean;
  pattern: RegExp;
  note: string;
}

// Trading / distribution language that turns an ambiguous term into an offer.
const TRADE = String.raw`(trade|trading|sell|selling|buy|buying|swap|drop|dropping|link|links|menu|vault|folder|mega|onion|tg|telegram|dm\s*me|for\s*sale|price|paypal|crypto|btc)`;

export const RULES: Rule[] = [
  // ----- CSAM: explicit, no plausible innocent reading -----
  {
    id: "csam.explicit",
    category: "csam",
    severity: "block",
    suspend: false,
    pattern: /\b(child|kid|kiddie|kiddy|toddler|infant|preteen|pre-teen|minor)\s*(porn|pornography|nudes?|sex|smut|rape)\b/i,
    note: "Names the material outright.",
  },
  {
    id: "csam.acronym_trade",
    category: "csam",
    severity: "block",
    suspend: false,
    // "cp" only counts beside trading language, within a short window.
    pattern: new RegExp(String.raw`\bc[\W_]?p\b[^.!?\n]{0,40}\b${TRADE}\b|\b${TRADE}\b[^.!?\n]{0,40}\bc[\W_]?p\b`, "i"),
    note: "CP offered or sought for trade.",
  },
  {
    id: "csam.codewords",
    category: "csam",
    severity: "block",
    suspend: false,
    // Long-standing trading codewords; these have no other use.
    pattern: /\b(pthc|ptsc|hussyfan|r@ygold|raygold|childlover|kidporn|jailbait\s*(nudes?|pack)|cheese\s*pizza\b[^.!?\n]{0,30}\b(trade|menu|link))\b/i,
    note: "Known distribution codewords.",
  },
  {
    id: "csam.age_sexual",
    category: "csam",
    severity: "block",
    suspend: false,
    // An explicit age under 18 next to sexual language.
    pattern: /\b(([0-9]|1[0-7])\s*(yo|y\/o|yrs?|years?\s*old))\b[^.!?\n]{0,40}\b(nudes?|porn|lewds?|naked\s*pics?)\b/i,
    note: "Sexual imagery tied to a stated age under 18. Excludes bare profanity, which produced only insults in testing.",
  },
  {
    id: "csam.solicit_minor",
    category: "csam",
    severity: "block",
    suspend: false,
    pattern: /\b(send|post|want|looking\s*for|need|got|have)\b[^.!?\n]{0,25}\b(nudes?|pics?|vids?|videos?)\b[^.!?\n]{0,25}\b(kids?|children|minors?|underage|under\s*18|preteens?)\b/i,
    note: "Solicits sexual imagery of minors.",
  },

  // ----- Bestiality -----
  {
    id: "bestiality.explicit",
    category: "bestiality",
    severity: "block",
    suspend: false,
    pattern: /\b(bestiality|zoophilia|animal\s*(porn|sex)|dog\s*(porn|sex)\b[^.!?\n]{0,20}\b(trade|link|vid))\b/i,
    note: "Names the material outright.",
  },

  // ----- Gore: against Disband's rules, rarely illegal. Removed, not banned. -----
  {
    id: "gore.trade",
    category: "gore",
    severity: "block",
    suspend: false,
    pattern: new RegExp(String.raw`\b(gore|beheading|decapitat\w*|bloodwall|suicide\s*(vid|video|pic))\b[^.!?\n]{0,40}\b${TRADE}\b`, "i"),
    note: "Distributing gore.",
  },
  {
    id: "gore.mention",
    category: "gore",
    severity: "review",
    suspend: false,
    pattern: /\b(gore|bloodwall|beheading)\b/i,
    note: "Mentions gore; could be discussion or a rule being quoted.",
  },

  // ----- Weaker signals: reviewed by a person, never auto-actioned -----
  {
    id: "csam.loli",
    category: "csam",
    severity: "review",
    suspend: false,
    pattern: /\b(loli|lolicon|shota|shotacon)\b/i,
    note: "Often fiction; context decides.",
  },
  {
    id: "csam.age_talk",
    category: "csam",
    severity: "review",
    suspend: false,
    pattern: /\b(underage|jailbait|pedo|paedo)\b/i,
    note: "Frequently appears in accusations and rules text too.",
  },
];

export interface RuleHit {
  rule: Rule;
  excerpt: string;
}

// Only the start of a field is examined. Every rule uses a bounded window, but
// running a dozen of them across a 100 KB paste still costs tens of millions of
// backtracking steps, which killed the sweep outright on long messages. People
// advertising material do it up front, so this loses nothing in practice.
const MAX_SCAN_CHARS = 4000;

// Wording that means someone is talking ABOUT this material rather than
// offering it: reports, warnings, rules, news, moderation notes. Every one of
// these came out of the first real sweep, where the "hits" were users warning
// each other and a note describing a takedown.
const DISCUSSING = new RegExp([
  String.raw`\b(report(ed|ing)?|reporting|flag(ged)?|ban(ned|ning)?|suspend(ed)?|takedown|seized)\b`,
  String.raw`\b(illegal|against\s+(the\s+)?rules|not\s+allowed|disgusting|gross|sick)\b`,
  String.raw`\b(dark\s*web|scam|phish|news|article|psa|warning|beware)\b`,
  String.raw`\b(soliciting|advertis\w+|they\s+have|there\s+is|there's|was\s+a|is\s+a)\b`,
  String.raw`\b(do\s*not|don'?t|never)\s+(post|share|send|click)\b`,
].join("|"), "i");

/** Runs every rule over one piece of text, strongest first. */
export function scanText(input: string | null | undefined): RuleHit[] {
  if (!input) return [];
  const body = input.length > MAX_SCAN_CHARS ? input.slice(0, MAX_SCAN_CHARS) : input;
  const hits: RuleHit[] = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(body);
    if (!match) continue;
    // Keep a short window for the audit trail, never the whole message.
    const start = Math.max(0, match.index - 24);
    const excerpt = body.slice(start, Math.min(body.length, match.index + match[0].length + 24));
    hits.push({ rule, excerpt: excerpt.replace(/\s+/g, " ").slice(0, 160) });
  }
  // Someone describing the problem is not committing it. Demote rather than
  // drop, so it still reaches a human.
  const discussing = DISCUSSING.test(body);
  const graded = discussing
    ? hits.map((h) => (h.rule.severity === "block"
        ? { ...h, rule: { ...h.rule, severity: "review" as const } }
        : h))
    : hits;

  // Blocks before reviews, so the strongest verdict decides the action.
  return graded.sort((a, b) => (a.rule.severity === b.rule.severity ? 0 : a.rule.severity === "block" ? -1 : 1));
}

/** Text that must never trip a rule; guards against over-broad edits. */
export const SAMPLES_SAFE = [
  // Every one of these was a false positive in the first sweep over live data.
  "they have a child porn channel, reporting it now",
  "sites on the dark web often advertise child pornography, beware",
  "we seized a server that was soliciting child pornography, rape and gore",
  "if u want a 12 yr old to fuck ur mom ig u got it bro",
  "cp is the copy command in linux",
  "gg cp on B site",
  "No NSFW. This includes Gore, Pornography, Illicit CSAM, etc.",
  "report anyone underage please",
  "my 17 year old brother plays too",
  "this movie has a lot of gore in it honestly",
];

/** Text that must trip a blocking rule. */
export const SAMPLES_BLOCK = [
  "selling cp dm me for the link",
  "got child porn vids",
  "trading pthc",
  "13 yo nudes anyone",
  "looking for pics of kids",
  "beheading videos for sale",
];
