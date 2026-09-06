"use client";

import { useState } from "react";
import { ClaimAnimation } from "@/components/gift/ClaimAnimation";
import { SubscriptionMedallion, TIERS, tierForMonths, nextTier } from "@/components/gift/SubscriptionMedallion";

/**
 * A sandbox for the gifting flow.
 *
 * Nothing here touches Stripe or the database — it exists so the gift card,
 * the claim race and the launch animation can be judged before any of that is
 * built. Every control is deliberately exposed so each state can be reached
 * directly instead of waiting for the real conditions to occur.
 */

type Plan = "basic" | "super";

const LENGTHS = [1, 3, 6, 12, 24, 60, 120];

export default function GiftDemoPage() {
  const [plan, setPlan] = useState<Plan>("super");
  const [months, setMonths] = useState(3);
  const [claimed, setClaimed] = useState(false);
  const [playing, setPlaying] = useState(false);

  const accent = plan === "super" ? "#fee75c" : "#57f287";
  const planName = plan === "super" ? "Disband Super" : "Disband Basic";
  const tier = tierForMonths(months) ?? TIERS[0];
  const next = nextTier(months);

  return (
    <div className="min-h-screen bg-[#1e1f22] px-6 py-10 text-[#f2f3f5]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">Gifting sandbox</h1>
          <p className="mt-1 text-sm text-[#9aa0a6]">
            Not wired to Stripe or the database. Claim the gift below to see the launch.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* ---------------------------------------------- fake channel */}
          <section className="overflow-hidden rounded-xl border border-white/10 bg-[#313338]">
            <div className="border-b border-white/10 px-4 py-3 text-[15px] font-semibold">
              # general
            </div>

            <div className="space-y-5 p-4">
              <Message author="Marcus" colour="#f0a05a" time="Today at 4:12 PM"
                text="anyone else getting the 500 on upload or is it just me" />
              <Message author="Priya" colour="#7ec8a9" time="Today at 4:13 PM"
                text="works fine here — what size file?" />

              <div className="flex gap-3">
                <Avatar name="Josh" colour="#5865f2" />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[15px]">
                    <span className="font-semibold" style={{ color: "#5865f2" }}>Josh</span>
                    <span className="ml-2 text-[11px] text-[#9aa0a6]">Today at 4:15 PM</span>
                  </p>
                  <p className="mb-2 text-[15px] text-[#dbdee1]">
                    happy birthday, go wild 🎁
                  </p>

                  {/* the gift card */}
                  <div className="max-w-[420px] overflow-hidden rounded-lg border-l-4 bg-[#2b2d31]"
                    style={{ borderColor: accent }}>
                    <div className="flex items-center gap-3 px-4 pt-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                        style={{ background: `${accent}22`, color: accent }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="10" width="18" height="11" rx="1.8" />
                          <path d="M3 14.4h18M12 10v11" />
                          <path d="M12 10S10.6 5.4 8.2 5.4a2.3 2.3 0 0 0 0 4.6ZM12 10s1.4-4.6 3.8-4.6a2.3 2.3 0 0 1 0 4.6Z" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa0a6]">
                          A gift from Josh
                        </p>
                        <p className="truncate text-[15px] font-semibold">{planName}</p>
                        <p className="text-[13px] text-[#9aa0a6]">
                          {months} {months === 1 ? "month" : "months"} · first to claim it gets it
                        </p>
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-3">
                      {claimed ? (
                        <p className="flex items-center gap-2 text-[13px] font-medium" style={{ color: accent }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Claimed by you
                        </p>
                      ) : (
                        <button type="button" onClick={() => setPlaying(true)}
                          className="w-full rounded-lg py-2.5 text-[15px] font-semibold text-[#111] transition-opacity hover:opacity-90"
                          style={{ background: accent }}>
                          Claim
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Message author="Marcus" colour="#f0a05a" time="Today at 4:15 PM" text="wait no fair" />
            </div>
          </section>

          {/* ------------------------------------------------- controls */}
          <aside className="space-y-5">
            <Panel title="Plan">
              <div className="grid grid-cols-2 gap-2">
                {(["basic", "super"] as Plan[]).map((p) => (
                  <button key={p} type="button" onClick={() => setPlan(p)}
                    className={`rounded-lg border px-3 py-2 text-[13px] font-semibold capitalize transition-colors ${
                      plan === p ? "border-transparent text-[#111]" : "border-white/15 text-[#c3c8ce] hover:bg-white/5"
                    }`}
                    style={plan === p ? { background: p === "super" ? "#fee75c" : "#57f287" } : undefined}>
                    {p}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Length">
              <div className="grid grid-cols-4 gap-2">
                {LENGTHS.map((m) => (
                  <button key={m} type="button" onClick={() => setMonths(m)}
                    className={`rounded-lg border px-1 py-2 text-[12px] font-semibold transition-colors ${
                      months === m ? "border-brand bg-brand/20 text-white" : "border-white/15 text-[#c3c8ce] hover:bg-white/5"
                    }`}>
                    {m >= 12 ? `${m / 12}y` : `${m}m`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-[#9aa0a6]">
                Length drives the badge tier, so gift months count toward tenure.
              </p>
            </Panel>

            <Panel title="Badge it unlocks">
              <div className="flex items-center gap-3">
                <SubscriptionMedallion tier={tier} super={plan === "super"} size={72} />
                <div>
                  <p className="text-[15px] font-semibold">{tier.label}</p>
                  <p className="text-[12px] text-[#9aa0a6]">
                    {next
                      ? `${next.months - months} months to ${next.label}`
                      : "Highest tier"}
                  </p>
                </div>
              </div>
            </Panel>

            <button type="button" onClick={() => { setClaimed(false); setPlaying(false); }}
              className="w-full rounded-lg border border-white/15 py-2.5 text-[13px] font-semibold text-[#c3c8ce] transition-colors hover:bg-white/5">
              Reset gift
            </button>
            <button type="button" onClick={() => setPlaying(true)}
              className="w-full rounded-lg bg-brand py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90">
              Replay animation
            </button>
          </aside>
        </div>

        {/* every tier, for judging the ramp */}
        <section className="mt-10">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#9aa0a6]">
            All tiers — {plan}
          </h2>
          <div className="flex flex-wrap gap-6">
            {TIERS.map((t) => (
              <div key={t.key} className="text-center">
                <SubscriptionMedallion tier={t} super={plan === "super"} size={78} />
                <p className="mt-1 text-[13px] font-semibold">{t.label}</p>
                <p className="text-[11px] text-[#9aa0a6]">
                  {t.months >= 12 ? `${t.months / 12} year${t.months > 12 ? "s" : ""}` : `${t.months} months`}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {playing && (
        <ClaimAnimation
          plan={plan}
          months={months}
          fromName="Josh"
          onClose={() => { setPlaying(false); setClaimed(true); }}
        />
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#2b2d31] p-4">
      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[#9aa0a6]">{title}</p>
      {children}
    </div>
  );
}

function Avatar({ name, colour }: { name: string; colour: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white"
      style={{ background: colour }}>
      {name[0]}
    </span>
  );
}

function Message({ author, colour, time, text }: {
  author: string; colour: string; time: string; text: string;
}) {
  return (
    <div className="flex gap-3">
      <Avatar name={author} colour={colour} />
      <div className="min-w-0">
        <p className="mb-0.5 text-[15px]">
          <span className="font-semibold" style={{ color: colour }}>{author}</span>
          <span className="ml-2 text-[11px] text-[#9aa0a6]">{time}</span>
        </p>
        <p className="text-[15px] text-[#dbdee1]">{text}</p>
      </div>
    </div>
  );
}
