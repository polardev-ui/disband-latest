export const MAX_MESSAGE_WORDS = 500;
export const MAX_BIO_LENGTH = 120;

export function countWords(text: string): number {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

export function messageWordLimitError(text: string): string | null {
  const words = countWords(text);
  if (words > MAX_MESSAGE_WORDS) {
    return `Messages cannot exceed ${MAX_MESSAGE_WORDS} words (currently ${words}).`;
  }
  return null;
}

export function bioLengthError(bio: string): string | null {
  if (bio.length > MAX_BIO_LENGTH) {
    return `Bio cannot exceed ${MAX_BIO_LENGTH} characters (${bio.length}/${MAX_BIO_LENGTH}).`;
  }
  return null;
}
