"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { CURRENCY, EARN_RULES, LEDGER_LABELS, REWARDS, adReward, formatCurrency } from "@/lib/currency";
import { decorationItems } from "@/lib/shop";
import { confirmDialog } from "@/lib/dialogs";
import { SettingsSection } from "./SettingsPrimitives";
import { btn } from "@/components/modals/server-settings/ui";
import { AvatarDecoration } from "@/components/shop/AvatarDecoration";

interface Wallet { balance: number; lifetime: number; message_count: number }
interface LedgerRow { id: number; amount: number; reason: string; created_at: string }

/** The currency tab: balance, how to earn, what to spend it on, and history. */
export function CurrencyPanel() {
  const { user, profile } = useApp();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [adsReady, setAdsReady] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseClient();
    const [w, l, o] = await Promise.all([
      supabase.from("wallets").select("balance, lifetime, message_count").eq("user_id", user.id).maybeSingle(),
      supabase.from("wallet_ledger").select("id, amount, reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
      supabase.from("user_shop_items").select("item_id").eq("user_id", user.id),
    ]);
    setWallet((w.data as Wallet | null) ?? { balance: 0, lifetime: 0, message_count: 0 });
    setLedger((l.data as LedgerRow[] | null) ?? []);
    setOwned(new Set(((o.data ?? []) as { item_id: string }[]).map((r) => r.item_id)));
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void apiFetch("/api/rewards/ad/start", { method: "GET" })
      .then((r) => r.json())
      .then((j: { ready?: boolean }) => setAdsReady(!!j.ready))
      .catch(() => setAdsReady(false));
  }, []);

  const decorations = useMemo(() => decorationItems().filter((d) => !d.unreleased && !owned.has(d.id)), [owned]);
  const balance = wallet?.balance ?? 0;
  const toNextChat = 18 - ((wallet?.message_count ?? 0) % 18);

  async function redeem(rewardId: "aero_week" | "decoration") {
    const reward = REWARDS.find((r) => r.id === rewardId)!;
    if (rewardId === "decoration" && !pick) {
      setNote({ tone: "error", text: "Pick a decoration first." });
      return;
    }
    const ok = await confirmDialog({
      title: `Redeem ${reward.label}?`,
      body: `This spends ${formatCurrency(reward.cost)}.`,
      confirmLabel: "Redeem",
      tone: "primary",
    });
    if (!ok) return;
    setBusy(rewardId);
    setNote(null);
    const { error } = await getSupabaseClient().rpc("wallet_redeem", { p_reward: rewardId, p_item: rewardId === "decoration" ? pick : null });
    setBusy(null);
    if (error) setNote({ tone: "error", text: error.message });
    else {
      setNote({ tone: "ok", text: rewardId === "aero_week" ? "Aero is yours for the next seven days." : "Decoration added. Wear it from Profiles." });
      setPick("");
      void load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#5865f2] via-[#7b5cf0] to-[#c45cd6] p-6 text-white">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-white/75">Your {CURRENCY.plural}</p>
        <p className="mt-1 flex items-baseline gap-2 text-[40px] font-extrabold leading-none tabular-nums">
          <span aria-hidden>{CURRENCY.symbol}</span>{balance.toLocaleString("en-GB")}
        </p>
        <p className="mt-2 text-[13px] text-white/80">{(wallet?.lifetime ?? 0).toLocaleString("en-GB")} earned in total</p>
        <div className="mt-4 max-w-sm">
          <div className="flex justify-between text-[12px] text-white/80">
            <span>Next chat reward</span><span>{toNextChat} message{toNextChat === 1 ? "" : "s"} to go</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${((18 - toNextChat) / 18) * 100}%` }} />
          </div>
        </div>
      </div>

      {note && (
        <p role="status" className={`rounded-md px-3 py-2 text-[14px] ${note.tone === "ok" ? "bg-status-online/15 text-status-online" : "bg-status-dnd/15 text-status-dnd"}`}>{note.text}</p>
      )}

      <SettingsSection title="Spend" description={`Trade ${CURRENCY.plural} for perks.`}>
        <div className="divide-y divide-divider">
          {REWARDS.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-header-primary">{r.label}</p>
                <p className="text-[13px] text-text-muted">{r.description}</p>
                {r.id === "decoration" && (
                  <div role="radiogroup" aria-label="Decoration to redeem" className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                    {decorations.length === 0 && <p className="text-[13px] text-text-muted">You own every decoration already.</p>}
                    {decorations.map((d) => (
                      <button key={d.id} type="button" role="radio" aria-checked={pick === d.id} onClick={() => setPick(d.id)}
                        className={`group flex flex-col items-center gap-2 rounded-lg border-2 bg-bg-secondary px-2 pb-2 pt-4 transition-colors ${pick === d.id ? "border-brand" : "border-transparent hover:border-divider"}`}>
                        <span className="relative h-12 w-12">
                          {profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                          ) : (
                            <span className="block h-full w-full rounded-full bg-brand" />
                          )}
                          <AvatarDecoration itemId={d.id} />
                        </span>
                        <span className="w-full truncate text-center text-[12px] font-semibold text-header-primary">{d.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" disabled={balance < r.cost || busy !== null} onClick={() => void redeem(r.id)} className={btn.primary}>
                {busy === r.id ? "Redeeming…" : `${CURRENCY.symbol} ${r.cost}`}
              </button>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Watch an ad" description={`Video ads you choose to watch. The longer the ad, the more you earn: 35 seconds pays ${adReward(35)}, a minute pays ${adReward(60)}.`}>
        <div className="px-5 py-4">
          {adsReady ? (
            <a href="/rewards/ad" className={btn.primary}>Watch an ad</a>
          ) : (
            <p className="text-[14px] text-text-muted">{adsReady === null ? "Checking for ads…" : "Video ads are coming soon."}</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Ways to earn" description="Just use Disband. Rewards land automatically.">
        <ul className="divide-y divide-divider">
          {EARN_RULES.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-[15px] text-text-normal">{r.label}</p>
                <p className="text-[12px] text-text-muted">{r.limit}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-[#b9a4ff]">+{r.amount}</span>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Recent activity">
        {ledger.length === 0 ? (
          <p className="px-5 py-4 text-[14px] text-text-muted">Nothing yet. Send a few messages and it starts adding up.</p>
        ) : (
          <ul className="divide-y divide-divider">
            {ledger.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[14px]">
                <span className="text-text-normal">{LEDGER_LABELS[row.reason] ?? row.reason}</span>
                <span className="flex items-center gap-3">
                  <span className="text-[12px] text-text-muted">{new Date(row.created_at).toLocaleDateString()}</span>
                  <span className={`w-16 text-right font-semibold tabular-nums ${row.amount < 0 ? "text-status-dnd" : "text-status-online"}`}>
                    {row.amount > 0 ? "+" : ""}{row.amount}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
