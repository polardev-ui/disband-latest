"use client";

import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";

/**
 * A fenced code block in a sent message: highlighted, with the language
 * showing and a copy button in the corner.
 *
 * The language comes from the fence (```ts), which is what people already
 * type. An unknown or absent language still renders — highlighting is a
 * bonus on top of monospaced text, never a requirement for it.
 */
export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  // Prism's grammar names differ from what people type at the fence.
  const lang = ALIASES[language.toLowerCase()] ?? language.toLowerCase() ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied (insecure origin, or the user said no). Leave the
      // button alone rather than claiming a copy that did not happen.
    }
  };

  return (
    <div className="group/code relative my-1.5">
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-2">
        {language && (
          <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {language}
          </span>
        )}
        <button
          type="button"
          onClick={() => void copy()}
          // Hidden until the block is hovered or the button is focused, so it
          // does not sit on top of the code while you are reading.
          className="pointer-events-auto rounded bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-text-muted opacity-0 transition-opacity hover:text-text-normal focus:opacity-100 group-hover/code:opacity-100"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <Highlight code={code.replace(/\n$/, "")} language={lang} theme={themes.vsDark}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} overflow-x-auto rounded-md p-3 font-mono text-[13px] leading-relaxed`}
            // The theme brings its own background, which is what makes the
            // highlighting legible regardless of the app's current theme.
            style={{ ...style, background: "var(--bg-accent)" }}
          >
            <code>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, j) => (
                    <span key={j} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}

/** Fence spellings people actually use, mapped to Prism's grammar names. */
const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  golang: "go",
  kt: "kotlin",
  html: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
};
