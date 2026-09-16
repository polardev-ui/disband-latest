/**
 * Making a member's own CSS safe to inject.
 *
 * Custom CSS only ever renders in the session of the person who wrote it, so
 * the usual "hostile author, innocent viewer" model does not apply. What does
 * apply is that a stylesheet is injected into a page as text: `</style>` in
 * the middle of it ends the element and everything after is parsed as HTML.
 * That is a real script-injection hole the moment the CSS reaches the page by
 * any route other than the author typing it — a synced row from another
 * device, a restored backup, a shared theme later on — so it is closed here
 * rather than assumed away.
 *
 * Everything removed is reported rather than silently dropped. Quietly
 * rewriting what someone wrote and showing them a result they did not ask for
 * is how a theme editor becomes impossible to debug.
 */

export interface SanitizedCss {
  css: string;
  /** Human-readable notes about anything that was taken out. */
  removed: string[];
}

/** Matches `</style`, however it is cased or spaced. */
const STYLE_CLOSE = /<\s*\/\s*style/gi;
/** `@import` pulls a whole stylesheet from elsewhere. */
const AT_IMPORT = /@import\b[^;]*;?/gi;
/** Legacy IE, but it executes script from a stylesheet. */
const EXPRESSION = /expression\s*\(/gi;
/** Any scheme in a url() that is not https or an inline data: image. */
const UNSAFE_URL =
  /url\(\s*(['"]?)\s*(?!https:|data:image\/|\/)([a-z][a-z0-9+.-]*:)[^)]*\1\s*\)/gi;
/** `<` and `>` have no meaning in CSS, so nothing legitimate is lost. */
const ANGLE_BRACKETS = /[<>]/g;

export const MAX_CUSTOM_CSS_BYTES = 100_000;

export function sanitizeCustomCss(input: string): SanitizedCss {
  const removed: string[] = [];
  let css = input ?? "";

  if (css.length > MAX_CUSTOM_CSS_BYTES) {
    css = css.slice(0, MAX_CUSTOM_CSS_BYTES);
    removed.push(`Truncated to ${MAX_CUSTOM_CSS_BYTES / 1000} KB.`);
  }

  if (AT_IMPORT.test(css)) {
    removed.push("@import rules (they load a stylesheet from another server).");
  }
  css = css.replace(AT_IMPORT, "");

  if (EXPRESSION.test(css)) {
    removed.push("expression() (it runs script from a stylesheet).");
  }
  css = css.replace(EXPRESSION, "(");

  if (UNSAFE_URL.test(css)) {
    removed.push("url() values that were not https:// or a data: image.");
  }
  css = css.replace(UNSAFE_URL, "url()");

  if (STYLE_CLOSE.test(css) || ANGLE_BRACKETS.test(css)) {
    removed.push("< and > characters (CSS has no use for them, and they can end the stylesheet early).");
  }
  css = css.replace(ANGLE_BRACKETS, "");

  // Each regex above is /g, so lastIndex has to be cleared or a second call
  // with the same pattern starts from wherever the previous one stopped.
  for (const re of [STYLE_CLOSE, AT_IMPORT, EXPRESSION, UNSAFE_URL, ANGLE_BRACKETS]) {
    re.lastIndex = 0;
  }

  return { css, removed };
}

/** Icon names are referenced from CSS, so they have to be plain identifiers. */
const ICON_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isValidIconName(name: string): boolean {
  return ICON_NAME.test(name);
}

/**
 * Turns uploaded icons into CSS variables the member's own CSS can reference:
 *
 *   --icon-send: url("https://cdn.disband.dev/...");
 *
 * Only https URLs are emitted. The name is checked against a strict pattern
 * rather than escaped, because a name is chosen from a text box and there is
 * no legitimate reason for one to contain anything else.
 */
export function iconVariables(icons: Record<string, string>): string {
  const lines: string[] = [];
  for (const [name, url] of Object.entries(icons ?? {})) {
    if (!isValidIconName(name)) continue;
    if (!/^https:\/\/[^"'()\s]+$/.test(url)) continue;
    lines.push(`  --icon-${name}: url("${url}");`);
  }
  return lines.length ? `:root {\n${lines.join("\n")}\n}` : "";
}

/** The full stylesheet text for a member's theme: icon variables, then their CSS. */
export function buildThemeStylesheet(
  customCss: string,
  icons: Record<string, string>,
): { css: string; removed: string[] } {
  const { css, removed } = sanitizeCustomCss(customCss);
  const vars = iconVariables(icons);
  return { css: [vars, css].filter(Boolean).join("\n\n"), removed };
}
