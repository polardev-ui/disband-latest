/**
 * Atomic @everyone tokens for the composer.
 *
 * The token is all-or-nothing: any edit touching any part of it removes the
 * whole thing, and characters can never be edited inside it. Works off the
 * text diff (not key events), so backspace, select-and-type, cut, paste-over,
 * drag-drop, IME and mobile keyboards all behave identically. Returns null
 * when the edit misses every token.
 */

/** Case-insensitive, like every other @everyone check in the app. */
export const EVERYONE_TOKEN_RE = /@everyone\b/gi;

export function everyoneSpans(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = new RegExp(EVERYONE_TOKEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push([m.index, m.index + m[0].length]);
  return out;
}

export function applyAtomicEveryone(
  prev: string,
  next: string,
): { text: string; cursor: number } | null {
  let a = 0;
  while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
  let prevEnd = prev.length;
  const nextEnd0 = next.length;
  let nextEnd = nextEnd0;
  while (prevEnd > a && nextEnd > a && prev[prevEnd - 1] === next[nextEnd - 1]) {
    prevEnd--;
    nextEnd--;
  }
  const inserted = next.slice(a, nextEnd);
  const cuts = everyoneSpans(prev)
    .filter(([s, e]) => a < e && s < prevEnd)
    .sort((p, q) => p[0] - q[0]);
  if (cuts.length === 0) return null;
  let prevCut = "";
  let last = 0;
  for (const [s, e] of cuts) {
    prevCut += prev.slice(last, s);
    last = e;
  }
  prevCut += prev.slice(last);
  const shift = (x: number) => {
    let d = 0;
    for (const [s, e] of cuts) d += Math.max(0, Math.min(x, e) - s);
    return x - d;
  };
  const a2 = shift(a);
  const final = prevCut.slice(0, a2) + inserted + prevCut.slice(shift(prevEnd));
  return { text: final, cursor: a2 + inserted.length };
}

/**
 * A member picked from the @ list. The composer shows `label` ("@Tev", their
 * display name) while the message is sent with `@username` ("@5e"), which is
 * what actually pings. Offsets are into the composer text.
 */
export interface MentionSpan {
  start: number;
  end: number;
  label: string;
  username: string;
}

/**
 * The general form of applyAtomicEveryone: @everyone and picked mentions are
 * both all-or-nothing. An edit touching any part of a token removes the
 * whole token; tokens the edit misses move with the text around them.
 * `cursor` is null when nothing was cut, so the browser's own caret stands.
 */
export function applyAtomicEdit(
  prev: string,
  next: string,
  spans: MentionSpan[],
): { text: string; cursor: number | null; spans: MentionSpan[] } {
  let a = 0;
  while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (prevEnd > a && nextEnd > a && prev[prevEnd - 1] === next[nextEnd - 1]) {
    prevEnd--;
    nextEnd--;
  }
  const inserted = next.slice(a, nextEnd);
  const hits = (s: number, e: number) => a < e && s < prevEnd;

  const cuts = [
    ...everyoneSpans(prev).filter(([s, e]) => hits(s, e)),
    ...spans.filter((m) => hits(m.start, m.end)).map((m) => [m.start, m.end] as [number, number]),
  ].sort((p, q) => p[0] - q[0]);

  const shift = (x: number) => {
    let d = 0;
    for (const [s, e] of cuts) d += Math.max(0, Math.min(x, e) - s);
    return x - d;
  };
  const a2 = shift(a);
  // Where text after the edit lands: past the (possibly cut) head plus the
  // inserted run.
  const moveTail = (x: number) => shift(x) - shift(prevEnd) + a2 + inserted.length;

  let text = next;
  if (cuts.length > 0) {
    let prevCut = "";
    let last = 0;
    for (const [s, e] of cuts) {
      prevCut += prev.slice(last, s);
      last = e;
    }
    prevCut += prev.slice(last);
    text = prevCut.slice(0, a2) + inserted + prevCut.slice(shift(prevEnd));
  }

  const kept: MentionSpan[] = [];
  for (const m of spans) {
    if (hits(m.start, m.end)) continue;
    const moved =
      m.end <= a
        ? { ...m, start: shift(m.start), end: shift(m.end) }
        : { ...m, start: moveTail(m.start), end: moveTail(m.end) };
    // Belt and braces: a span whose text no longer reads as its label is
    // dropped rather than sending a ping the user can't see.
    if (text.slice(moved.start, moved.end) === moved.label) kept.push(moved);
  }

  return { text, cursor: cuts.length > 0 ? a2 + inserted.length : null, spans: kept };
}

/** The text to send: each picked mention's label swapped for @username. */
export function resolveMentionSpans(text: string, spans: MentionSpan[]): string {
  let out = text;
  for (const m of [...spans].sort((p, q) => q.start - p.start)) {
    if (out.slice(m.start, m.end) !== m.label) continue;
    out = out.slice(0, m.start) + `@${m.username}` + out.slice(m.end);
  }
  return out;
}
