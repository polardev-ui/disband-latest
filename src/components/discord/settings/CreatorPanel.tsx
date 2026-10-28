"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import { isTauri } from "@/lib/platform";
import { BadgeGlyph } from "@/lib/badge-icons";
import { SettingsSection } from "./SettingsPrimitives";
import { btn } from "@/components/modals/server-settings/ui";

type Platform = "youtube" | "tiktok" | "twitch";
interface Connection { platform: Platform; handle: string | null; followers: number; refreshed_at: string }

const META: Record<Platform, { label: string; colour: string; noun: string }> = {
  youtube: { label: "YouTube", colour: "#ff0033", noun: "subscribers" },
  tiktok: { label: "TikTok", colour: "#25f4ee", noun: "followers" },
  twitch: { label: "Twitch", colour: "#9146ff", noun: "followers" },
};
const THRESHOLD = 2500;

export function compactCount(n: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Creator Program: connect platforms, see where you stand against the threshold. */
export function CreatorPanel() {
  const { user } = useApp();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [available, setAvailable] = useState<Record<Platform, boolean> | null>(null);
  const [busy, setBusy] = useState<Platform | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await getSupabaseClient().from("creator_connections").select("platform, handle, followers, refreshed_at").eq("user_id", user.id);
    setConnections((data as Connection[] | null) ?? []);
  }, [user]);

  useEffect(() => {
    void load();
    void apiFetch("/api/creator/connect").then((r) => r.json()).then((j: { platforms: Record<Platform, boolean> }) => setAvailable(j.platforms)).catch(() => setAvailable(null));
    const q = new URLSearchParams(window.location.search);
    const status = q.get("creator");
    if (status === "verified") setNote("Verified. Your Content Creator badge is live.");
    else if (status === "connected") setNote(`Connected. The badge unlocks at ${THRESHOLD.toLocaleString("en-GB")} followers.`);
    else if (status === "error") setNote(q.get("message") ?? "That didn't connect.");
  }, [load]);

  async function connect(p: Platform) {
    setBusy(p);
    setNote(null);
    try {
      const res = await apiFetch("/api/creator/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: p }) });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) throw new Error(json.error ?? "Couldn't start the connection.");
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("plugin:opener|open_url", { url: json.url });
        setNote("Finish connecting in your browser, then come back.");
      } else {
        window.location.href = json.url;
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't start the connection.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(p: Platform) {
    setBusy(p);
    await apiFetch(`/api/creator/connect?platform=${p}`, { method: "DELETE" });
    setBusy(null);
    void load();
  }

  const best = Math.max(0, ...connections.map((c) => c.followers));
  const verified = best >= THRESHOLD;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5 rounded-xl bg-gradient-to-br from-[#ff4f6d] to-[#7b2ff7] p-6 text-white">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15"><BadgeGlyph badgeKey="creator" size={40} /></span>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-white/80">Creator Program</p>
          <p className="text-[22px] font-extrabold leading-tight">{verified ? "You're a verified creator" : "For creators with a following"}</p>
          <p className="mt-1 text-[14px] text-white/85">
            Connect your channel. Pass {THRESHOLD.toLocaleString("en-GB")} followers on any platform and the Content Creator badge appears on your profile, showing your count on hover.
          </p>
        </div>
      </div>

      {note && <p role="status" className="rounded-md bg-bg-secondary px-3 py-2 text-[14px] text-text-normal">{note}</p>}

      <SettingsSection title="Your platforms" description="We only read your public follower count and handle. You can disconnect at any time.">
        <ul className="divide-y divide-divider">
          {(Object.keys(META) as Platform[]).map((p) => {
            const c = connections.find((x) => x.platform === p);
            const progress = c ? Math.min(1, c.followers / THRESHOLD) : 0;
            const ready = available?.[p];
            return (
              <li key={p} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: META[p].colour }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-header-primary">{META[p].label}</p>
                  {c ? (
                    <>
                      <p className="text-[13px] text-text-muted">{c.handle} · {c.followers.toLocaleString("en-GB")} {META[p].noun}</p>
                      <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-bg-tertiary">
                        <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: META[p].colour }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] text-text-muted">{ready === false ? "Not available yet" : "Not connected"}</p>
                  )}
                </div>
                {c ? (
                  <button type="button" disabled={busy === p} onClick={() => void disconnect(p)} className={btn.secondary}>Disconnect</button>
                ) : (
                  <button type="button" disabled={busy === p || ready === false} onClick={() => void connect(p)} className={btn.primary}>
                    {busy === p ? "Opening…" : "Connect"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsSection>
    </div>
  );
}
