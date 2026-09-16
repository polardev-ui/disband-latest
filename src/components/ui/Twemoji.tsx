"use client";

import { useEffect, useRef } from "react";
import twemoji from "@twemoji/api";

interface TwemojiProps {
  children: React.ReactNode;
  className?: string;
  options?: { size?: string; ext?: string };
}

export function Twemoji({ children, className, options }: TwemojiProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    twemoji.parse(el, {
      className: "twemoji",
      ...options,
    });
  });

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

const ZWJ = "\u200d";
const VARIATION_SELECTOR_16 = /\ufe0f/g;

/**
 * The asset URL for one emoji.
 *
 * Twemoji does not name its files after the raw codepoints: for a sequence
 * with no zero-width joiner it drops U+FE0F, the variation selector. So a
 * heart is `2764.svg`, not `2764-fe0f.svg`, and asking for the latter is a
 * 404 and a broken-image icon — which is exactly what a ❤️ reaction rendered
 * as. Sequences that *do* contain a ZWJ keep theirs (🏳️‍🌈 really is
 * `1f3f3-fe0f-200d-1f308`), so the selector cannot simply be stripped.
 *
 * `twemoji.parse()` applies this rule internally; it just is not exported,
 * and every caller that builds a URL by hand has to repeat it.
 */
export function twemojiUrl(emoji: string): string {
  const normalized = emoji.includes(ZWJ)
    ? emoji
    : emoji.replace(VARIATION_SELECTOR_16, "");
  const code = twemoji.convert.toCodePoint(normalized);
  return `${twemoji.base}${twemoji.size}/${code}${twemoji.ext}`;
}
