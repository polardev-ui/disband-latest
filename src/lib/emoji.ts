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

const EMOJI_ONLY_RE =
  /^(?:\p{Extended_Pictographic}(?:[\p{Emoji_Modifier}\uFE0F\u200D]\p{Extended_Pictographic}*)|\s)+$/u;

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
      if (/\p{Extended_Pictographic}/u.test(segment)) count += 1;
    }
  } catch {
    const matches = content.match(/\p{Extended_Pictographic}(?:[\p{Emoji_Modifier}\uFE0F\u200D]\p{Extended_Pictographic}*)?/gu);
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
