import { NextResponse } from "next/server";
import { getServiceSupabase, getRouteUser } from "@/lib/supabase/server";
import { verifyAppStoreTransaction } from "@/lib/apple/verify";

const BUNDLE_ID = process.env.APPLE_BUNDLE_ID ?? "com.wsgpolar.disband";
const PRODUCT_ID_BASIC = process.env.APPLE_PRODUCT_ID_BASIC ?? "com.wsgpolar.disband.basic";
const PRODUCT_ID_SUPER = process.env.APPLE_PRODUCT_ID_SUPER ?? "com.wsgpolar.disband.super";

function productToPlan(productId: string): "basic" | "super" | null {
  if (productId === PRODUCT_ID_BASIC) return "basic";
  if (productId === PRODUCT_ID_SUPER) return "super";
  return null;
}

function toISOStringSafe(ms: number | undefined): string | null {
  if (!ms || typeof ms !== "number") return null;
  const date = new Date(ms);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Server-side receipt verification for Disband's Apple (StoreKit 2) in-app
 * subscriptions.
 *
 * The iOS app purchases a subscription and posts the store's *signed*
 * transaction (JWS) here. We verify the ES256 signature against Apple's public
 * keys, confirm the bundle, product and that it is an active auto-renewable
 * subscription, then write the result into `public.subscriptions` with
 * provider = 'apple' using the service role — mirroring the Stripe path.
 *
 * We deliberately do NOT rely on the client's claim about who it is; the user
 * is resolved server-side from the auth cookie / bearer token via getRouteUser.
 */
export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { signedTransaction } = (await req.json()) as { signedTransaction?: string };
    if (!signedTransaction || typeof signedTransaction !== "string") {
      return NextResponse.json({ error: "Missing signedTransaction" }, { status: 400 });
    }

    const txn = await verifyAppStoreTransaction(signedTransaction);
    if (!txn) {
      return NextResponse.json({ error: "Invalid transaction signature" }, { status: 400 });
    }

    if (txn.bundleId !== BUNDLE_ID) {
      return NextResponse.json({ error: "Transaction is not for this app" }, { status: 400 });
    }

    if (txn.type !== "Auto-RenewableSubscription") {
      return NextResponse.json({ error: "Not a subscription transaction" }, { status: 400 });
    }

    const plan = productToPlan(txn.productId);
    if (!plan) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    // A revoked transaction (refund / family-sharing removal) ends the grant.
    if (txn.revocationDate) {
      await upsertSubscription(
        user.id,
        plan,
        "canceled",
        txn.originalTransactionId,
        null, // ended / canceled => no current period end
        null,
      );
      return NextResponse.json({ ok: true, plan: "free" });
    }

    // Reject genuinely expired runs. Active/expiring transactions grant
    // "active"; an expiring one is still granted until it lapses (renewal is
    // Apple's job to bill, and the store starts a grace period for us).
    const now = Date.now();
    const status = txn.expiresDate && txn.expiresDate < now ? "canceled" : "active";
    const periodStart = toISOStringSafe(txn.signedDate);
    const periodEnd = txn.expiresDate ? toISOStringSafe(txn.expiresDate) : null;

    await upsertSubscription(
      user.id,
      plan,
      status,
      txn.originalTransactionId,
      periodEnd,
      periodStart,
    );

    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    console.error("Apple verify error:", err);
    return NextResponse.json({ error: "Failed to verify transaction" }, { status: 500 });
  }
}

async function upsertSubscription(
  userId: string,
  plan: "basic" | "super",
  status: string,
  originalTransactionId: string,
  currentPeriodEnd: string | null,
  currentPeriodStart: string | null,
) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: status === "canceled" ? "free" : plan,
      status,
      provider: "apple",
      apple_original_transaction_id: originalTransactionId,
      current_period_start: currentPeriodStart ?? new Date().toISOString(),
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
