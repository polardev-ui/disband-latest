"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getStripe } from "@/lib/stripe-client";
import { ENTITLEMENTS, type SubscriptionPlan, type Subscription } from "@/lib/subscription";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useSubscription(userId: string | undefined) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await getSupabaseClient()
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();
    setSubscription(data as Subscription | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = getSupabaseClient()
      .channel("subscription-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<Subscription>) => {
          if (payload.eventType === "DELETE") {
            setSubscription(null);
          } else {
            setSubscription(payload.new as Subscription);
          }
        },
      )
      .subscribe();
    return () => { void getSupabaseClient().removeChannel(channel); };
  }, [userId]);

  const plan: SubscriptionPlan = subscription?.status === "active" ? (subscription.plan as SubscriptionPlan) : "free";
  const entitlements = ENTITLEMENTS[plan];

  const startCheckout = useCallback(async (planId: "basic" | "super"): Promise<string | null> => {
    const res = await fetch("/api/stripe/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    const json = (await res.json()) as { clientSecret?: string; error?: string };
    return json.clientSecret ?? json.error ?? null;
  }, []);

  const openPortal = useCallback(async () => {
    const res = await fetch("/api/stripe/portal");
    const json = (await res.json()) as { url?: string; error?: string };
    if (json.url) {
      window.location.href = json.url;
    }
    return json.error ?? null;
  }, []);

  return { subscription, plan, entitlements, loading, startCheckout, openPortal, reload: load };
}
