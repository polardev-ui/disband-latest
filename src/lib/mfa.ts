import { mapAuthError } from "@/lib/authErrors";
import { apiFetch } from "@/lib/api";
import {
  HIDDEN_PASSKEY_TOTP_NAME,
  type PasskeyMfaStatus,
  type PasskeySummary,
} from "@/lib/passkey-mfa-shared";
import { getSupabaseClient, createPasskeyProbeClient, refreshSessionOnce } from "@/lib/supabase/client";
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

export interface PasskeyMfaState extends PasskeyMfaStatus {
  passkeys: PasskeySummary[];
}

export interface PasskeyListResult {
  passkeys: PasskeySummary[];
  error: string | null;
}

const TOTP_ISSUER = "Disband";

function supabase() {
  return getSupabaseClient();
}

function isManagedPasskeyFactor(factor: MfaFactor): boolean {
  return factor.factor_type === "totp" && factor.friendly_name === HIDDEN_PASSKEY_TOTP_NAME;
}

function formatAuthError(error: { message?: string; status?: number } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  const raw = error.message ?? fallback;
  if (/rp\s?id.*invalid.*domain|relying party.*domain/i.test(raw)) {
    return "This passkey is configured for a different domain. Open Disband at https://www.disband.dev to add it. Localhost testing needs a separate Auth project with its passkey domain set to localhost.";
  }
  if (/notallowed|cancelled|canceled|timed out|abort/i.test(raw)) {
    return "The passkey prompt was cancelled. Try again when you’re ready.";
  }
  if (/not supported|secure context|securityerror|insecure/i.test(raw)) {
    return "This browser or window can’t use passkeys. Open Disband in a secure browser window.";
  }
  return mapAuthError(raw);
}

async function authedApi<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { data: sessionData } = await supabase().auth.getSession();
  if (!sessionData.session) {
    return { data: null, error: "Sign in again.", status: 401 };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${sessionData.session.access_token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await apiFetch(path, { ...init, headers, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(15_000) });
  } catch {
    return { data: null, error: "Could not reach Disband. Check your connection and try again.", status: 0 };
  }

  if (response.status === 401 && retry) {
    const refreshed = await refreshSessionOnce();
    if ("session" in refreshed && refreshed.session) {
      return authedApi<T>(path, init, false);
    }
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    return {
      data: null,
      error: payload?.error ?? "Something went wrong. Please try again.",
      status: response.status,
    };
  }
  return { data: payload as T, error: null, status: response.status };
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

export async function getMfaAssurance(): Promise<MfaAssurance> {
  const { data, error } = await supabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    // A missing or unreadable assurance level must not lock a user out when
    // there is no verified second factor to challenge them with.
    const { factors } = await listAllMfaFactors().catch(() => ({ factors: [], error: null }));
    const hasVerified = (factors ?? []).some((factor) => factor.status === "verified");
    return { currentLevel: null, nextLevel: null, mfaRequired: hasVerified };
  }
  const mfaRequired = data.currentLevel !== "aal2" && data.nextLevel === "aal2";
  if (!mfaRequired) {
    return {
      currentLevel: data.currentLevel,
      nextLevel: data.nextLevel,
      mfaRequired: false,
    };
  }
  // Supabase can report AAL2 as the next level while the account has no
  // verified factor left (for example after a removed or orphaned factor).
  // In that case there is nothing to challenge, so do not trap the session
  // behind the MFA screen.
  const { factors } = await listAllMfaFactors().catch(() => ({ factors: [], error: null }));
  const hasVerified = (factors ?? []).some((factor) => factor.status === "verified");
  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    mfaRequired: hasVerified,
  };
}

export async function listAllMfaFactors(includeManaged = false): Promise<MfaListResult> {
  const { data, error } = await supabase().auth.mfa.listFactors();
  if (error) {
    return { factors: [], error: formatAuthError(error, "Could not load security methods.") };
  }
  const factors = data?.all ?? [];
  return {
    factors: includeManaged ? factors : factors.filter((factor) => !isManagedPasskeyFactor(factor)),
    error: null,
  };
}

export async function listVerifiedMfaFactors(): Promise<MfaFactor[]> {
  const { factors } = await listAllMfaFactors();
  return factors.filter((factor) => factor.status === "verified");
}

async function cleanupUnverifiedFactors(): Promise<void> {
  const { factors } = await listAllMfaFactors(true);
  const pending = factors.filter((f) => f.status !== "verified");
  await Promise.allSettled(
    pending.map((f) => supabase().auth.mfa.unenroll({ factorId: f.id })),
  );
}

async function cleanupManagedFactors(): Promise<void> {
  const { factors } = await listAllMfaFactors(true);
  const managed = factors.filter(isManagedPasskeyFactor);
  await Promise.allSettled(
    managed.map((factor) => supabase().auth.mfa.unenroll({ factorId: factor.id })),
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

export async function getPasskeyMfaStatus(): Promise<{
  data: PasskeyMfaState | null;
  error: string | null;
}> {
  const result = await authedApi<{
    serverReady?: boolean;
    secretConfigured?: boolean;
    passkeyCount?: number;
    ready?: boolean;
    passkeys?: PasskeySummary[];
  }>("/api/auth/passkey/status");

  if (result.error || !result.data) {
    return { data: null, error: result.error ?? "Could not load passkey sign-in." };
  }

  const passkeys = Array.isArray(result.data.passkeys) ? result.data.passkeys : [];
  return {
    data: {
      serverReady: result.data.serverReady === true,
      secretConfigured: Boolean(result.data.secretConfigured),
      passkeyCount: Number(result.data.passkeyCount ?? passkeys.length),
      ready: Boolean(result.data.ready),
      passkeys,
    },
    error: null,
  };
}

export async function listUserPasskeys(): Promise<PasskeyListResult> {
  const { data, error } = await supabase().auth.passkey.list();
  if (error) {
    return { passkeys: [], error: formatAuthError(error, "Could not load your passkeys.") };
  }
  return { passkeys: (data ?? []) as PasskeySummary[], error: null };
}

async function deletePasskeyQuietly(passkeyId: string): Promise<void> {
  await Promise.allSettled([supabase().auth.passkey.delete({ passkeyId })]);
}

/**
 * Adds a passkey and, on first use, the hidden TOTP factor the server uses to
 * elevate passkey sessions to AAL2. The passkey is deleted again if the bridge
 * cannot be created, so an account can never be left half-configured.
 */
export async function registerPasskeyMfa(): Promise<string | null> {
  if (!passkeysSupported()) {
    return "Passkeys need a secure browser window. Open Disband in your browser to add one.";
  }

  const readiness = await getPasskeyMfaStatus();
  if (readiness.error) return readiness.error;
  if (!readiness.data?.serverReady) return "Passkey setup is not available on this server yet. You can use an authenticator app.";

  let passkeyId: string;
  try {
    const { data: passkey, error } = await supabase().auth.registerPasskey();
    if (error || !passkey) {
      return formatAuthError(error, "Could not add a passkey.");
    }
    passkeyId = passkey.id;
  } catch (error) {
    return formatAuthError(error as { message?: string }, "Could not add a passkey.");
  }

  const status = await getPasskeyMfaStatus();
  if (status.error) {
    await deletePasskeyQuietly(passkeyId);
    return status.error;
  }

  if (status.data?.secretConfigured) {
    return null;
  }

  await cleanupManagedFactors();

  const { data: enrollment, error: enrollError } = await supabase().auth.mfa.enroll({
    factorType: "totp",
    friendlyName: HIDDEN_PASSKEY_TOTP_NAME,
    issuer: TOTP_ISSUER,
  });
  if (enrollError || !enrollment?.totp) {
    await deletePasskeyQuietly(passkeyId);
    return formatAuthError(enrollError, "Could not finish passkey setup.");
  }

  const stored = await authedApi<{
    configured?: boolean;
    existing?: boolean;
    session?: {
      access_token: string;
      refresh_token: string;
    };
  }>("/api/auth/passkey/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ factorId: enrollment.id, secret: enrollment.totp.secret }),
  });

  if (stored.error) {
    await Promise.allSettled([
      supabase().auth.mfa.unenroll({ factorId: enrollment.id }),
      deletePasskeyQuietly(passkeyId),
    ]);
    return stored.error;
  }

  if (stored.data?.session?.access_token && stored.data.session.refresh_token) {
    await supabase().auth.setSession({
      access_token: stored.data.session.access_token,
      refresh_token: stored.data.session.refresh_token,
    });
  } else {
    await supabase().auth.refreshSession();
  }
  return null;
}

export async function removePasskey(passkeyId: string): Promise<string | null> {
  const { error } = await supabase().auth.passkey.delete({ passkeyId });
  if (error) return formatAuthError(error, "Could not remove the passkey.");

  const remaining = await listUserPasskeys();
  if (remaining.error) {
    return "Passkey removed, but we couldn’t check whether passkey sign-in should be turned off. Try again.";
  }
  if (remaining.passkeys.length > 0) return null;

  const cleanup = await authedApi<{ removed?: boolean }>("/api/auth/passkey/cleanup", {
    method: "DELETE",
  });
  if (cleanup.error) {
    return `Passkey removed, but passkey sign-in could not be turned off: ${cleanup.error}`;
  }
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

/**
 * Uses a fresh passkey sign-in as the second factor.
 *
 * The passkey ceremony runs on a throwaway client so the password session is
 * untouched. The server then checks both sessions and returns an AAL2 session.
 */
export async function verifyPasskeyChallenge(): Promise<string | null> {
  if (!passkeysSupported()) {
    return "Passkeys need a secure browser window. Open Disband in your browser and try again.";
  }

  const { data: current } = await supabase().auth.getSession();
  const passwordSession = current.session;
  if (!passwordSession) return "Your sign-in has expired. Sign in again.";

  const probe = createPasskeyProbeClient();
  if (!probe) return "Passkeys are not configured for this build.";

  let passkeySession;
  try {
    const result = await probe.auth.signInWithPasskey();
    if (result.error || !result.data?.session) {
      return formatAuthError(result.error, "Passkey sign-in was cancelled.");
    }
    passkeySession = result.data.session;
  } catch (error) {
    return formatAuthError(error as { message?: string }, "Passkey sign-in was cancelled.");
  }

  if (passkeySession.user.id !== passwordSession.user.id) {
    return "That passkey belongs to a different account. Use the passkey for this account, or your authenticator app.";
  }

  let response: Response;
  try {
    response = await apiFetch("/api/auth/passkey/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${passkeySession.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ passwordToken: passwordSession.access_token }),
      cache: "no-store",
    });
  } catch {
    return "Could not reach Disband. Check your connection and try again.";
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        session?: { access_token?: string; refresh_token?: string };
      }
    | null;
  if (!response.ok || !payload?.session?.access_token || !payload.session.refresh_token) {
    return payload?.error ?? "Could not complete passkey verification. Try again or use your authenticator app.";
  }

  const { error: setError } = await supabase().auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  });
  if (setError) {
    return "Passkey verified, but the session could not be updated. Sign in again.";
  }
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
