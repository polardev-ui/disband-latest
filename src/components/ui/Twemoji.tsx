"use client";

import { cloneElement, isValidElement, type ReactNode } from "react";
import twemoji from "@twemoji/api";

interface TwemojiProps {
  children: ReactNode;
  className?: string;
}

/**
 * Render emoji as Twemoji images without touching the DOM.
 *
 * This used to call `twemoji.parse(el)` in an effect, which swaps emoji text
 * nodes for <img> elements behind React's back. The next render that changed
 * anything in the same message (a mention chip resolving from <span> to
 * <button> once members loaded was the classic trigger) then crashed with
 * `Failed to execute 'insertBefore' on 'Node'`, because the sibling React
 * was inserting before no longer existed. Rendering the images as React
 * elements instead keeps the virtual DOM and the real DOM in agreement.
 *
 * Parity notes vs the old parse behavior: every string child is scanned,
 * including text inside <code> spans (parse rewrote those too), and the
 * emitted <img className="twemoji"> matches the existing globals.css sizing.
 */
export function Twemoji({ children, className }: TwemojiProps) {
  return <span className={className}>{renderEmojiNodes(children)}</span>;
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

// Only graphemes the Twemoji set actually contains become images. An earlier
// version used the blanket range [\u2000-\u3300], which swallowed ordinary
// punctuation — iOS and macOS type smart quotes (' U+2019, "" U+201C/201D)
// by default, and every apostrophe turned into a broken <img> (the CDN has
// no 2019.png). The rules below mirror what twemoji.parse() converted:
//   - pictographic emoji (covers ZWJ sequences, skin tones, flags pairs are
//     handled separately, hearts, etc.),
//   - the text-presentation symbols Twemoji ships (©, ™, arrows, dingbats…),
//   - keycap bases (#, *, 0-9) glued to U+20E3,
//   - regional-indicator pairs (flags — segment as one grapheme but do not
//     match Extended_Pictographic, so they need their own rule).
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const SYMBOL_RE = /^[\u00a9\u00ae\u203c\u2049\u2122\u2139\u2190-\u2199\u21a9-\u21aa\u231a-\u231b\u2328\u23cf\u23e9-\u23f3\u23f8-\u23fa\u24c2\u25aa-\u25ab\u25b6\u25c0\u25fb-\u25fe\u2600-\u2604\u260e\u2611\u2614\u2615\u2618\u261d\u2620\u2622\u2623\u2626\u262a\u262e\u262f\u2638-\u263a\u2640\u2642\u2648-\u2653\u265f\u2660\u2663\u2665\u2666\u2668\u267b\u267e\u267f\u2692-\u2697\u2699\u269b\u269c\u26a0\u26a1\u26a7\u26aa\u26ab\u26b0\u26b1\u26bd\u26be\u26c4\u26c5\u26c8\u26ce\u26cf\u26d1\u26d3\u26d4\u26e9\u26ea\u26f0-\u26f5\u26f7-\u26fa\u26fd\u2702\u2705\u2708-\u270d\u270f\u2712\u2714\u2716\u271d\u2721\u2728\u2733\u2734\u2744\u2747\u274c\u274e\u2753-\u2755\u2757\u2763-\u2765\u2795-\u2797\u27a1\u27b0\u27bf\u2934\u2935\u2b05-\u2b07\u2b1b\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299](?:\ufe0f)?$/u;
const KEYCAP_RE = /^[#*0-9]\uFE0F?\u20E3$/;
const FLAG_RE = /^(?:\uD83C[\uDDE6-\uDDFF]){2}$/;

function isEmojiGrapheme(g: string): boolean {
  if (KEYCAP_RE.test(g) || FLAG_RE.test(g)) return true;
  if (SYMBOL_RE.test(g)) return true;
  return EMOJI_RE.test(g);
}

function emojiImage(grapheme: string, key: string) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={key}
      className="twemoji"
      draggable={false}
      alt={grapheme}
      src={twemojiUrl(grapheme)}
    />
  );
}

function renderEmojiString(text: string, keyPrefix: string): ReactNode[] {
  if (!segmenter || !mayContainEmoji(text)) return [text];
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  for (const { segment } of segmenter.segment(text)) {
    if (isEmojiGrapheme(segment)) {
      flush();
      out.push(emojiImage(segment, `${keyPrefix}e${i++}`));
    } else {
      buf += segment;
    }
  }
  flush();
  return out;
}

function renderEmojiNodes(node: ReactNode, keyPrefix = "tw"): ReactNode {
  if (typeof node === "string") {
    const parts = renderEmojiString(node, keyPrefix);
    return parts.length === 1 ? parts[0] : parts;
  }
  if (Array.isArray(node)) {
    return node.map((child, i) => renderEmojiNodes(child, `${keyPrefix}${i}-`));
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const kids = node.props.children;
    if (kids === undefined || kids === null) return node;
    return cloneElement(node, {
      ...node.props,
      children: renderEmojiNodes(kids, `${keyPrefix}c-`),
    } as Record<string, unknown>);
  }
  return node;
}

const ZWJ = "\u200d";
const VARIATION_SELECTOR_16 = /\ufe0f/g;

/**
 * Cheap superset pre-test: true for any string that *might* contain an
 * emoji grapheme (pictographic, Dingbat/symbol ranges Twemoji ships, keycap
 * bases, regional indicators). False means renderEmojiString would emit the
 * text untouched, so the segmentation walk is skipped outright — the common
 * case, since most message text has no emoji. A false positive only costs
 * the walk, never a wrong render.
 */
const MAYBE_EMOJI_RE =
  /[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}|[\u00a9\u00ae\u203c\u2049\u2122\u2139\u2190-\u21aa\u231a\u231b\u2328\u23cf\u23e9-\u23fa\u24c2\u25aa\u25ab\u25b6\u25c0\u25fb-\u25fe\u2600-\u2604\u260e\u2611\u2614\u2615\u2618\u261d\u2620\u2622\u2623\u2626\u262a\u262e\u262f\u2638-\u263a\u2640\u2642\u2648-\u2653\u265f\u2660\u2663\u2665\u2666\u2668\u267b\u267e\u267f\u2692-\u2697\u2699\u269b\u269c\u26a0\u26a1\u26a7\u26aa\u26ab\u26b0\u26b1\u26bd\u26be\u26c4\u26c5\u26c8\u26ce\u26cf\u26d1\u26d3\u26d4\u26e9\u26ea\u26f0-\u26f5\u26f7-\u26fa\u26fd\u2702\u2705\u2708-\u270d\u270f\u2712\u2714\u2716\u271d\u2721\u2728\u2733\u2734\u2744\u2747\u274c\u274e\u2753-\u2755\u2757\u2763-\u2765\u2795-\u2797\u27a1\u27b0\u27bf\u2934\u2935\u2b05-\u2b07\u2b1b\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299\u{1F1E6}-\u{1F1FF}]/u;

/** Exported for tests: the fast-path gate for emoji segmentation. */
export function mayContainEmoji(text: string): boolean {
  return MAYBE_EMOJI_RE.test(text);
}

export function twemojiUrl(emoji: string): string {
  const normalized = emoji.includes(ZWJ)
    ? emoji
    : emoji.replace(VARIATION_SELECTOR_16, "");
  const code = twemoji.convert.toCodePoint(normalized);
  return `${twemoji.base}${twemoji.size}/${code}${twemoji.ext}`;
}
