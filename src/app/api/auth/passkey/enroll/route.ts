import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  encryptPasskeySecret,
  getBearerToken,
  getPasskeyMfaRow,
  getSafeSession,
  listGoTrueFactors,
  listGoTruePasskeys,
  passkeyEncryptionConfigured,
  savePasskeyMfaRow,
  unenrollGoTrueFactor,
  validatePasskeyEnrollmentFactor,
  verifyTotpWithToken,
} from "@/lib/passkey-mfa.server";
import { HIDDEN_PASSKEY_TOTP_NAME } from "@/lib/passkey-mfa-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stores the secret of the hidden TOTP factor after proving the factor and the
 * passkey belong to the caller. The secret is encrypted with PASSKEY_MFA_KEY
 * and is never returned.
 */
export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = rateLimit(`passkey-enroll:${user.id}:${getClientIp(request)}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const factorId = typeof body.factorId === "string" ? body.factorId.trim() : "";
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  if (factorId && !UUID_RE.test(factorId)) {
    return NextResponse.json({ error: "The hidden verification factor is invalid." }, { status: 400 });
  }
  if (secret.length > 256) {
    return NextResponse.json({ error: "The verification secret is too long." }, { status: 400 });
  }

  if (!passkeyEncryptionConfigured()) {
    return NextResponse.json(
      { error: "Passkey sign-in is not configured on this server yet." },
      { status: 503 },
    );
  }

  try {
    const existing = await getPasskeyMfaRow(user.id);

    if (!factorId || !secret) {
      return NextResponse.json({ error: "The hidden verification factor is missing." }, { status: 400 });
    }

    const [passkeys, factors] = await Promise.all([
      listGoTruePasskeys(token),
      listGoTrueFactors(token),
    ]);
    if (!passkeys.ok) {
      return NextResponse.json({ error: "Could not check your passkeys." }, { status: 502 });
    }
    if (!factors.ok) {
      return NextResponse.json({ error: "Could not check the verification factor." }, { status: 502 });
    }

    // A retry can leave a freshly created, unverified factor behind. If the
    // stored factor is still valid, keep it and discard the new one. If the
    // stored factor was removed outside Disband, fall through and replace it.
    const existingFactor = existing
      ? factors.data?.find(
          (factor) =>
            factor.id === existing.factor_id &&
            factor.factor_type === "totp" &&
            factor.friendly_name === HIDDEN_PASSKEY_TOTP_NAME &&
            factor.status === "verified",
        )
      : null;
    const factorProblem = validatePasskeyEnrollmentFactor(factors.data ?? [], factorId);
    if (factorProblem) return NextResponse.json({ error: factorProblem }, { status: 400 });

    if (existing && existingFactor) {
      const supplied = factors.data?.find((factor) => factor.id === factorId);
      if (factorId !== existing.factor_id && supplied?.status === "unverified") await unenrollGoTrueFactor(token, factorId);
      return NextResponse.json({ configured: true, existing: true });
    }

    if ((passkeys.data?.length ?? 0) === 0) {
      // Registration can be readable a fraction before the passkey row is
      // committed. Give it one short retry before rejecting the setup.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const retried = await listGoTruePasskeys(token);
      if (!retried.ok || (retried.data?.length ?? 0) === 0) {
        return NextResponse.json({ error: "Add a passkey first." }, { status: 400 });
      }
    }

    const verified = await verifyTotpWithToken(token, factorId, secret);
    if (!verified.session) {
      await unenrollGoTrueFactor(token, factorId);
      return NextResponse.json(
        { error: verified.error ?? "Could not verify the hidden factor." },
        { status: 400 },
      );
    }

    try {
      await savePasskeyMfaRow(user.id, factorId, encryptPasskeySecret(secret));
    } catch {
      await unenrollGoTrueFactor(token, factorId);
      return NextResponse.json({ error: "Could not save passkey sign-in." }, { status: 500 });
    }

    return NextResponse.json(
      { configured: true, session: getSafeSession(verified.session) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Could not save passkey sign-in." }, { status: 500 });
  }
}
