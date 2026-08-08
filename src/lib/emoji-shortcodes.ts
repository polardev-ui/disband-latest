import githubShortcodes from "emojibase-data/en/shortcodes/github.json";

const shortcodeToEmoji = new Map<string, string>();
const emojiToShortcode = new Map<string, string>();

function hexcodeToEmoji(hex: string): string {
  return String.fromCodePoint(...hex.split("-").map((h) => parseInt(h, 16)));
}

for (const [hex, short] of Object.entries(githubShortcodes)) {
  const emoji = hexcodeToEmoji(hex);
  const codes = Array.isArray(short) ? short : [short];
  for (const code of codes) {
    if (!shortcodeToEmoji.has(code)) shortcodeToEmoji.set(code, emoji);
  }
  if (!emojiToShortcode.has(emoji)) emojiToShortcode.set(emoji, codes[0]);
}

export interface EmojiMatch {
  emoji: string;
  shortcode: string;
}

const POPULAR_SHORTCODES = [
  "joy",
  "sob",
  "heart",
  "fire",
  "cry",
  "grin",
  "laughing",
  "sunglasses",
  "star",
  "clap",
  "100",
  "thinking_face",
  "eyes",
  "wink",
  "smile",
  "sweat_smile",
  "heart_eyes",
  "kissing_heart",
  "hugging_face",
  "party_face",
  "exploding_head",
  "rolling_eyes",
  "innocent",
  "smirk",
  "unamused",
  "weary",
  "angry",
  "skull",
  "alien",
  "robot",
  "ghost",
  "muscle",
  "ok_hand",
  "thumbsup",
  "wave",
  "pray",
  "folded_hands",
  "gift",
  "birthday",
  "party_popper",
  "tada",
];

/** Exact shortcode lookup, e.g. `sob` → 😭. Returns null when unknown. */
export function lookupShortcode(code: string): string | null {
  const key = code.trim().toLowerCase().replace(/:/g, "").replace(/_+$/, "");
  if (!key) return null;
  return shortcodeToEmoji.get(key) ?? null;
}

/** Primary Discord-style shortcode for an emoji (used for display/titles). */
export function shortcodeForEmoji(emoji: string): string | undefined {
  return emojiToShortcode.get(emoji);
}

/** Fuzzy search over shortcodes for the `:`-picker. */
export function searchEmojis(query: string, limit = 12): EmojiMatch[] {
  const q = query.trim().toLowerCase().replace(/[\s:_-]/g, "");
  if (!q) {
    return POPULAR_SHORTCODES.map((c) => {
      const emoji = shortcodeToEmoji.get(c);
      return emoji ? { emoji, shortcode: c } : null;
    }).filter((m): m is EmojiMatch => !!m).slice(0, limit);
  }
  const results: EmojiMatch[] = [];
  for (const [code, emoji] of shortcodeToEmoji) {
    if (code.includes(q)) {
      results.push({ emoji, shortcode: code });
      if (results.length >= limit) break;
    }
  }
  return results;
}
