import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  passkeyEncryptionConfigured,
  getBearerToken,
  getPasskeyMfaRow,
  listGoTrueFactors,
  listGoTruePasskeys,
} from "@/lib/passkey-mfa.server";
import { HIDDEN_PASSKEY_TOTP_NAME } from "@/lib/passkey-mfa-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns whether passkey 2FA is ready without exposing the hidden factor. */
export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = rateLimit(`passkey-status:${user.id}:${getClientIp(request)}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let row;
  try {
    row = await getPasskeyMfaRow(user.id);
  } catch {
    return NextResponse.json({ error: "Could not check passkey sign-in." }, { status: 500 });
  }

  const [passkeys, factors] = await Promise.all([
    listGoTruePasskeys(token),
    listGoTrueFactors(token),
  ]);
  if (!passkeys.ok) {
    if (passkeys.status === 401) {
      return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load your passkeys." }, { status: 502 });
  }
  if (!factors.ok) {
    if (factors.status === 401) {
      return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not check passkey sign-in." }, { status: 502 });
  }

  // A row on its own is not enough: the factor may have been removed outside
  // Disband. Only count the secret as configured while its hidden factor is
  // present and verified, so the UI can offer a repair instead of a broken
  // passkey button.
  const usableSecret = Boolean(
    row &&
      factors.data?.some(
        (factor) =>
          factor.id === row.factor_id &&
          factor.factor_type === "totp" &&
          factor.friendly_name === HIDDEN_PASSKEY_TOTP_NAME &&
          factor.status === "verified",
      ),
  );
  const passkeyCount = passkeys.data?.length ?? 0;
  return NextResponse.json(
    {
      serverReady: passkeyEncryptionConfigured(),
      secretConfigured: usableSecret,
      passkeyCount,
      ready: usableSecret && passkeyCount > 0,
      passkeys: (passkeys.data ?? []).map((passkey) => ({
        id: passkey.id,
        friendly_name: passkey.friendly_name ?? null,
        created_at: passkey.created_at,
        last_used_at: passkey.last_used_at ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
