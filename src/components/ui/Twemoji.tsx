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

export function twemojiUrl(emoji: string): string {
  const code = twemoji.convert.toCodePoint(emoji);
  return `${twemoji.base}${twemoji.size}/${code}${twemoji.ext}`;
}
