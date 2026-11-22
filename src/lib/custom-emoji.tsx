"use client";

import { safeImageUrl } from "@/lib/safe-url";
import { getEmoji, isEmojiMissing, useExpressions } from "@/lib/expressions";

/*
 Custom emoji in message text. Two forms:
   <:name:id> / <a:name:id>  any space's emoji, usable in every chat (looked up by id)
   :name:                    older messages: the current space's emoji, by name
*/

export type CustomEmojiSegment =
  | { kind: "text"; text: string }
  | { kind: "emoji"; name: string; url: string; id?: string };

const TOKEN_RE = /<a?:([a-zA-Z0-9_]{2,32}):(\d+)>|:([a-z0-9_]{2,32}):/g;

export function splitCustomEmojiSegments(
  text: string,
  map: Record<string, string> | undefined | null,
): CustomEmojiSegment[] {
  if (!text) return [{ kind: "text", text }];
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
      let seg: CustomEmojiSegment | null = null;
      if (m[2]) {
        seg = { kind: "emoji", name: m[1], url: "", id: m[2] };
      } else if (map && map[m[3]]) {
        seg = { kind: "emoji", name: m[3], url: map[m[3]] };
      }
      if (!seg) continue;
      if (m.index > last) out.push({ kind: "text", text: part.slice(last, m.index) });
      out.push(seg);
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push({ kind: "text", text: part.slice(last) });
  }
  return out.filter((s) => (s.kind === "text" ? s.text.length > 0 : true));
}

export function isSingleCustomEmoji(
  text: string,
  map: Record<string, string> | undefined | null,
): { name: string; url: string; id?: string } | null {
  const segs = splitCustomEmojiSegments(text.trim(), map);
  if (segs.length === 1 && segs[0].kind === "emoji") return segs[0];
  return null;
}

export function CustomEmojiImg({
  name,
  url,
  id,
  size = "1.4em",
}: {
  name: string;
  url: string;
  id?: string;
  size?: string;
}) {
  // Subscribes so an emoji looked up by id appears once it arrives.
  useExpressions();
  const resolved = id ? getEmoji(id) : null;
  const src = safeImageUrl(resolved?.url ?? url);
  if (!src) {
    // Still looking it up: hold the space. Gone for good: its name.
    if (id && !isEmojiMissing(id)) {
      return <span aria-label={`:${name}:`} className="inline-block align-[-0.2em]" style={{ height: size, width: size }} />;
    }
    return <span>{`:${name}:`}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`:${name}:`}
      title={`:${name}:`}
      draggable={false}
      loading="lazy"
      data-emoji-name={name}
      data-emoji-id={id ?? undefined}
      data-emoji-server={resolved?.serverId ?? undefined}
      className="custom-emoji inline-block cursor-pointer select-text align-[-0.2em]"
      style={{ height: size, width: size }}
    />
  );
}
