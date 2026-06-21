/** True for phone / tablet user agents (not desktop browsers). */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();

  // Tablets and phones
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(userAgent)) return true;
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/i.test(ua)) {
    return true;
  }
  return false;
}

export function isMobileGateDisabled(): boolean {
  if (process.env.DISABLE_MOBILE_GATE === "true") return true;
  if (process.env.NEXT_PUBLIC_DISABLE_MOBILE_GATE === "true") return true;
  return false;
}
