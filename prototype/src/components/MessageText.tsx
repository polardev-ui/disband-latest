import { Fragment, type ReactNode } from "react";
import type { Person } from "../data/types";
import { ME } from "../data/seed";

// A deliberately small subset of Disband's markdown: **bold**, `code`,
// fenced code blocks, links, @mentions and #channel references.

interface Props {
  text: string;
  people: Record<string, Person>;
  onMention?: (personId: string, el: HTMLElement) => void;
  onChannel?: (name: string) => void;
}

function findPerson(people: Record<string, Person>, words: string[]): { person: Person; used: number } | null {
  const list = Object.values(people).filter((p) => !p.unavailable);
  if (words.length > 1) {
    const two = `${words[0]} ${words[1]}`.toLowerCase();
    const hit = list.find((p) => p.name.toLowerCase() === two);
    if (hit) return { person: hit, used: 2 };
  }
  const one = words[0].toLowerCase();
  const hit = list.find((p) => p.name.split(" ")[0].toLowerCase() === one || p.username === one);
  return hit ? { person: hit, used: 1 } : null;
}

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s)]+)|(@[A-Za-z][\w.]*(?: [A-Z][a-z]+)?)|(#[a-z][a-z0-9-]+)/g;

function inline(text: string, props: Props, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index!;
    let raw = m[0];
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={key} className="md-code">{raw.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{raw.slice(2, -2)}</strong>);
    else if (m[3]) {
      out.push(
        <a key={key} className="md-link" href={raw} target="_blank" rel="noreferrer noopener">
          {raw.replace(/^https?:\/\//, "")}
        </a>,
      );
    } else if (m[4]) {
      const words = raw.slice(1).split(" ");
      const found = findPerson(props.people, words);
      if (!found) {
        out.push(raw);
      } else {
        if (found.used === 1 && words.length > 1) raw = `@${words[0]}`;
        const mine = found.person.id === ME;
        const label = `@${found.used === 2 ? found.person.name : words[0]}`;
        out.push(
          props.onMention ? (
            <button key={key} type="button" className={`md-mention${mine ? " md-mention--me" : ""}`} onClick={(e) => props.onMention!(found.person.id, e.currentTarget)}>
              {label}
            </button>
          ) : (
            <span key={key} className={`md-mention${mine ? " md-mention--me" : ""}`}>{label}</span>
          ),
        );
      }
    } else if (m[5]) {
      out.push(
        props.onChannel ? (
          <button key={key} type="button" className="md-channel" onClick={() => props.onChannel!(raw.slice(1))}>
            {raw}
          </button>
        ) : (
          <span key={key} className="md-channel">{raw}</span>
        ),
      );
    }
    last = start + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MessageText(props: Props) {
  const parts = props.text.split(/```\n?([\s\S]*?)\n?```/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="md-pre"><code>{part}</code></pre>
        ) : part.trim() ? (
          <span key={i} className="md-p">{inline(part.replace(/^\n+|\n+$/g, ""), props, `t${i}`)}</span>
        ) : (
          <Fragment key={i} />
        ),
      )}
    </>
  );
}

/** Wraps case-insensitive matches of `query` in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  let idx = lower.indexOf(needle, from);
  while (idx !== -1) {
    if (idx > from) out.push(text.slice(from, idx));
    out.push(<mark key={idx}>{text.slice(idx, idx + q.length)}</mark>);
    from = idx + q.length;
    idx = lower.indexOf(needle, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return <>{out}</>;
}

/** A short excerpt centred on the first match, for search results. */
export function excerpt(text: string, query: string, radius = 48): string {
  const i = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (i < 0 || text.length <= radius * 2) return text;
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
