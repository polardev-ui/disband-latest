import { mapAuthError } from "@/lib/authErrors";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Exchange auth tokens from a recovery or confirmation link in the URL. */
export async function recoverSessionFromUrl(): Promise<{ error: string | null }> {
  if (typeof window === "undefined") return { error: null };

  const supabase = getSupabaseClient();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { error: mapAuthError(error.message) };
    window.history.replaceState({}, "", url.pathname);
    return { error: null };
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (hash) {
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return { error: mapAuthError(error.message) };
      window.history.replaceState({}, "", url.pathname);
    }
  }

  return { error: null };
}
