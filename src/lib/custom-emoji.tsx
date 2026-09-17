"use client";

import { safeImageUrl } from "@/lib/safe-url";

export type CustomEmojiSegment =
  | { kind: "text"; text: string }
  | { kind: "emoji"; name: string; url: string };

const TOKEN_RE = /:([a-z0-9_]{2,32}):/g;

export function splitCustomEmojiSegments(
  text: string,
  map: Record<string, string> | undefined | null,
): CustomEmojiSegment[] {
  if (!text || !map) return [{ kind: "text", text }];
  const out: CustomEmojiSegment[] = [];

  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1 || !part) {
      if (part) out.push({ kind: "text", text: part });
      continue;
    }
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(part))) {
      const url = map[m[1]];
      if (!url) continue;
      if (m.index > last) out.push({ kind: "text", text: part.slice(last, m.index) });
      out.push({ kind: "emoji", name: m[1], url });
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push({ kind: "text", text: part.slice(last) });
  }
  return out.filter((s) => (s.kind === "text" ? s.text.length > 0 : true));
}

export function isSingleCustomEmoji(
  text: string,
  map: Record<string, string> | undefined | null,
): { name: string; url: string } | null {
  if (!map) return null;
  const segs = splitCustomEmojiSegments(text.trim(), map);
  if (segs.length === 1 && segs[0].kind === "emoji") return segs[0];
  return null;
}

export function CustomEmojiImg({ name, url, size = "1.4em" }: { name: string; url: string; size?: string }) {
  const src = safeImageUrl(url);
  if (!src) return <span>{`:${name}:`}</span>;
  return (
    <img
      src={src}
      alt={`:${name}:`}
      title={`:${name}:`}
      draggable={false}
      loading="lazy"
      className="custom-emoji inline-block select-text align-[-0.2em]"
      style={{ height: size, width: size }}
    />
  );
}
