

export interface SanitizedCss {
  css: string;

  removed: string[];
}

const STYLE_CLOSE = /<\s*\/\s*style/gi;

const AT_IMPORT = /@import\b[^;]*;?/gi;

const EXPRESSION = /expression\s*\(/gi;

const UNSAFE_URL =
  /url\(\s*(['"]?)\s*(?!https:|data:image\/|\/)([a-z][a-z0-9+.-]*:)[^)]*\1\s*\)/gi;

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

  for (const re of [STYLE_CLOSE, AT_IMPORT, EXPRESSION, UNSAFE_URL, ANGLE_BRACKETS]) {
    re.lastIndex = 0;
  }

  return { css, removed };
}

const ICON_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isValidIconName(name: string): boolean {
  return ICON_NAME.test(name);
}

export function iconVariables(icons: Record<string, string>): string {
  const lines: string[] = [];
  for (const [name, url] of Object.entries(icons ?? {})) {
    if (!isValidIconName(name)) continue;
    if (!/^https:\/\/[^"'()\s]+$/.test(url)) continue;
    lines.push(`  --icon-${name}: url("${url}");`);
  }
  return lines.length ? `:root {\n${lines.join("\n")}\n}` : "";
}

export function buildThemeStylesheet(
  customCss: string,
  icons: Record<string, string>,
): { css: string; removed: string[] } {
  const { css, removed } = sanitizeCustomCss(customCss);
  const vars = iconVariables(icons);
  return { css: [vars, css].filter(Boolean).join("\n\n"), removed };
}
