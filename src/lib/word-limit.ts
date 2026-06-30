export const MAX_MESSAGE_CHARS_FREE = 2000;
export const MAX_MESSAGE_CHARS_PAID = 4000;
export const MAX_BIO_LENGTH_FREE = 190;
export const MAX_BIO_LENGTH_PAID = 230;

export function messageCharLimitError(text: string, maxChars: number): string | null {
  if (text.length > maxChars) {
    return `Messages cannot exceed ${maxChars} characters (${text.length}/${maxChars}).`;
  }
  return null;
}

export function bioLengthError(bio: string, maxLength: number): string | null {
  if (bio.length > maxLength) {
    return `Bio cannot exceed ${maxLength} characters (${bio.length}/${maxLength}).`;
  }
  return null;
}
