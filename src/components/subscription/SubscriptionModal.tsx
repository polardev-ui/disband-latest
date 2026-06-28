"use client";

import { useCallback, useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { PLANS, type PlanTier } from "@/lib/subscription";
import { IconClose } from "@/components/icons";
import { StripeEmbeddedCheckout } from "./StripeEmbeddedCheckout";

interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
}

function PlanCard({ plan, currentPlan, onSubscribe }: {
  plan: PlanTier;
  currentPlan: string;
  onSubscribe: (id: "basic" | "super") => void;
}) {
  if (plan.id === "free") return null;

  const isCurrentPlan = currentPlan === plan.id;
  const priceDollars = (plan.monthlyPrice / 100).toFixed(2);

  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        plan.highlighted
          ? "border-[#fee75c]/50 bg-[#fee75c]/5 shadow-lg shadow-[#fee75c]/10"
          : "border-divider bg-bg-secondary"
      }`}
    >
      <div className="mb-4">
        <h3 className="text-lg font-bold">{plan.name}</h3>
        <p className="mt-1 text-3xl font-bold">
          ${priceDollars}
          <span className="text-sm font-normal text-text-muted"> / month</span>
        </p>
      </div>

      <div className="mb-6 flex-1 space-y-2">
        {plan.features.map((f) => (
          <div key={f.label} className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#57f287]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <span className="text-sm text-text-normal">{f.label}</span>
              {f.detail && <span className="ml-1 text-xs text-text-muted">— {f.detail}</span>}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={isCurrentPlan}
        onClick={() => onSubscribe(plan.id as "basic" | "super")}
        className={`w-full rounded-lg py-2.5 text-sm font-bold transition-opacity ${
          isCurrentPlan
            ? "bg-bg-accent text-text-muted cursor-not-allowed"
            : plan.highlighted
              ? "bg-[#fee75c] text-black hover:opacity-90"
              : "bg-brand text-white hover:opacity-90"
        }`}
      >
        {isCurrentPlan ? "Current Plan" : "Subscribe"}
      </button>
    </div>
  );
}

function MobileNotice() {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <p className="text-lg font-bold">Mobile Not Supported</p>
      <p className="text-sm text-text-muted">
        In-app purchases are not available on mobile. Please visit Disband from a desktop web browser to manage your subscription.
      </p>
    </div>
  );
}

function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function SubscriptionModal({ open, onClose, userId }: SubscriptionModalProps) {
  const { plan, loading, startCheckout, subscription, openPortal } = useSubscription(userId);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const mobile = isMobileBrowser();

  const handleSubscribe = useCallback(async (planId: "basic" | "super") => {
    setCheckoutError(null);
    const result = await startCheckout(planId);
    if (result && (result.startsWith("cs_") || result.startsWith("seti_"))) {
      setCheckoutClientSecret(result);
    } else if (result) {
      setCheckoutError(result);
    }
  }, [startCheckout]);

  const handleCheckoutSuccess = useCallback(() => {
    setCheckoutClientSecret(null);
    onClose();
  }, [onClose]);

  const handleCheckoutCancel = useCallback(() => {
    setCheckoutClientSecret(null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl bg-bg-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-divider px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">Disband Subscriptions</h2>
            {!checkoutClientSecret && subscription?.status === "active" && (
              <p className="text-sm text-text-muted">
                You&apos;re on the <span className="font-semibold text-text-normal capitalize">{plan}</span> plan
                {subscription.current_period_end && (
                  <> — renews {new Date(subscription.current_period_end).toLocaleDateString()}</>
                )}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-normal">
            <IconClose size={20} />
          </button>
        </div>

        {mobile ? (
          <MobileNotice />
        ) : checkoutClientSecret ? (
          <StripeEmbeddedCheckout
            clientSecret={checkoutClientSecret}
            onSuccess={handleCheckoutSuccess}
            onCancel={handleCheckoutCancel}
          />
        ) : loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        ) : (
          <>
            {checkoutError && (
              <div className="px-6 pt-4">
                <p className="text-sm text-status-dnd">{checkoutError}</p>
              </div>
            )}
            <div className="grid gap-4 p-6 md:grid-cols-2">
              <PlanCard
                plan={PLANS.find((p) => p.id === "basic")!}
                currentPlan={plan}
                onSubscribe={handleSubscribe}
              />
              <PlanCard
                plan={PLANS.find((p) => p.id === "super")!}
                currentPlan={plan}
                onSubscribe={handleSubscribe}
              />
            </div>

            {subscription?.stripe_customer_id && (
              <div className="border-t border-divider px-6 py-4">
                <button
                  type="button"
                  onClick={() => void openPortal()}
                  className="text-sm text-brand hover:underline"
                >
                  Manage billing & subscription
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
