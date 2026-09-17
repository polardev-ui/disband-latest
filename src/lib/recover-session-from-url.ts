import type { EmailOtpType } from "@supabase/supabase-js";
import { mapAuthError } from "@/lib/authErrors";
import { getSupabaseClient } from "@/lib/supabase/client";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "email_change", "recovery", "invite", "magiclink"];

function otpType(raw: string | null): EmailOtpType {
  return OTP_TYPES.includes(raw as EmailOtpType) ? (raw as EmailOtpType) : "email";
}

export function isPasswordResetLink(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const queryType = url.searchParams.get("type");
  if (queryType === "recovery") {
    return url.searchParams.has("token_hash")
      || url.searchParams.has("token")
      || url.searchParams.has("code");
  }
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  return hash.get("type") === "recovery" && hash.has("access_token") && hash.has("refresh_token");
}

export async function recoverSessionFromUrl(): Promise<{ error: string | null }> {
  if (typeof window === "undefined") return { error: null };

  const supabase = getSupabaseClient();
  const url = new URL(window.location.href);

  const urlError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (urlError) return { error: mapAuthError(urlError) };

  const tokenHash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType(url.searchParams.get("type")),
    });
    if (error) return { error: mapAuthError(error.message) };
    window.history.replaceState({}, "", url.pathname);
    return { error: null };
  }

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
