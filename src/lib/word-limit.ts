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
