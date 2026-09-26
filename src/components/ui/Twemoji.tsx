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

// A grapheme that should become an image: pictographic, or a keycap base
// (#, *, 0-9) glued to U+20E3, or a regional-indicator pair (flags —
// Intl segments them as one grapheme but Extended_Pictographic does not
// match them, so they need their own rule). Variation selectors and ZWJ
// ride along inside the segment.
const EMOJI_RE = /\p{Extended_Pictographic}|\u00a9|\u00ae|[\u2000-\u3300]/u;
const KEYCAP_RE = /^[#*0-9]\uFE0F?\u20E3$/;
const FLAG_RE = /^(?:\uD83C[\uDDE6-\uDDFF]){2}$/;

function isEmojiGrapheme(g: string): boolean {
  if (KEYCAP_RE.test(g) || FLAG_RE.test(g)) return true;
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
  if (!segmenter) return [text];
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

export function twemojiUrl(emoji: string): string {
  const normalized = emoji.includes(ZWJ)
    ? emoji
    : emoji.replace(VARIATION_SELECTOR_16, "");
  const code = twemoji.convert.toCodePoint(normalized);
  return `${twemoji.base}${twemoji.size}/${code}${twemoji.ext}`;
}
