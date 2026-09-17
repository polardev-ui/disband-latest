import { mapAuthError } from "@/lib/authErrors";
import { getMfaWebAuthnConfig } from "@/lib/mfa-config";
import { getSupabaseClient } from "@/lib/supabase/client";
import { rateLimit } from "@/lib/rate-limit";
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

export interface MfaListResult {
  factors: MfaFactor[];
  error: string | null;
}

const TOTP_ISSUER = "Disband";

function supabase() {
  return getSupabaseClient();
}

function formatAuthError(error: { message?: string; status?: number } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  const msg = mapAuthError(error.message ?? fallback);
  if (error.status === 422) {
    return `${fallback} (Supabase rejected the request — check that Passkeys are enabled in your Supabase project under Authentication → MFA, and that the RP ID is set to ${getMfaWebAuthnConfig().rpId}.)`;
  }
  return msg;
}

export async function getMfaAssurance(): Promise<MfaAssurance> {
  const { data, error } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {

    return { currentLevel: null, nextLevel: null, mfaRequired: true };
  }
  const mfaRequired = data.currentLevel !== "aal2" && data.nextLevel === "aal2";
  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    mfaRequired,
  };
}

export async function listAllMfaFactors(): Promise<MfaListResult> {
  const { data, error } = await supabase().auth.mfa.listFactors();
  if (error) {
    return { factors: [], error: formatAuthError(error, "Could not load security methods.") };
  }
  return { factors: data?.all ?? [], error: null };
}

export async function listVerifiedMfaFactors(): Promise<MfaFactor[]> {
  const { factors } = await listAllMfaFactors();
  return factors.filter((factor) => factor.status === "verified");
}

async function cleanupUnverifiedFactors(): Promise<void> {
  const { factors } = await listAllMfaFactors();
  const pending = factors.filter((f) => f.status !== "verified");
  await Promise.allSettled(
    pending.map((f) => supabase().auth.mfa.unenroll({ factorId: f.id })),
  );
}

export async function startTotpEnrollment(friendlyName = "Authenticator app"): Promise<
  { data: TotpEnrollment; error: null } | { data: null; error: string }
> {
  await cleanupUnverifiedFactors();

  const { data, error } = await supabase().auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
    issuer: TOTP_ISSUER,
  });
  if (error || !data?.totp) {
    return { data: null, error: formatAuthError(error, "Could not start authenticator setup.") };
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
  const { data: challenge, error: challengeError } = await supabase().auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return formatAuthError(challengeError, "Could not verify authenticator setup.");
  }

  const { error: verifyError } = await supabase().auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (verifyError) return formatAuthError(verifyError, "Incorrect verification code.");

  await supabase().auth.refreshSession();
  return null;
}

export async function registerPasskeyFactor(friendlyName = "Passkey"): Promise<string | null> {
  const { originAllowed, appOrigin } = getMfaWebAuthnConfig();
  if (!originAllowed) {
    return `Passkeys can only be registered on ${appOrigin}. Open Disband in a browser to add a passkey.`;
  }

  await cleanupUnverifiedFactors();

  const { error } = await supabase().auth.mfa.webauthn.register({ friendlyName });
  if (error) return formatAuthError(error, "Could not register passkey.");
  await supabase().auth.refreshSession();
  return null;
}

export async function verifyTotpChallenge(factorId: string, code: string): Promise<string | null> {
  const { data: user } = await supabase().auth.getUser();
  const rateKey = `totp:${user?.user?.id ?? factorId}`;
  const limited = rateLimit(rateKey, 5, 30_000);
  if (!limited.allowed) {
    return "Too many attempts. Try again in 30 seconds.";
  }

  const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) return formatAuthError(error, "Incorrect authentication code.");
  await supabase().auth.refreshSession();
  return null;
}

export async function verifyPasskeyChallenge(factorId: string): Promise<string | null> {

  const { error } = await supabase().auth.mfa.webauthn.authenticate({ factorId });
  if (error) return formatAuthError(error, "Passkey verification failed. Try again or use your authenticator app.");
  await supabase().auth.refreshSession();
  return null;
}

export async function unenrollMfaFactor(factorId: string): Promise<string | null> {
  const { error } = await supabase().auth.mfa.unenroll({ factorId });
  if (error) return formatAuthError(error, "Could not remove security method.");
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
