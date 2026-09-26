"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Live markdown styling for the composer.
 *
 * A `<textarea>` cannot style its own content, so this renders the same text
 * into a layer sitting exactly behind a transparent textarea. The two must
 * agree on every metric that affects wrapping — font, size, line-height,
 * padding, letter-spacing, whitespace handling — or the caret drifts away
 * from the glyphs. `COMPOSER_TEXT_CLASS` is shared by both for that reason;
 * change it in one place only.
 *
 * Markers stay visible and dimmed rather than disappearing, which is what
 * Discord does: the text you are editing is still the text you typed, so the
 * caret never lands somewhere that does not exist.
 *
 * Nothing here changes font-size or font-family, including for code. A
 * different face or size changes glyph widths, and the caret then sits a
 * little further from its character on every subsequent column of that line.
 * Code is tinted rather than set in monospace for exactly that reason —
 * Discord can use monospace because its composer is a contenteditable where
 * the caret follows the real glyphs.
 *
 * Headings deliberately do NOT change size. Enlarging a line while it is
 * being typed reflows the composer under the cursor.
 */

/** Shared by the overlay and the textarea. Must stay identical. */
export const COMPOSER_TEXT_CLASS =
  "w-full resize-none bg-transparent text-[15px] leading-[22px] tracking-normal";

const MARKER = "text-text-muted/60";

/** Inline rules, applied in order — longest markers first so ** beats *. */
const INLINE: { re: RegExp; render: (inner: ReactNode, marker: string, key: string) => ReactNode }[] = [
  {
    re: /\|\|([\s\S]+?)\|\|/,
    render: (inner, m, k) => (
      <Fragment key={k}>
        <span className={MARKER}>{m}</span>
        <span className="rounded bg-text-muted/25 text-text-normal">{inner}</span>
        <span className={MARKER}>{m}</span>
      </Fragment>
    ),
  },
  {
    re: /\*\*\*([\s\S]+?)\*\*\*/,
    render: (inner, m, k) => wrap(k, m, <strong className="font-bold italic">{inner}</strong>),
  },
  {
    re: /\*\*([\s\S]+?)\*\*/,
    render: (inner, m, k) => wrap(k, m, <strong className="font-bold">{inner}</strong>),
  },
  {
    re: /__([\s\S]+?)__/,
    render: (inner, m, k) => wrap(k, m, <span className="underline">{inner}</span>),
  },
  {
    re: /~~([\s\S]+?)~~/,
    render: (inner, m, k) => wrap(k, m, <span className="line-through">{inner}</span>),
  },
  {
    re: /\*([\s\S]+?)\*/,
    render: (inner, m, k) => wrap(k, m, <em className="italic">{inner}</em>),
  },
  {
    re: /_([\s\S]+?)_/,
    render: (inner, m, k) => wrap(k, m, <em className="italic">{inner}</em>),
  },
];

function wrap(key: string, marker: string, body: ReactNode): ReactNode {
  return (
    <Fragment key={key}>
      <span className={MARKER}>{marker}</span>
      {body}
      <span className={MARKER}>{marker}</span>
    </Fragment>
  );
}

/** Inline code is matched before everything else so `**x**` inside stays literal. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    const code = /`([^`\n]+)`/.exec(rest);
    let best: { index: number; length: number; node: ReactNode } | null = null;

    if (code) {
      best = {
        index: code.index,
        length: code[0].length,
        node: (
          <Fragment key={`${keyBase}-c${n}`}>
            <span className={MARKER}>`</span>
            <span className="rounded bg-bg-accent text-[#e6b673]">{code[1]}</span>
            <span className={MARKER}>`</span>
          </Fragment>
        ),
      };
    }

    for (const rule of INLINE) {
      const m = rule.re.exec(rest);
      if (!m) continue;
      // Earliest match wins; ties go to the rule listed first, which is how
      // ** beats * on the same position.
      if (best && m.index >= best.index) continue;
      const marker = m[0].slice(0, m[0].indexOf(m[1]));
      best = {
        index: m.index,
        length: m[0].length,
        node: rule.render(renderInline(m[1], `${keyBase}-${n}i`), marker, `${keyBase}-${n}`),
      };
    }

    if (!best) {
      out.push(rest);
      break;
    }
    if (best.index > 0) out.push(rest.slice(0, best.index));
    out.push(best.node);
    rest = rest.slice(best.index + best.length);
    n++;
  }

  return out;
}

export function ComposerMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let inFence = false;
  let fenceLang = "";

  lines.forEach((line, i) => {
    const key = `l${i}`;
    const fence = /^```(\w*)\s*$/.exec(line);

    if (fence) {
      inFence = !inFence;
      fenceLang = inFence ? fence[1] : "";
      out.push(
        <div key={key}>
          <span className={MARKER}>```</span>
          {fence[1] && <span className="text-text-muted">{fence[1]}</span>}
        </div>,
      );
      return;
    }

    if (inFence) {
      out.push(
        <div key={key} className="text-[#9cdcfe]">
          {line || "​"}
        </div>,
      );
      return;
    }

    // Block prefixes keep their marker and tint the rest of the line.
    const quote = /^(>>> |> )/.exec(line);
    if (quote) {
      return void out.push(
        <div key={key} className="border-l-2 border-text-muted/50 pl-2">
          <span className={MARKER}>{quote[1]}</span>
          {renderInline(line.slice(quote[1].length), key)}
        </div>,
      );
    }

    const small = /^-# /.exec(line);
    if (small) {
      return void out.push(
        <div key={key} className="text-text-muted">
          <span className={MARKER}>-# </span>
          {renderInline(line.slice(3), key)}
        </div>,
      );
    }

    // Headings are marked but not resized — see the note at the top.
    const heading = /^(#{1,3}) /.exec(line);
    if (heading) {
      return void out.push(
        <div key={key}>
          <span className={MARKER}>{heading[1]} </span>
          <span className="font-semibold">{renderInline(line.slice(heading[0].length), key)}</span>
        </div>,
      );
    }

    out.push(<div key={key}>{line ? renderInline(line, key) : "​"}</div>);
  });

  // A trailing newline needs a line box or the overlay ends one row short of
  // the textarea and the last line sits over the wrong text.
  if (text.endsWith("\n")) out.push(<div key="tail">{"​"}</div>);
  void fenceLang;

  return <>{out}</>;
}
