import rawMessages from "./messages.json";

export const LANGUAGE_STORAGE_KEY = "disband:language";

export const LANGUAGES = [
  { code: "en", nativeName: "English", englishName: "English", docsPath: "" },
  { code: "es", nativeName: "Español", englishName: "Spanish", docsPath: "es" },
  { code: "fr", nativeName: "Français", englishName: "French", docsPath: "fr" },
  { code: "de", nativeName: "Deutsch", englishName: "German", docsPath: "de" },
  { code: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)", docsPath: "pt-br" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", docsPath: "ja" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", docsPath: "ko" },
  { code: "zh-CN", nativeName: "简体中文", englishName: "Chinese (Simplified)", docsPath: "zh-cn" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const messages = rawMessages as Record<string, Record<string, string>>;

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGES.some((language) => language.code === value);
}

export function getStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguageCode(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

export function languageFor(code: LanguageCode) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

export function translate(
  language: LanguageCode,
  source: string,
  variables?: Record<string, string | number>,
): string {
  const template = messages[language]?.[source] ?? messages.en[source] ?? source;
  if (!variables) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : placeholder,
  );
}

export function formatNotificationTime(language: LanguageCode, iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return translate(language, "Earlier");
  }
  const diff = then - Date.now();
  const absolute = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  try {
    const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    if (absolute < minute) return relative.format(0, "second");
    if (absolute < hour) return relative.format(Math.round(diff / minute), "minute");
    if (absolute < day) return relative.format(Math.round(diff / hour), "hour");
    if (absolute < 7 * day) return relative.format(Math.round(diff / day), "day");
    return new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(then);
  } catch {
    return new Date(then).toLocaleDateString();
  }
}
