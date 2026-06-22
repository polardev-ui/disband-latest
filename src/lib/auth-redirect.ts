/** Build an absolute redirect URL for Supabase auth emails. */
export function getAuthRedirectUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${normalized}`;
}
