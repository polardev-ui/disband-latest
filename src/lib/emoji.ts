/** Common emoji palette for the chat picker (grouped for UI). */
export const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬"],
  },
  {
    name: "Gestures",
    emojis: ["👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✍️", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄"],
  },
  {
    name: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"],
  },
  {
    name: "Objects",
    emojis: ["🔥", "✨", "⭐", "🌟", "💫", "⚡", "💥", "💯", "💢", "💬", "👁️‍🗨️", "🗨️", "🗯️", "💭", "💤", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉", "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎮", "🕹️", "🎲", "🧩", "🎯", "🎵", "🎶", "🎤", "🎧", "📱", "💻", "⌨️", "🖥️", "🖨️", "📷", "🎬", "📺", "📻", "⏰", "🔔", "🔕", "📣", "📢"],
  },
  {
    name: "Food",
    emojis: ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🌶️", "🥕", "🌽", "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🌯", "🥙", "🧆", "🥚", "🍳", "🥞", "🧇", "🥓", "🍗", "🍖", "🦴", "🌭", "🍿", "🧈", "🍩", "🍪", "🎂", "🍰", "🧁", "🥧", "🍫", "🍬", "🍭", "☕", "🍵", "🧃", "🥤", "🍺", "🍻", "🥂", "🍷"],
  },
  {
    name: "Animals",
    emojis: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦄", "🐝", "🪲", "🦋", "🐌", "🐞", "🐢", "🐍", "🦎", "🐙", "🦑", "🦐", "🐠", "🐟", "🐬", "🐳", "🦈", "🐊"],
  },
];

/**
 * One emoji: a pictograph plus whatever may trail it — a skin-tone modifier,
 * a variation selector, a keycap, or further pictographs joined with ZWJ.
 *
 * The trailing part has to be optional. It was not, so a bare "\u{1F525}" or
 * "\u{1F62D}" failed to match while "\u2764\uFE0F" and "\u{1F937}\u200D\u2642\uFE0F"
 * matched — which is exactly why only some emoji rendered large. Flags are
 * their own shape: a pair of regional indicators, no pictograph involved.
 */
const EMOJI_SEQUENCE =
  "(?:\\p{Regional_Indicator}{2}|[\\u0023\\u002A0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|[\\uFE0F\\uFE0E]|\\u20E3|\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?)*)";

const EMOJI_ONLY_RE = new RegExp(`^(?:${EMOJI_SEQUENCE}|\\s)+$`, "u");

/** One whole emoji and nothing else — a flag or a keycap counts as one too. */
const EMOJI_GRAPHEME_RE = new RegExp(`^${EMOJI_SEQUENCE}$`, "u");

/** True when the message is only emoji (and optional whitespace) — render larger in chat. */
export function isEmojiOnlyMessage(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  return EMOJI_ONLY_RE.test(text);
}

/** Count emoji by grapheme cluster so ZWJ sequences (e.g. family emoji) count as one. */
export function countEmojis(content: string): number {
  let count = 0;
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const { segment } of seg.segment(content)) {
      if (EMOJI_GRAPHEME_RE.test(segment)) count += 1;
    }
  } catch {
    const matches = content.match(new RegExp(EMOJI_SEQUENCE, "gu"));
    count = matches?.length ?? 0;
  }
  return count;
}

/**
 * Discord/iMessage-style emoji-only sizing: one emoji is largest, two a step
 * down, three one more step down, and four or more render at normal text size.
 * Returns a Tailwind size class, or "" for normal sizing.
 */
export function emojiOnlySizeClass(content: string): string {
  const n = countEmojis(content);
  if (n <= 1) return "text-[3rem] leading-[3.25rem]";
  if (n === 2) return "text-[2.5rem] leading-[2.75rem]";
  if (n === 3) return "text-[2rem] leading-[2.25rem]";
  return "";
}
