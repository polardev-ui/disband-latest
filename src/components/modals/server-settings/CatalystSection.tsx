"use client";

import { CATALYST_LEVELS, catalystLevel, nextCatalystLevel } from "@/lib/catalysts";
import { IconCheck, IconLock, IconSparkle } from "@/components/icons";
import { SettingsSection, btn } from "./ui";
import type { SectionProps } from "./types";

/** What each level adds on top of the one before. */
const NEW_AT: Record<1 | 2 | 3, { title: string; body: string }[]> = {
  1: [{ title: "+50 custom emoji slots", body: "More room for everyone's favourites." }],
  2: [
    { title: "Custom invite link", body: "A short, memorable link instead of a random code." },
    { title: "Role icons", body: "An emoji or picture beside every member of a role." },
  ],
  3: [{ title: "Gradient roles", body: "Role names in a two-colour gradient, still or animated." }],
};

export function CatalystSection({ catalystCount, onBoost }: SectionProps) {
  const current = catalystLevel(catalystCount);
  const next = nextCatalystLevel(catalystCount);
  const floor = current.min;
  const pct = next ? Math.min(100, ((catalystCount - floor) / (next.min - floor)) * 100) : 100;

  return (
    <div className="pb-10">
      <section className="mb-8 overflow-hidden rounded-2xl border border-divider bg-bg-secondary">
        <div className="flex items-center gap-4 px-5 py-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-brand/12 text-brand">
            <IconSparkle size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text-muted">Current level</p>
            <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-normal">
              {current.level === 0 ? "No level yet" : current.name}
            </p>
          </div>
          {onBoost && (
            <button type="button" onClick={onBoost} className={btn.primary}>
              Boost this space
            </button>
          )}
        </div>
        <div className="border-t border-divider px-5 py-4">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-text-muted">
              {catalystCount} {catalystCount === 1 ? "Catalyst" : "Catalysts"}
            </span>
            <span className="text-text-muted">
              {next ? `${next.min - catalystCount} to ${next.name}` : "Every perk unlocked"}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-bg-accent">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>

      <SettingsSection title="Perks" description="Each level keeps everything below it. Perks lock again if the space drops a level.">
        {CATALYST_LEVELS.filter((l) => l.level > 0).map((l, i) => {
          const unlocked = current.level >= l.level;
          const lvl = l.level as 1 | 2 | 3;
          return (
            <div key={l.level} className="view-enter flex gap-4 border-b border-divider px-5 py-4 last:border-b-0" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex w-[84px] shrink-0 flex-col">
                <span className={`text-[14px] font-semibold ${unlocked ? "text-text-normal" : "text-text-muted"}`}>{l.name}</span>
                <span className="text-[12px] text-text-muted">{l.min} {l.min === 1 ? "Catalyst" : "Catalysts"}</span>
              </div>
              <ul className="min-w-0 flex-1 space-y-2.5">
                {NEW_AT[lvl].map((perk) => (
                  <li key={perk.title} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        unlocked ? "bg-status-online/15 text-status-online" : "bg-bg-accent text-text-muted"
                      }`}
                    >
                      {unlocked ? <IconCheck size={12} /> : <IconLock size={11} />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[14px] font-medium ${unlocked ? "text-text-normal" : "text-text-muted"}`}>{perk.title}</span>
                      <span className="block text-[12.5px] text-text-muted">{perk.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </SettingsSection>
    </div>
  );
}
