"use client";

import { useEffect, useMemo, useState } from "react";
import { Rocket } from "./Rocket";
import { SubscriptionMedallion, tierForMonths, TIERS } from "./SubscriptionMedallion";
import { PLANS, type SubscriptionPlan } from "@/lib/subscription";

/**
 * What a claim looks like: the gift bursts, a rocket carries it up, the perks
 * light up one by one on the way, and the tier medallion lands at the top.
 *
 * Anyone who has asked not to see motion gets the same information as a
 * straight statement of what they were given, with no movement at all.
 */

type Phase = "gift" | "launch" | "perks" | "done";

export interface ClaimAnimationProps {
  plan: Exclude<SubscriptionPlan, "free">;
  months: number;
  fromName: string;
  onClose: () => void;
}

/**
 * Installs the keyframes once, into the document head.
 *
 * They cannot live in the render output: this component re-renders on every
 * phase change and once per perk lighting up, and a re-inserted <style>
 * restarts every CSS animation that depends on it — which left the rocket
 * relaunching from the bottom six times over and never clearing the screen.
 */
function useGiftStyles() {
  useEffect(() => {
    const ID = "dg-claim-styles";
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
    () => typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const accent = "#fee75c";
  const planName = "Disband Aero";
  const perks = useMemo(
    () => (PLANS.find((p) => p.id === plan)?.features ?? []).filter((f) => f.included).slice(0, 6),
    [plan],
  );
  const tier = tierForMonths(months) ?? TIERS[0];

  useEffect(() => {
    if (reduced) { setPhase("done"); setLitPerks(perks.length); return; }
    // The reveal waits for the rocket to leave rather than overlapping it —
    // text under a moving rocket is unreadable however it is layered.
    const LAUNCH_AT = 850;
    const CLEARS_AT = LAUNCH_AT + 1600;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setPhase("launch"), LAUNCH_AT));
    timers.push(window.setTimeout(() => setPhase("perks"), CLEARS_AT));
    perks.forEach((_, i) =>
      timers.push(window.setTimeout(() => setLitPerks(i + 1), CLEARS_AT + 120 + i * 200)));
    timers.push(window.setTimeout(
      () => setPhase("done"), CLEARS_AT + 120 + perks.length * 200 + 400));
    return () => timers.forEach(clearTimeout);
  }, [reduced, perks]);

  return (
    <div className="dg-overlay" role="dialog" aria-modal="true" aria-label={`${planName} activated`}>
      {/* stars streaking down while the rocket climbs */}
      {!reduced && phase !== "gift" && (
        <div className="dg-stars" aria-hidden>
          {Array.from({ length: 46 }).map((_, i) => (
            <span key={i} style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 11) * 0.13}s`,
              animationDuration: `${0.5 + ((i * 7) % 9) / 10}s`,
              height: `${8 + ((i * 13) % 30)}px`,
            }} />
          ))}
        </div>
      )}

      <div className="dg-stage">
        {phase === "gift" && !reduced && (
          <div className="dg-giftbox" aria-hidden>
            <svg width="132" height="132" viewBox="0 0 24 24" fill="none" stroke={accent}
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="10" width="18" height="11" rx="1.8" />
              <path d="M3 14.4h18M12 10v11" />
              <path d="M12 10S10.6 5.4 8.2 5.4a2.3 2.3 0 0 0 0 4.6ZM12 10s1.4-4.6 3.8-4.6a2.3 2.3 0 0 1 0 4.6Z" />
            </svg>
          </div>
        )}

        {!reduced && phase !== "gift" && (
          <>
            <div className="dg-burst" style={{ borderColor: accent }} aria-hidden />
            <div className="dg-rocket-wrap">
              <Rocket accent={accent} />
            </div>
          </>
        )}

        {(phase === "perks" || phase === "done") && (
          <div className={`dg-reveal ${phase === "done" ? "is-done" : ""}`}>
            <div className="dg-medal">
              <SubscriptionMedallion tier={tier} super size={124} />
            </div>
            <p className="dg-kicker">{fromName} gifted you</p>
            <h2 className="dg-title" style={{ color: accent }}>{planName}</h2>
            <p className="dg-sub">
              {months} {months === 1 ? "month" : "months"} applied · {tier.label} badge unlocked
            </p>

            <ul className="dg-perks">
              {perks.map((f, i) => (
                <li key={f.label} className={i < litPerks ? "is-lit" : ""}>
                  <span className="dg-tick" style={{ color: accent }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span>{f.label}{f.detail ? <em> — {f.detail}</em> : null}</span>
                </li>
              ))}
            </ul>

            {phase === "done" && (
              <button type="button" onClick={onClose} className="dg-btn"
                style={{ background: accent }}>
                Let&apos;s go
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.dg-overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 50% 120%,#1b1f3a 0%,#0b0c14 55%,#05060a 100%);overflow:hidden;
  animation:dg-fade .32s ease both}
@keyframes dg-fade{from{opacity:0}to{opacity:1}}
/* centred by flex rather than by text-align, which only lines up inline
   content and left the gift box drifting off centre */
.dg-stage{position:relative;width:100%;max-width:520px;padding:24px;text-align:center;
  display:flex;flex-direction:column;align-items:center;justify-content:center}
.dg-giftbox,.dg-reveal{width:100%;display:flex;flex-direction:column;align-items:center}

.dg-stars{position:absolute;inset:0;pointer-events:none}
.dg-stars span{position:absolute;top:-40px;width:2px;border-radius:2px;
  background:linear-gradient(180deg,transparent,rgba(255,255,255,.85),transparent);
  animation-name:dg-star;animation-timing-function:linear;animation-iteration-count:infinite}
@keyframes dg-star{from{transform:translateY(-60px)}to{transform:translateY(105vh)}}

.dg-giftbox{animation:dg-shake .55s ease-in-out 2}
@keyframes dg-shake{0%,100%{transform:rotate(0) scale(1)}
  20%{transform:rotate(-9deg) scale(1.05)}40%{transform:rotate(8deg) scale(1.05)}
  60%{transform:rotate(-6deg) scale(1.08)}80%{transform:rotate(5deg) scale(1.04)}}

.dg-burst{position:absolute;left:50%;top:52%;width:20px;height:20px;margin:-10px 0 0 -10px;
  border-radius:999px;border:3px solid;opacity:.9;animation:dg-burst .7s cubic-bezier(.2,.7,.3,1) both}
@keyframes dg-burst{to{width:520px;height:520px;margin:-260px 0 0 -260px;opacity:0;border-width:1px}}

/* behind the reveal: the rocket is still climbing as the perks start to
   light, and it must pass behind the text rather than across it */
.dg-rocket-wrap{position:absolute;left:50%;top:58%;margin-left:-95px;z-index:0;
  animation:dg-launch 1.6s cubic-bezier(.45,0,.6,.25) forwards}
.dg-reveal{z-index:1}
@keyframes dg-launch{
  0%{transform:translateY(60px) scale(.72);opacity:0}
  14%{transform:translateY(24px) scale(.88);opacity:1}
  44%{transform:translateY(-70px) scale(1);opacity:1}
  88%{opacity:1}
  100%{transform:translateY(-135vh) scale(1.06);opacity:0}}
.dg-rocket{filter:drop-shadow(0 12px 30px rgba(255,140,26,.35))}
.dg-flame-outer{transform-origin:60px 168px;animation:dg-fl1 .11s steps(2,end) infinite alternate}
.dg-flame-inner{transform-origin:60px 168px;animation:dg-fl2 .09s steps(2,end) infinite alternate}
@keyframes dg-fl1{from{transform:scaleY(.72) scaleX(.94)}to{transform:scaleY(1.24) scaleX(1.06)}}
@keyframes dg-fl2{from{transform:scaleY(1.18) scaleX(1.05)}to{transform:scaleY(.68) scaleX(.9)}}

.dg-reveal{position:relative;animation:dg-rise .5s cubic-bezier(.2,.8,.3,1) both}
@keyframes dg-rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
.dg-medal{display:flex;justify-content:center;animation:dg-pop .6s cubic-bezier(.2,1.5,.4,1) both}
@keyframes dg-pop{from{transform:scale(.4) rotate(-18deg);opacity:0}to{transform:none;opacity:1}}
.dg-kicker{margin:14px 0 0;font-size:13px;color:#9aa0a6}
.dg-title{margin:4px 0 0;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.dg-sub{margin:6px 0 0;font-size:14px;color:#c3c8ce}

.dg-perks{list-style:none;margin:22px auto 0;padding:0;max-width:340px;text-align:left}
.dg-perks li{display:flex;gap:9px;align-items:flex-start;padding:5px 0;font-size:13.5px;color:#e6e8eb;
  opacity:0;transform:translateX(-10px);transition:opacity .3s ease,transform .3s ease}
.dg-perks li.is-lit{opacity:1;transform:none}
.dg-perks em{font-style:normal;color:#9aa0a6}
.dg-tick{flex:0 0 auto;margin-top:2px}

.dg-btn{display:block;margin:26px auto 0;padding:11px 30px;border:0;border-radius:999px;
  font-size:15px;font-weight:700;color:#111;cursor:pointer;animation:dg-rise .4s ease both}

@media (prefers-reduced-motion: reduce){
  .dg-overlay,.dg-reveal,.dg-medal,.dg-btn{animation:none}
  .dg-perks li{opacity:1;transform:none;transition:none}
}
`;
