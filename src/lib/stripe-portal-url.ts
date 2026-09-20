export function stripePortalDestination(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== "https://billing.stripe.com" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
