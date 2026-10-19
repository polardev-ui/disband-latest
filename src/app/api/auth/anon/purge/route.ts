import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireTurnstile } from "@/lib/turnstile";
import { isValidAccountNumber, normalizeAccountNumber } from "@/lib/anon-accounts";
import { findAnonByNumber, purgeAnonymousAccount } from "@/lib/anon-accounts.server";

export const dynamic = "force-dynamic";

/**
 * Permanently purge an anonymous account on the owner's request ("deny the
 * data copy"). Deletes the auth user — cascading to the profile, messages,
 * reactions, memberships, notes, favourites and everything else — and keeps the
 * registry row so the number can still report the account as expired.
 *
 * The UI shows an explicit confirmation before calling this.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`anon-purge:${ip}`, 6, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: { number?: string; turnstileToken?: string };
  try {
    body = (await request.json()) as { number?: string; turnstileToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Fail closed: no token, a bad token, a token from another form, or a
  // server without the secret all stop here (see requireTurnstile).
  const blocked = await requireTurnstile(body.turnstileToken, { action: "anon-purge" });
  if (blocked) return blocked;

  if (!body.number || !isValidAccountNumber(body.number)) {
    return NextResponse.json({ error: "Enter your 16-digit account number." }, { status: 400 });
  }

  const record = await findAnonByNumber(normalizeAccountNumber(body.number));
  if (!record) {
    return NextResponse.json(
      { error: "That account number wasn't found. Check it and try again." },
      { status: 401 },
    );
  }

  if (record.data_purged_at != null) {
    return NextResponse.json({ ok: true, purged: true });
  }

  const ok = await purgeAnonymousAccount(record, "user_declined");
  if (!ok) {
    return NextResponse.json({ error: "Could not purge the account. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, purged: true });
}
