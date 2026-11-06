"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PUBLIC_ENV } from "@/lib/public-env";
import { safeImageUrl } from "@/lib/safe-url";
import { Turnstile } from "@/components/ui/Turnstile";
import {
  DONATION_MAX_CENTS,
  DONATION_MESSAGE_MAX,
  DONATION_MIN_CENTS,
  DONATION_PRESETS_CENTS,
  cleanDonationMessage,
  formatUsd,
  validateDonationAmount,
  type DonationWall,
} from "@/lib/donations";

interface Viewer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Initial({ name, avatarUrl, size = 40 }: { name: string | null; avatarUrl: string | null; size?: number }) {
  const src = safeImageUrl(avatarUrl);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-[#2b2d31] text-[15px] font-semibold text-[#b5bac1]"
      style={{ width: size, height: size }}
    >
      {name ? name.charAt(0).toUpperCase() : "?"}
    </span>
  );
}

export function DonateClient() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const [wall, setWall] = useState<DonationWall | null>(null);
  const [wallError, setWallError] = useState(false);
  const [staff, setStaff] = useState(false);
  const [thanks, setThanks] = useState(false);

  const [preset, setPreset] = useState<number | null>(1000);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [showName, setShowName] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWall = useCallback(async () => {
    try {
      const res = await fetch("/api/donate/wall");
      if (!res.ok) throw new Error();
      setWall((await res.json()) as DonationWall);
      setWallError(false);
    } catch {
      setWallError(true);
    }
  }, []);

  useEffect(() => {
    void loadWall();
    if (new URLSearchParams(window.location.search).get("thanks")) {
      setThanks(true);
      // The webhook usually lands within a few seconds of the redirect.
      const again = window.setTimeout(() => void loadWall(), 6000);
      window.history.replaceState(null, "", "/donate");
      return () => window.clearTimeout(again);
    }
  }, [loadWall]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user || user.is_anonymous) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        setViewer({
          id: user.id,
          name: profile?.display_name || profile?.username || "you",
          avatarUrl: profile?.avatar_url ?? null,
        });
        const res = await apiFetch("/api/donate/moderate");
        if (res.ok && !cancelled) setStaff(((await res.json()) as { staff?: boolean }).staff === true);
      } catch {
        // Treated as signed out.
      } finally {
        if (!cancelled) setViewerLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const amountCents = useMemo(() => {
    if (preset != null) return preset;
    const n = Number(custom.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  }, [preset, custom]);

  const amountError = preset == null && custom ? validateDonationAmount(amountCents) : null;
  const messageLeft = DONATION_MESSAGE_MAX - message.length;
  const needsTurnstile = viewerLoaded && !viewer;

  async function donate(e: React.FormEvent) {
    e.preventDefault();
    const amountProblem = validateDonationAmount(amountCents);
    if (amountProblem) { setError(amountProblem); return; }
    const { error: messageProblem } = cleanDonationMessage(message);
    if (messageProblem) { setError(messageProblem); return; }
    if (needsTurnstile && !turnstileToken) { setError("Complete the check below first."); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/donate/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          message: message.trim() || null,
          showName: !!viewer && showName,
          turnstileToken,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't start your donation. Please try again.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start your donation. Please try again.");
      setSubmitting(false);
    }
  }

  async function toggleHidden(id: string, hidden: boolean) {
    const res = await apiFetch("/api/donate/moderate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hidden }),
    });
    if (res.ok) {
      setWall((w) => w && {
        ...w,
        entries: w.entries.map((d) => (d.id === id ? { ...d, message: hidden ? null : d.message } : d)),
      });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* The form. */}
      <form
        id="give"
        onSubmit={donate}
        className="h-fit scroll-mt-24 rounded-2xl border border-white/[0.06] bg-[#232428] p-6 sm:p-7"
      >
        {thanks && (
          <div role="status" className="mb-6 rounded-xl border border-[#3ba55c]/30 bg-[#3ba55c]/10 p-4 text-[14px] leading-relaxed text-[#b9e8c7]">
            <p className="font-semibold text-white">Thank you. Really.</p>
            <p className="mt-1">Your donation went through. It can take a few seconds to appear on the wall.</p>
          </div>
        )}

        <h2 className="text-xl font-semibold text-white">Make a donation</h2>
        <p className="mt-1 text-[14px] text-[#949ba4]">One-off, in US dollars, paid securely through Stripe.</p>

        <fieldset className="mt-6">
          <legend className="text-xs font-semibold uppercase tracking-[0.1em] text-[#949ba4]">Amount</legend>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DONATION_PRESETS_CENTS.map((cents) => (
              <button
                key={cents}
                type="button"
                onClick={() => { setPreset(cents); setCustom(""); setError(null); }}
                aria-pressed={preset === cents}
                className={`h-11 rounded-lg border text-[15px] font-semibold transition-colors ${
                  preset === cents
                    ? "border-brand bg-brand text-white"
                    : "border-white/10 bg-[#1e1f22] text-[#dbdee1] hover:border-white/25"
                }`}
              >
                {formatUsd(cents)}
              </button>
            ))}
            <label
              className={`relative col-span-3 flex h-11 items-center rounded-lg border bg-[#1e1f22] ${
                preset == null ? "border-brand" : "border-white/10"
              }`}
            >
              <span className="pl-3 text-[15px] text-[#949ba4]">$</span>
              <input
                inputMode="decimal"
                aria-label="Custom amount in US dollars"
                placeholder="Other amount"
                value={custom}
                onFocus={() => setPreset(null)}
                onChange={(e) => { setPreset(null); setCustom(e.target.value.replace(/[^0-9.]/g, "").slice(0, 7)); setError(null); }}
                className="h-full w-full min-w-0 bg-transparent px-1.5 text-[15px] font-semibold text-white outline-none placeholder:font-normal placeholder:text-[#6d6f78]"
              />
            </label>
          </div>
          <p className={`mt-2 text-[12px] ${amountError ? "text-[#f23f43]" : "text-[#6d6f78]"}`}>
            {amountError ?? `Between ${formatUsd(DONATION_MIN_CENTS)} and ${formatUsd(DONATION_MAX_CENTS)}.`}
          </p>
        </fieldset>

        <div className="mt-6">
          <label htmlFor="donate-message" className="text-xs font-semibold uppercase tracking-[0.1em] text-[#949ba4]">
            Message <span className="font-normal normal-case tracking-normal text-[#6d6f78]">(optional, shown on the wall)</span>
          </label>
          <textarea
            id="donate-message"
            value={message}
            onChange={(e) => { setMessage(e.target.value.slice(0, DONATION_MESSAGE_MAX)); setError(null); }}
            rows={3}
            placeholder="Say something to the team, or to everyone reading."
            className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-[#1e1f22] px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-[#6d6f78] focus:border-brand"
          />
          <p className="mt-1 text-right text-[12px] text-[#6d6f78]">{messageLeft} left · no links</p>
        </div>

        <div className="mt-4 rounded-xl bg-[#1e1f22] p-4">
          {!viewerLoaded ? (
            <div className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
          ) : viewer ? (
            <label className="flex cursor-pointer items-center gap-3">
              <Initial name={viewer.name} avatarUrl={viewer.avatarUrl} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-white">
                  {showName ? <>Show as <strong>{viewer.name}</strong></> : <>Show as <strong>Anonymous</strong></>}
                </span>
                <span className="block text-[12px] text-[#949ba4]">
                  {showName ? "Your name, avatar, amount and message appear on the wall." : "Only the amount and your message appear."}
                </span>
              </span>
              <input
                type="checkbox"
                checked={showName}
                onChange={(e) => setShowName(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#00a8fc] ${showName ? "bg-brand" : "bg-[#4e5058]"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${showName ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </span>
            </label>
          ) : (
            <div className="text-[14px] leading-relaxed text-[#b5bac1]">
              <p>
                You&rsquo;re not logged in, so your donation will show as <strong className="text-white">Anonymous</strong>.{" "}
                <Link href="/login" className="text-brand hover:underline">Log in</Link> if you&rsquo;d like your name on the wall.
              </p>
              <Turnstile
                siteKey={PUBLIC_ENV.turnstileSiteKey}
                action="donate"
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                className="mt-3"
              />
            </div>
          )}
        </div>

        {error && <p role="alert" className="mt-4 text-[14px] text-[#f23f43]">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !amountCents || !!amountError || (needsTurnstile && !turnstileToken)}
          className="mt-5 h-12 w-full rounded-xl bg-brand text-[16px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Opening checkout…" : amountCents ? `Donate ${formatUsd(amountCents)}` : "Donate"}
        </button>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-[#6d6f78]">
          You&rsquo;ll finish on Stripe&rsquo;s secure checkout. Donations aren&rsquo;t tax-deductible and don&rsquo;t buy any perks.
        </p>
      </form>

      {/* The wall. */}
      <section aria-labelledby="wall-heading" className="min-w-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/[0.06] bg-[#232428] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#949ba4]">Raised so far</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
              {wall ? formatUsd(wall.totalCents) : wallError ? "—" : <span className="inline-block h-8 w-24 animate-pulse rounded bg-white/[0.06]" />}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-[#232428] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#949ba4]">Donations</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
              {wall ? wall.donorCount.toLocaleString("en-GB") : wallError ? "—" : <span className="inline-block h-8 w-12 animate-pulse rounded bg-white/[0.06]" />}
            </p>
          </div>
        </div>

        <h2 id="wall-heading" className="mt-8 text-xl font-semibold text-white">Supporters</h2>
        <p className="mt-1 text-[14px] text-[#949ba4]">Everyone who&rsquo;s chipped in, newest first.</p>

        <div className="mt-4 space-y-2">
          {wallError && !wall && (
            <p className="rounded-xl bg-[#232428] p-5 text-[14px] text-[#949ba4]">
              Couldn&rsquo;t load the wall right now.{" "}
              <button type="button" onClick={() => void loadWall()} className="text-brand hover:underline">Try again</button>
            </p>
          )}
          {!wall && !wallError &&
            Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-[#232428]" />)}
          {wall && wall.entries.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-[15px] font-medium text-white">No donations yet.</p>
              <p className="mt-1 text-[14px] text-[#949ba4]">Be the first name on the wall.</p>
            </div>
          )}
          {wall?.entries.map((d) => (
            <article key={d.id} className="flex gap-3 rounded-xl bg-[#232428] p-4">
              <Initial name={d.name} avatarUrl={d.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`truncate text-[15px] font-semibold ${d.name ? "text-white" : "text-[#b5bac1]"}`}>
                    {d.name ?? "Anonymous"}
                  </span>
                  <span className="text-[15px] font-semibold text-[#86dca3]">{formatUsd(d.amountCents)}</span>
                  <span className="text-[12px] text-[#6d6f78]">{timeAgo(d.paidAt)}</span>
                </div>
                {d.message && (
                  <p className="mt-1 break-words text-[14px] leading-relaxed text-[#b5bac1]">{d.message}</p>
                )}
                {staff && d.message && (
                  <button
                    type="button"
                    onClick={() => void toggleHidden(d.id, true)}
                    className="mt-1 text-[12px] text-[#f23f43] hover:underline"
                  >
                    Hide message
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
