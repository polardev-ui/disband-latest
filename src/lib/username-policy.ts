/** Blocked username substrings (alphanumeric only, case-insensitive). Keep in sync with DB migration. */
export const BLOCKED_USERNAME_WORDS = [
  "nigger",
  "nigga",
  "benjaminnetanyahu",
  "childporn",
  "racist",
  "hitler",
  "faggot",
  "fag",
  "kike",
  "chink",
  "spic",
  "wetback",
  "pedophile",
  "pedo",
  "nazi",
  "nazis",
  "holocaust",
  "terrorist",
  "isis",
  "rape",
  "rapist",
  "incest",
  "bestiality",
  "loli",
  "lolicon",
  "shota",
  "shotacon",
] as const;

export function normalizeUsernameCheck(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function usernameContainsBlockedWord(username: string): boolean {
  const clean = normalizeUsernameCheck(username);
  if (!clean) return false;
  if (clean === "cp" || (clean.includes("cp") && clean.length <= 4)) return true;
  return BLOCKED_USERNAME_WORDS.some((word) => clean.includes(word));
}

export function usernameFormatError(username: string): string | null {
  const norm = username.trim().toLowerCase();
  if (!norm) return "Enter a username";
  if (!/^[a-z0-9_]{2,25}$/.test(norm)) {
    return "Use 2–25 letters, numbers, or underscores";
  }
  if (usernameContainsBlockedWord(norm)) {
    return "That username is not allowed";
  }
  return null;
}
