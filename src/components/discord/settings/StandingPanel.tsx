"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SettingsSection } from "./SettingsPrimitives";

type Tier = "good" | "strike" | "at_risk" | "high_risk" | "suspended";

interface Standing {
  tier: Tier;
  points: number;
  strikes: { id: number; severity: number; reason: string; category: string | null; source: "staff" | "sentinel"; created_at: string; expires_at: string | null; active: boolean }[];
  restrictions: { restriction: string; reason: string | null; expires_at: string | null }[];
}

export const TIERS: { id: Tier; label: string; colour: string; meaning: string }[] = [
  { id: "good", label: "Good", colour: "#23a55a", meaning: "No active strikes. Everything on Disband is open to you." },
  { id: "strike", label: "Strike", colour: "#f0b232", meaning: "One minor strike. Nothing is limited, but another one moves you to At Risk." },
  { id: "at_risk", label: "At Risk", colour: "#f57731", meaning: "Repeated or more serious breaks of the rules. Some features may be limited for a time." },
  { id: "high_risk", label: "High Risk", colour: "#e5484d", meaning: "Serious violations. Expect limits on messaging, joining spaces and more. One more could suspend you." },
  { id: "suspended", label: "Suspended", colour: "#8f1d21", meaning: "Your account is banned from Disband." },
];

const RESTRICTION_LABELS: Record<string, string> = {
  send_messages: "Can't send messages",
  send_reactions: "Can't add reactions",
  join_servers: "Can't join or create spaces",
  send_friend_requests: "Can't send friend requests",
  create_groups: "Can't create group chats",
};

/** Account Standing: where you are, why, and what each tier means. */
export function StandingPanel() {
  const [standing, setStanding] = useState<Standing | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void getSupabaseClient().rpc("get_my_standing").then(({ data, error }) => {
      if (error) setFailed(true);
      else setStanding(data as Standing);
    });
  }, []);

  if (failed) return <p className="text-[14px] text-text-muted">Account standing isn&apos;t available right now.</p>;
  if (!standing) return <div className="h-40 animate-pulse rounded-lg bg-bg-secondary" />;

  const index = TIERS.findIndex((t) => t.id === standing.tier);
  const tier = TIERS[index] ?? TIERS[0];

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-bg-secondary p-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-text-muted">Your account standing</p>
        <p className="mt-1 text-[28px] font-extrabold" style={{ color: tier.colour }}>{tier.label}</p>
        <p className="mt-1 max-w-lg text-[14px] text-text-normal">{tier.meaning}</p>
        <div className="mt-5 grid grid-cols-5 gap-1.5" role="img" aria-label={`Standing ${index + 1} of 5: ${tier.label}`}>
          {TIERS.map((t, i) => (
            <div key={t.id}>
              <div className="h-2.5 rounded-full transition-colors" style={{ background: i <= index ? t.colour : "var(--color-bg-tertiary, #1e1f22)" }} />
              <p className={`mt-1.5 text-center text-[11px] ${i === index ? "font-bold text-header-primary" : "text-text-muted"}`}>{t.label}</p>
            </div>
          ))}
        </div>
      </div>

      {standing.restrictions.length > 0 && (
        <SettingsSection title="Active limits" description="What you can't do right now, and until when.">
          <ul className="divide-y divide-divider">
            {standing.restrictions.map((r) => (
              <li key={r.restriction} className="px-5 py-3">
                <p className="font-semibold text-status-dnd">{RESTRICTION_LABELS[r.restriction] ?? r.restriction}</p>
                <p className="text-[13px] text-text-muted">
                  {r.reason ?? "No reason given."} · {r.expires_at ? `Until ${new Date(r.expires_at).toLocaleString()}` : "No end date"}
                </p>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      <SettingsSection title="Strikes" description="Strikes expire. Your standing improves as they do.">
        {standing.strikes.length === 0 ? (
          <p className="px-5 py-4 text-[14px] text-text-muted">No strikes. Keep it up.</p>
        ) : (
          <ul className="divide-y divide-divider">
            {standing.strikes.map((s) => (
              <li key={s.id} className={`flex items-start gap-3 px-5 py-3 ${s.active ? "" : "opacity-50"}`}>
                <span className="mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: TIERS[Math.min(4, s.severity + 1)].colour }}>
                  {["", "Minor", "Serious", "Severe"][s.severity]}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] text-text-normal">{s.reason}</p>
                  <p className="text-[12px] text-text-muted">
                    {s.source === "sentinel" ? "Found by Sentinel" : "Issued by Disband staff"} · {new Date(s.created_at).toLocaleDateString()}
                    {s.active ? (s.expires_at ? ` · expires ${new Date(s.expires_at).toLocaleDateString()}` : "") : " · expired"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="How standing works">
        <ul className="divide-y divide-divider">
          {TIERS.map((t) => (
            <li key={t.id} className="flex gap-3 px-5 py-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.colour }} />
              <div>
                <p className="font-semibold text-header-primary">{t.label}</p>
                <p className="text-[13px] text-text-muted">{t.meaning}</p>
              </div>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
