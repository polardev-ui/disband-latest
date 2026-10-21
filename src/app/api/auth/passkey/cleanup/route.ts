import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  deletePasskeyMfaRow,
  getBearerToken,
  getPasskeyMfaRow,
  listGoTrueFactors,
  listGoTruePasskeys,
  unenrollGoTrueFactor,
} from "@/lib/passkey-mfa.server";
import { HIDDEN_PASSKEY_TOTP_NAME } from "@/lib/passkey-mfa-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Removes the hidden TOTP factor after the last passkey has been deleted.
 * Refuses while any passkey remains, so the bridge cannot be pulled out from
 * under an account that still relies on it.
 */
export async function DELETE(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = rateLimit(`passkey-cleanup:${user.id}:${getClientIp(request)}`, 5, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  try {
    const row = await getPasskeyMfaRow(user.id);

    const passkeys = await listGoTruePasskeys(token);
    if (!passkeys.ok) {
      if (passkeys.status === 401) {
        return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
      }
      return NextResponse.json({ error: "Could not check your passkeys." }, { status: 502 });
    }
    if ((passkeys.data?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: "Remove every passkey before turning off passkey sign-in." },
        { status: 409 },
      );
    }

    const factors = await listGoTrueFactors(token);
    if (!factors.ok) {
      return NextResponse.json({ error: "Could not check the hidden factor." }, { status: 502 });
    }

    // Remove every hidden factor, including one whose database row was lost.
    // Without this an orphaned factor would still force AAL2 and could lock
    // the account out after its last passkey was deleted.
    const factorIds = new Set(
      (factors.data ?? [])
        .filter(
          (factor) =>
            factor.factor_type === "totp" &&
            factor.friendly_name === HIDDEN_PASSKEY_TOTP_NAME,
        )
        .map((factor) => factor.id),
    );
    if (row) factorIds.add(row.factor_id);

    if (!row && factorIds.size === 0) return NextResponse.json({ removed: false });

    for (const factorId of factorIds) {
      const removed = await unenrollGoTrueFactor(token, factorId);
      if (!removed.ok) {
        return NextResponse.json(
          { error: removed.error ?? "Could not remove the hidden factor." },
          { status: 502 },
        );
      }
    }

    if (row) await deletePasskeyMfaRow(user.id);
    return NextResponse.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not turn off passkey sign-in." }, { status: 500 });
  }
}
