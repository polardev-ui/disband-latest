
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

const EMOJI_SEQUENCE =
  "(?:\\p{Regional_Indicator}{2}|[\\u0023\\u002A0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|[\\uFE0F\\uFE0E]|\\u20E3|\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?)*)";

const EMOJI_ONLY_RE = new RegExp(`^(?:${EMOJI_SEQUENCE}|\\s)+$`, "u");

const EMOJI_GRAPHEME_RE = new RegExp(`^${EMOJI_SEQUENCE}$`, "u");

export function isEmojiOnlyMessage(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  return EMOJI_ONLY_RE.test(text);
}

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

export function emojiOnlySizeClass(content: string): string {
  const n = countEmojis(content);
  if (n <= 1) return "text-[3rem] leading-[3.25rem]";
  if (n === 2) return "text-[2.5rem] leading-[2.75rem]";
  if (n === 3) return "text-[2rem] leading-[2.25rem]";
  return "";
}
