"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * A single line that fades out on the right when it doesn't fit, instead of
 * being clipped mid-letter. The fade only appears while it overflows, so
 * text that fits is drawn exactly as before. Works with gradient names
 * (background-clip: text): the fade is a mask over whatever is drawn.
 */
export function FadeText({
  children,
  className = "",
  style,
  title,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.scrollWidth > el.clientWidth + 1) el.setAttribute("data-overflow", "");
      else el.removeAttribute("data-overflow");
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    // The contents changing size (a badge loading in) matters too.
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  });

  return (
    <span ref={ref} className={`fade-text ${className}`} style={style} title={title}>
      {children}
    </span>
  );
}
