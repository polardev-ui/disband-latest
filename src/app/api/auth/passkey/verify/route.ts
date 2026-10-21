import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  consumePasskeySession,
  decryptPasskeySecret,
  getBearerToken,
  getPasskeyMfaRow,
  getSafeSession,
  passkeyEncryptionConfigured,
  validatePasskeySessions,
  verifyTotpWithToken,
} from "@/lib/passkey-mfa.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Elevates a passkey session to AAL2.
 *
 * Supabase passkey sign-in produces AAL1. The request carries the password
 * session (in the body) and the fresh passkey session (in the Authorization
 * header). Both are validated and must belong to the same account. Only then
 * does the server use the hidden TOTP secret to mint an AAL2 session.
 */
export async function POST(request: Request) {
  const passkeyToken = getBearerToken(request);
  if (!passkeyToken) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const passwordToken = typeof body.passwordToken === "string" ? body.passwordToken.trim() : "";
  if (!passwordToken || passwordToken.length > 16384) {
    return NextResponse.json({ error: "Your password sign-in has expired." }, { status: 401 });
  }

  const [passkeyUser, passwordUser] = await Promise.all([
    getUserFromToken(passkeyToken),
    getUserFromToken(passwordToken),
  ]);
  if (!passkeyUser || !passwordUser) {
    return NextResponse.json({ error: "Your sign-in has expired." }, { status: 401 });
  }

  const limit = rateLimit(
    `passkey-verify:${passkeyUser.id}:${getClientIp(request)}`,
    8,
    60_000,
  );
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const sessionProblem = validatePasskeySessions(
    passwordToken,
    passkeyToken,
    passwordUser.id,
    passkeyUser.id,
  );
  if (sessionProblem) {
    return NextResponse.json({ error: sessionProblem }, { status: 400 });
  }

  if (!passkeyEncryptionConfigured()) {
    return NextResponse.json(
      { error: "Passkey sign-in is not configured on this server yet." },
      { status: 503 },
    );
  }

  try {
    const row = await getPasskeyMfaRow(passkeyUser.id);
    if (!row) {
      return NextResponse.json(
        { error: "Passkey sign-in is not set up for this account. Use your authenticator app." },
        { status: 409 },
      );
    }

    if (!(await consumePasskeySession(passkeyUser.id, passkeyToken))) {
      return NextResponse.json({ error: "That passkey verification was already used. Use your passkey again." }, { status: 409 });
    }
    const secret = decryptPasskeySecret(row.secret_encrypted);
    const verified = await verifyTotpWithToken(passkeyToken, row.factor_id, secret);
    if (!verified.session) {
      return NextResponse.json(
        { error: "Could not complete passkey verification. Try again or use your authenticator app." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { session: getSafeSession(verified.session) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not complete passkey verification. Try again or use your authenticator app." },
      { status: 500 },
    );
  }
}
