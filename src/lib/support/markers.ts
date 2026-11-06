/** Added to a Tether support reply to show the wrong-email form under it. Never shown as text. */
export const EMAIL_FIX_FORM_MARKER = "[[form:email-fix]]";

export function hasEmailFixForm(content: string): boolean {
  return content.includes(EMAIL_FIX_FORM_MARKER);
}

export function stripSupportMarkers(content: string): string {
  return content.split(EMAIL_FIX_FORM_MARKER).join("").trimEnd();
}
