"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/shop";
import { PROMOTION_PLANS } from "@/lib/promotions";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import { SettingsSection, btn } from "./ui";
import type { SectionProps } from "./types";

/** Pay to sit at the top of Discover. Days stack after any current run. */
export function PromoteSection({ server }: SectionProps) {
  const [days, setDays] = useState(3);
  const [until, setUntil] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    void getSupabaseClient().rpc("server_promoted_until", { p_server: server.id }).then(({ data }) => setUntil((data as string | null) ?? null));
  useEffect(refresh, [server.id]);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/stripe/create-promotion-checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server_id: server.id, days }),
    });
    const json = (await res.json()) as { clientSecret?: string; error?: string };
    setBusy(false);
    if (!json.clientSecret) setError(json.error ?? "Couldn't start checkout.");
    else setSecret(json.clientSecret);
  }

  return (
    <div className="space-y-6 pb-10">
      <SettingsSection title="Promote on Discover" description="Promoted spaces sit at the top of Discover with a Promoted label, for as long as you pay for.">
        <div className="space-y-4 px-5 py-4">
          {until && (
            <p className="rounded-md bg-status-online/15 px-3 py-2 text-[14px] text-status-online">
              Promoted until {new Date(until).toLocaleString()}. Buying more adds days after that.
            </p>
          )}
          {!server.discoverable && (
            <p className="rounded-md bg-status-idle/15 px-3 py-2 text-[14px] text-status-idle">Turn on Discover in Overview first, so people can find the space.</p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Promotion length">
            {PROMOTION_PLANS.map((p) => (
              <button key={p.days} type="button" role="radio" aria-checked={days === p.days} onClick={() => setDays(p.days)}
                className={`rounded-lg border px-3 py-3 text-left transition-colors ${days === p.days ? "border-brand bg-brand/15" : "border-divider hover:bg-interactive-hover"}`}>
                <span className="block text-[14px] font-semibold text-header-primary">{p.label}</span>
                <span className="block text-[13px] text-text-muted">{formatPrice(p.cents)}</span>
              </button>
            ))}
          </div>
          {error && <p className="text-[14px] text-status-dnd">{error}</p>}
          {secret ? (
            <StripeEmbeddedCheckout clientSecret={secret} onSuccess={() => { setSecret(null); setTimeout(refresh, 2500); }} onCancel={() => setSecret(null)} />
          ) : (
            <button type="button" className={btn.primary} disabled={busy || !server.discoverable} onClick={() => void start()}>
              {busy ? "Starting…" : `Promote for ${PROMOTION_PLANS.find((p) => p.days === days)?.label} · ${formatPrice(PROMOTION_PLANS.find((p) => p.days === days)?.cents ?? 0)}`}
            </button>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
