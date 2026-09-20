"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";

interface LinkRow {
  discord_username: string;
  guild_id: string | null;
  created_at: string;
}

export function DiscordConnectPanel() {
  const search = useSearchParams();
  const guild = search.get("guild") ?? "";
  const linked = search.get("linked") === "1";
  const urlError = search.get("error") ?? "";

  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [existing, setExisting] = useState<LinkRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(urlError || null);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      if (user) {
        const { data } = await supabase
          .from("discord_links")
          .select("discord_username, guild_id, created_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) setExisting(data as LinkRow);
      }
      setChecking(false);
    })();
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/discord/auth-url?guild=${encodeURIComponent(guild)}`);
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start Discord connect.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not start Discord connect.");
      setBusy(false);
    }
  }, [guild]);

  const validGuild = /^\d{5,25}$/.test(guild);

  return (
    <div className="mx-auto max-w-xl px-6 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
        Connect Discord
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-[#9aa0a8]">
        Link your Discord account to Disband. You will get a role in the space carrying your
        Disband username.
      </p>

      <div className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.02] p-6">
        {checking ? (
          <p className="text-sm text-[#6e727a]">Checking…</p>
        ) : !validGuild ? (
          <p className="text-sm leading-relaxed text-status-dnd">
            This link did not come with a Discord space. Ask for a fresh connect link with
            <span className="font-mono"> ,disband </span>
            in the space.
          </p>
        ) : linked ? (
          <div>
            <p className="text-lg font-semibold text-status-online">Connected ✓</p>
            <p className="mt-2 text-sm leading-relaxed text-[#9aa0a8]">
              Your Discord account is linked{existing ? ` as ${existing.discord_username}` : ""} and
              your role is assigned. You can close this page.
            </p>
          </div>
        ) : !userId ? (
          <div>
            <p className="text-sm leading-relaxed text-[#9aa0a8]">
              Log in to Disband first, then connect your Discord account.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(`/discord-connect?guild=${guild}`)}`}
              className="mt-4 inline-block rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Log in to Disband
            </Link>
          </div>
        ) : (
          <div>
            {existing && (
              <p className="mb-4 rounded-md border border-white/10 bg-[#1e1f22] px-3 py-2 text-[13px] text-[#9aa0a8]">
                Currently linked as <span className="font-semibold text-white">{existing.discord_username}</span>.
                Connecting again moves the link to your current Discord account.
              </p>
            )}
            {error && <p className="mb-4 text-[13px] text-status-dnd">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => void connect()}
              className="w-full rounded-md bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Opening Discord…" : "Connect with Discord"}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-[#6e727a]">
              Discord will ask you to confirm your identity. Disband only reads your username and
              user ID — nothing else.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
