"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Avatar } from "@/components/ui/Avatar";
import { apiFetch } from "@/lib/api";
import { displayName } from "@/lib/utils";

interface Consent {
  app: { id: string; name: string; description: string | null; website: string | null; icon_url: string | null; owner: string | null };
  redirect_uri: string;
  scopes: { id: string; label: string }[];
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).host; } catch { return null; }
}

function ConsentCard() {
  const { ready, session, profile, signOut } = useApp();
  const params = useMemo(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)), []);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiFetch(`/api/oauth2/authorize?${params.toString()}`)
      .then(async (r) => {
        const json = (await r.json().catch(() => ({}))) as Consent & { error?: string };
        if (!r.ok) setError(json.error ?? "This sign-in link isn't valid.");
        else setConsent(json);
      })
      .catch(() => setError("Couldn't reach Disband. Check your connection and try again."));
  }, [params]);

  if (!ready) return <LoadingScreen label="Loading" />;
  if (!session) return <AuthScreen />;

  const back = (extra: Record<string, string>) => {
    if (!consent) return;
    const target = new URL(consent.redirect_uri);
    for (const [k, v] of Object.entries(extra)) target.searchParams.set(k, v);
    const state = params.get("state");
    if (state) target.searchParams.set("state", state);
    window.location.href = target.toString();
  };

  async function authorise() {
    if (!consent) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/oauth2/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: consent.app.id,
          redirect_uri: consent.redirect_uri,
          scope: consent.scopes.map((s) => s.id).join(" "),
          state: params.get("state") ?? undefined,
          code_challenge: params.get("code_challenge") ?? undefined,
          code_challenge_method: params.get("code_challenge_method") ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string };
      if (!res.ok || !json.redirect) throw new Error(json.error ?? "Couldn't sign you in.");
      window.location.href = json.redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign you in.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-tertiary p-4">
      <div className="w-full max-w-[440px] overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]">
        {error && !consent ? (
          <div className="p-8 text-center">
            <h1 className="text-xl font-bold text-header-primary">Can&apos;t sign in with Disband</h1>
            <p className="mt-2 text-[15px] text-text-muted">{error}</p>
          </div>
        ) : !consent ? (
          <div className="p-8"><div className="mx-auto h-16 w-16 animate-pulse rounded-2xl bg-bg-secondary" /></div>
        ) : (
          <>
            <div className="flex flex-col items-center px-8 pb-6 pt-8 text-center">
              <div className="flex items-center gap-3">
                {consent.app.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={consent.app.icon_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">{consent.app.name.charAt(0).toUpperCase()}</span>
                )}
                <span className="text-text-muted">···</span>
                {profile && <Avatar profile={profile} size="lg" className="!h-16 !w-16" />}
              </div>
              <h1 className="mt-5 text-[20px] font-bold leading-6 text-header-primary">{consent.app.name}</h1>
              <p className="mt-1 text-[14px] text-text-muted">wants to access your Disband account</p>
              {profile && (
                <p className="mt-3 text-[13px] text-text-muted">
                  Signed in as <span className="font-semibold text-text-normal">{displayName(profile)}</span>{" "}
                  <button type="button" onClick={() => void signOut()} className="text-text-link hover:underline">Not you?</button>
                </p>
              )}
            </div>
            <div className="border-t border-divider px-8 py-5">
              <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-header-secondary">This will allow {consent.app.name} to</p>
              <ul className="mt-3 space-y-2.5">
                {consent.scopes.map((s) => (
                  <li key={s.id} className="flex items-start gap-2.5 text-[15px] text-text-normal">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0 text-status-online"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" /></svg>
                    {s.label}
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-[15px] text-text-muted">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3 1.4 1.4Z" /></svg>
                  It can&apos;t read your messages or post as you
                </li>
              </ul>
              <p className="mt-4 text-[12px] leading-4 text-text-muted">
                You&apos;ll be sent to <span className="font-semibold">{hostOf(consent.redirect_uri)}</span>
                {consent.app.owner ? <> · Made by {consent.app.owner}</> : null}. You can remove its access any time in Settings → Links.
              </p>
              {error && <p className="mt-3 text-[14px] text-status-dnd">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 bg-bg-secondary px-6 py-4">
              <button type="button" disabled={busy} onClick={() => back({ error: "access_denied" })} className="h-[38px] rounded-[3px] px-4 text-[14px] font-medium text-text-normal hover:underline">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void authorise()} className="h-[38px] min-w-[110px] rounded-[3px] bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60">
                {busy ? "Authorising…" : "Authorise"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** "Sign in with Disband": the consent screen a Link's button opens. */
export default function AuthorizePage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <ConsentCard />
      </AppProvider>
    </ThemeProvider>
  );
}
