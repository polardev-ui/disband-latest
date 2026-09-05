"use client";

import { isValidMentionToken } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import type { ReactNode } from "react";

// A small, dependency-free renderer that turns a chat message into React
// nodes, supporting Discord-style markdown: code blocks, inline code, headers,
// bold, italics, underline, strikethrough, plus the existing @mentions and URLs.
//
// It renders React elements (not raw HTML) so user content is never injected
// as unescaped HTML — plain text is always escaped by React automatically.

type Token = string;

const INLINE_RE =
  /(@[a-zA-Z0-9_]{2,32}|`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|__[^_\n]+__|_[^_\n]+_|~~[^~\n]+~~|https?:\/\/[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'"`])/;

function linkFor(url: string): string {
  return url;
}

function renderInlineTokens(
  text: string,
  members: Profile[],
  keyPrefix: number,
  onMentionClick?: (profile: Profile) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = keyPrefix;

  while (rest.length) {
    const m = rest.match(INLINE_RE);
    if (!m || m.index === undefined) {
      if (rest) out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    rest = rest.slice(m.index + token.length);
    const key = k++;

    if (token.startsWith("@")) {
      const uname = token.slice(1);
      if (!isValidMentionToken(uname, members)) {
        out.push(token);
        continue;
      }
      const user = members.find((x) => x.username?.toLowerCase() === uname.toLowerCase());
      const label = user?.username ?? (uname.toLowerCase() === "everyone" ? "everyone" : uname);
      const chipClass = "rounded bg-brand/20 px-0.5 font-medium text-[#dee0fc] hover:bg-brand/40";

      // A mention naming a real person opens their profile. It looked
      // clickable — tinted and with a hover state — but was inert, so tapping
      // a name did nothing. @everyone stays plain text: it names no one.
      if (user && onMentionClick) {
        out.push(
          <button
            key={key}
            type="button"
            className={`${chipClass} cursor-pointer`}
            onClick={(e) => {
              e.stopPropagation();
              onMentionClick(user);
            }}
          >
            @{label}
          </button>,
        );
      } else {
        out.push(
          <span key={key} className={chipClass}>
            @{label}
          </span>,
        );
      }
      continue;
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded bg-bg-accent px-1.5 py-0.5 font-mono text-[0.875em] text-text-normal"
        >
          {token.slice(1, -1)}
        </code>,
      );
      continue;
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
      continue;
    }

    if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
      continue;
    }

    if (token.startsWith("__") && token.endsWith("__") && token.length > 4) {
      out.push(
        <span key={key} className="underline">
          {token.slice(2, -2)}
        </span>,
      );
      continue;
    }

    if (token.startsWith("_") && token.endsWith("_") && token.length > 2) {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
      continue;
    }

    if (token.startsWith("~~") && token.endsWith("~~") && token.length > 4) {
      out.push(
        <s key={key} className="line-through text-text-muted">
          {token.slice(2, -2)}
        </s>,
      );
      continue;
    }

    if (/^https?:\/\//i.test(token)) {
      out.push(
        <a
          key={key}
          href={linkFor(token)}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-brand hover:underline"
        >
          {token}
        </a>,
      );
      continue;
    }

    out.push(token);
  }

  return out;
}

function headerLevel(line: string): number {
  const m = line.match(/^(#{1,3})\s+(.*)$/);
  if (!m) return 0;
  return m[1].length;
}

export function renderMarkdown(
  content: string,
  members: Profile[] = [],
  onMentionClick?: (profile: Profile) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  let k = 0;

  // Split into [text, lang, code] triples. Capture groups land on indexes 1-3
  // of each match, so text is on i%4==0, lang on i%4==1, code on i%4==2.
  const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
  const segments = content.split(fenceRe);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === undefined) continue;

    if (i % 4 === 0) {
      // Plain text (may contain inline markdown, headers, multi-line).
      emitText(seg);
    } else if (i % 4 === 1) {
      // language tag — handled on the code segment; ignore.
    } else if (i % 4 === 2) {
      // fenced code block body
      out.push(
        <pre
          key={k++}
          className="my-1.5 overflow-x-auto rounded-md bg-bg-accent p-3 font-mono text-[13px] leading-relaxed text-text-normal"
        >
          <code className={segments[i - 1] ? `language-${segments[i - 1]}` : ""}>{seg}</code>
        </pre>,
      );
    }
  }

  function emitText(text: string) {
    if (!text) return;
    const renderedLines: ReactNode[] = [];
    let lineBuf: string[] = [];

    const flush = () => {
      if (lineBuf.length === 0) return;
      renderedLines.push(
        <span key={k++} className="whitespace-pre-wrap break-words">
          {renderInlineTokens(lineBuf.join("\n"), members, k * 100, onMentionClick)}
        </span>,
      );
      lineBuf = [];
    };

    for (const line of text.split("\n")) {
      const hl = headerLevel(line);
      if (hl > 0) {
        flush();
        renderedLines.push(
          <span key={k++} className="block font-semibold text-text-normal">
            {renderInlineTokens(line.slice(hl + 1).trimStart(), members, k * 100, onMentionClick)}
          </span>,
        );
      } else {
        lineBuf.push(line);
      }
    }
    flush();
    out.push(...renderedLines);
  }

  if (out.length === 0) return [content];
  return out;
}
