"use client";

import { useEffect, useMemo, useState } from "react";
import { SubscriptionMedallion, tierForMonths, TIERS } from "./SubscriptionMedallion";
import { PLANS, type SubscriptionPlan } from "@/lib/subscription";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";

type Phase = "gift" | "reveal" | "done";

export interface ClaimAnimationProps {
  plan: Exclude<SubscriptionPlan, "free">;
  months: number;
  fromName: string;
  onClose: () => void;
}

/*
 The moment a gift is claimed.

 This used to be a rocket launch over a radial glow with star streaks and a
 shockwave ring — loud, and the bit people described as looking generated.
 It's now one short beat: the gift box lifts and opens, the tier medallion
 settles in, the perks fade up one by one, done. Flat background, no glow,
 and the same matte button as the rest of the app.
*/

function useGiftStyles() {
  useEffect(() => {
    const ID = "dg-claim-styles-v2";
    if (document.getElementById(ID)) return;
    const el = document.createElement("style");
    el.id = ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

export function ClaimAnimation({ plan, months, fromName, onClose }: ClaimAnimationProps) {
  useGiftStyles();
  const [phase, setPhase] = useState<Phase>("gift");
  const [litPerks, setLitPerks] = useState(0);
  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useOverlayDismiss(onClose, phase === "done");

  const accent = plan === "lite" ? "#7dd3fc" : "#fee75c";
  const planName = PLANS.find((p) => p.id === plan)?.name ?? "Disband Aero";
  const perks = useMemo(
    () => (PLANS.find((p) => p.id === plan)?.features ?? []).filter((f) => f.included).slice(0, 5),
    [plan],
  );
  const tier = tierForMonths(months) ?? TIERS[0];

  useEffect(() => {
    if (reduced) {
      setPhase("done");
      setLitPerks(perks.length);
      return;
    }
    const REVEAL_AT = 900;
    const timers: number[] = [window.setTimeout(() => setPhase("reveal"), REVEAL_AT)];
    perks.forEach((_, i) => timers.push(window.setTimeout(() => setLitPerks(i + 1), REVEAL_AT + 450 + i * 120)));
    timers.push(window.setTimeout(() => setPhase("done"), REVEAL_AT + 450 + perks.length * 120 + 200));
    return () => timers.forEach(clearTimeout);
  }, [reduced, perks]);

  return (
    <div className="dg2-overlay" role="dialog" aria-modal="true" aria-label={`${planName} activated`}>
      <div className="dg2-stage">
        {phase === "gift" ? (
          <div className="dg2-box" aria-hidden>
            <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke={accent}
              strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <g className="dg2-lid">
                <rect x="2.5" y="7" width="19" height="3.4" rx="1.2" />
                <path d="M12 7S10.6 2.6 8.2 2.6a2.2 2.2 0 0 0 0 4.4ZM12 7s1.4-4.4 3.8-4.4a2.2 2.2 0 0 1 0 4.4Z" />
              </g>
              <rect x="3.5" y="10.4" width="17" height="10.6" rx="1.6" />
              <path d="M12 10.4V21" />
            </svg>
          </div>
        ) : (
          <div className="dg2-reveal">
            <div className="dg2-medal">
              <SubscriptionMedallion tier={tier} super size={104} />
            </div>
            <p className="dg2-kicker">{fromName} gifted you</p>
            <h2 className="dg2-title" style={{ color: accent }}>{planName}</h2>
            <p className="dg2-sub">
              {months === 12 ? "1 year" : `${months} ${months === 1 ? "month" : "months"}`} added · {tier.label} badge unlocked
            </p>

            <ul className="dg2-perks">
              {perks.map((f, i) => (
                <li key={f.label} className={i < litPerks ? "is-lit" : ""}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="dg2-tick">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f.label}{f.detail ? <em> · {f.detail}</em> : null}</span>
                </li>
              ))}
            </ul>

            <button type="button" onClick={onClose} className={`dg2-btn ${phase === "done" ? "is-in" : ""}`}
              disabled={phase !== "done"}>
              Let&apos;s go
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.dg2-overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
  background:rgba(8,9,11,.96);animation:dg2-fade .25s ease both;padding:24px}
@keyframes dg2-fade{from{opacity:0}to{opacity:1}}
.dg2-stage{width:100%;max-width:380px;text-align:center}

.dg2-box{display:inline-block;animation:dg2-lift .9s cubic-bezier(.3,.7,.2,1) both}
@keyframes dg2-lift{0%{transform:translateY(12px);opacity:0}35%{transform:none;opacity:1}
  55%{transform:rotate(-4deg)}70%{transform:rotate(4deg)}85%{transform:none}100%{transform:scale(.96)}}
.dg2-lid{transform-box:fill-box;transform-origin:center bottom;animation:dg2-lid .9s ease-in both}
@keyframes dg2-lid{0%,75%{transform:none;opacity:1}100%{transform:translateY(-6px) rotate(-14deg);opacity:0}}

.dg2-reveal{display:flex;flex-direction:column;align-items:center}
.dg2-medal{animation:dg2-settle .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes dg2-settle{from{transform:scale(.82);opacity:0}to{transform:none;opacity:1}}
.dg2-kicker{margin:18px 0 0;font-size:13px;color:#8b909a;animation:dg2-up .4s .1s ease both}
.dg2-title{margin:4px 0 0;font-size:30px;font-weight:600;letter-spacing:-.025em;line-height:1.1;
  animation:dg2-up .4s .16s ease both}
.dg2-sub{margin:6px 0 0;font-size:14px;color:#c4c8cf;animation:dg2-up .4s .22s ease both}
@keyframes dg2-up{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}

.dg2-perks{list-style:none;margin:22px 0 0;padding:16px 0 0;width:100%;text-align:left;
  border-top:1px solid rgba(255,255,255,.08)}
.dg2-perks li{display:flex;gap:10px;align-items:flex-start;padding:5px 0;font-size:13.5px;color:#e6e7eb;
  opacity:0;transform:translateY(4px);transition:opacity .25s ease,transform .25s ease}
.dg2-perks li.is-lit{opacity:1;transform:none}
.dg2-perks em{font-style:normal;color:#8b909a}
.dg2-tick{flex:0 0 auto;margin-top:3px;color:#23a559}

.dg2-btn{margin:22px 0 0;width:100%;height:44px;border:0;border-radius:12px;background:#e6e7eb;color:#0b0c0e;
  font-size:14.5px;font-weight:600;cursor:pointer;opacity:0;transform:translateY(4px);
  transition:opacity .25s ease,transform .25s ease}
.dg2-btn.is-in{opacity:1;transform:none}
.dg2-btn:hover{opacity:.9}

@media (prefers-reduced-motion: reduce){
  .dg2-overlay,.dg2-box,.dg2-lid,.dg2-medal,.dg2-kicker,.dg2-title,.dg2-sub{animation:none}
  .dg2-perks li,.dg2-btn{opacity:1;transform:none;transition:none}
}
`;
