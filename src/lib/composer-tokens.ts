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
