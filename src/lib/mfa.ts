import { mapAuthError } from "@/lib/authErrors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Factor } from "@supabase/supabase-js";

export type MfaFactor = Factor;

export interface MfaAssurance {
  currentLevel: string | null;
  nextLevel: string | null;
  mfaRequired: boolean;
}

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

function supabase() {
  return getSupabaseClient();
}

export async function getMfaAssurance(): Promise<MfaAssurance> {
  const { data, error } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    return { currentLevel: null, nextLevel: null, mfaRequired: false };
  }
  const mfaRequired = data.currentLevel !== "aal2" && data.nextLevel === "aal2";
  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    mfaRequired,
  };
}

export async function listVerifiedMfaFactors(): Promise<MfaFactor[]> {
  const { data, error } = await supabase().auth.mfa.listFactors();
  if (error || !data) return [];
  return [
    ...(data.totp ?? []),
    ...(data.webauthn ?? []),
    ...(data.phone ?? []),
  ].filter((factor) => factor.status === "verified");
}

export async function listAllMfaFactors(): Promise<MfaFactor[]> {
  const { data, error } = await supabase().auth.mfa.listFactors();
  if (error || !data) return [];
  return data.all ?? [];
}

export async function startTotpEnrollment(friendlyName = "Authenticator app"): Promise<
  { data: TotpEnrollment; error: null } | { data: null; error: string }
> {
  const { data, error } = await supabase().auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error || !data?.totp) {
    return { data: null, error: mapAuthError(error?.message ?? "Could not start authenticator setup.") };
  }
  return {
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    },
    error: null,
  };
}

export async function completeTotpEnrollment(factorId: string, code: string): Promise<string | null> {
  const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) return mapAuthError(error.message);
  await supabase().auth.refreshSession();
  return null;
}

export async function registerPasskeyFactor(friendlyName = "Passkey"): Promise<string | null> {
  const { error } = await supabase().auth.mfa.webauthn.register({ friendlyName });
  if (error) return mapAuthError(error.message);
  await supabase().auth.refreshSession();
  return null;
}

export async function verifyTotpChallenge(factorId: string, code: string): Promise<string | null> {
  const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) return mapAuthError(error.message);
  await supabase().auth.refreshSession();
  return null;
}

export async function verifyPasskeyChallenge(factorId: string): Promise<string | null> {
  const { error } = await supabase().auth.mfa.webauthn.authenticate({ factorId });
  if (error) return mapAuthError(error.message);
  await supabase().auth.refreshSession();
  return null;
}

export async function unenrollMfaFactor(factorId: string): Promise<string | null> {
  const { error } = await supabase().auth.mfa.unenroll({ factorId });
  if (error) return mapAuthError(error.message);
  await supabase().auth.refreshSession();
  return null;
}

export function totpQrSrc(qrCode: string): string {
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
}

export function factorLabel(factor: MfaFactor): string {
  if (factor.friendly_name?.trim()) return factor.friendly_name;
  if (factor.factor_type === "totp") return "Authenticator app";
  if (factor.factor_type === "webauthn") return "Passkey";
  if (factor.factor_type === "phone") return "Phone";
  return "Security key";
}
