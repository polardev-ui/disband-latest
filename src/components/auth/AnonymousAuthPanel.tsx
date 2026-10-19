"use client";

import { useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Logo } from "@/components/ui/Logo";
import { ScatteredIcons } from "@/components/auth/ScatteredIcons";
import { Turnstile } from "@/components/ui/Turnstile";
import { PUBLIC_ENV } from "@/lib/public-env";
import { TURNSTILE_REQUIRED } from "@/lib/authErrors";
import {
  ANON_TIERS,
  ANON_TIER_ORDER,
  formatAccountNumber,
  isValidAccountNumber,
  normalizeAccountNumber,
  type AnonTier,
  type AnonSessionPayload,
} from "@/lib/anon-accounts";

type View = "create" | "login";
type Step = "form" | "reveal" | "expired" | "purge-confirm" | "purged";

const inputClass =
  "h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal " +
  "outline-none transition-colors placeholder:text-text-muted focus:border-[#00a8fc]";

const LABEL = "mb-2 block text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary";
const PRIMARY =
  "flex h-11 w-full items-center justify-center rounded-[3px] bg-brand text-[16px] font-medium text-white " +
  "transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "flex h-11 w-full items-center justify-center rounded-[3px] bg-button-secondary text-[16px] font-medium text-white " +
  "transition-colors hover:bg-button-secondary-hover";

/**
 * Why the check failed, in words a person can act on. Codes are Cloudflare's
 * Turnstile client error codes. There is no way past a failure: the account
 * is only created with a token the server verifies.
 */
function turnstileAdvice(code: string | null): string {
  if (code && (code.startsWith("1106") || code === "200100")) {
    return "Your device's clock looks wrong. Turn on automatic date and time, then retry.";
  }
  if (code && code.startsWith("1102")) {
    return "Verification isn't set up for this address yet. Use disband.dev in your browser.";
  }
  if (code && (code.startsWith("1105") || code.startsWith("1101"))) {
    return "Your browser isn't supported by the verification. Update it or try another browser.";
  }
  if (code && (code.startsWith("3") || code.startsWith("6"))) {
    return "We couldn't verify this device. Turn off VPNs, proxies and content blockers, then retry.";
  }
  return "The verification couldn't load. Turn off content blockers for this page, then retry.";
}

const RESTRICTIONS = [
  "Can't create servers",
  "Can't buy Disband Aero",
  "Can't accept gifts",
  "Can't create bots",
];

/** The server answers "TURNSTILE_REQUIRED"; the shared constant is a different sentinel. */
function isTurnstileCode(code: string | undefined): boolean {
  return code === TURNSTILE_REQUIRED || code === "TURNSTILE_REQUIRED";
}

function NewBadge() {
  return (
    <span className="absolute -right-2 -top-2 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white shadow">
      New
    </span>
  );
}

/** Deterministic (UTC, en-US) formatting so SSR and client agree. */
function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function AnonymousAuthPanel({
  initialView,
  overlay = false,
  onClose,
}: {
  initialView: View;
  overlay?: boolean;
  onClose: () => void;
}) {
  const {
    registerAnonymousAccount,
    loginAnonymousAccount,
    exportAnonymousData,
    purgeAnonymousAccount,
    adoptAnonymousSession,
  } = useApp();

  const [view, setView] = useState<View>(initialView);
  const [step, setStep] = useState<Step>("form");
  const [tier, setTier] = useState<AnonTier>("1w");
  const [numberInput, setNumberInput] = useState("");
  const [createdNumber, setCreatedNumber] = useState("");
  const [pendingSession, setPendingSession] = useState<AnonSessionPayload | null>(null);
  const [expired, setExpired] = useState<{
    number: string;
    canDownload: boolean;
    purged: boolean;
    expiresAt: string | null;
    purgeAfter: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  // Set when the widget fails; holds Cloudflare's code ("" when it gave none).
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const busyRef = useRef(false);

  function resetTurnstile() {
    setTurnstileToken(null);
    setTurnstileError(null);
    setTurnstileKey((k) => k + 1);
  }

  function switchView(next: View) {
    setView(next);
    setStep("form");
    setError(null);
    setNotice(null);
    setNumberInput("");
    resetTurnstile();
  }

  async function handleCreate() {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await registerAnonymousAccount(tier, turnstileToken);
      if (result.error) {
        setError(
          isTurnstileCode(result.code)
            ? "Complete the verification challenge, then try again."
            : result.error,
        );
        if (isTurnstileCode(result.code)) resetTurnstile();
        return;
      }
      setCreatedNumber(result.number ?? "");
      setPendingSession(result.session ?? null);
      setStep("reveal");
    } finally {
      resetTurnstile();
      setLoading(false);
      busyRef.current = false;
    }
  }

  async function handleRevealContinue() {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (pendingSession) {
        const err = await adoptAnonymousSession(pendingSession);
        if (err) setError(err);
        // On success the app shell takes over and this unmounts.
      } else if (isValidAccountNumber(createdNumber)) {
        // Rare fallback when session minting failed at creation — send them
        // back to the login screen instead of requiring a verification token
        // we never asked them for here.
        setError("Your account was created, but sign-in needs your number. Copy it and use 'Log in to an Anonymous Account'.");
      } else {
        setError("Save your account number first.");
      }
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }

  function openExpired(
    number: string,
    result: { canDownload?: boolean; purged?: boolean; expiresAt?: string; purgeAfter?: string },
  ) {
    setExpired({
      number,
      canDownload: result.canDownload ?? false,
      purged: result.purged ?? false,
      expiresAt: result.expiresAt ?? null,
      purgeAfter: result.purgeAfter ?? null,
    });
    setStep("expired");
    setError(null);
    setNotice(null);
    resetTurnstile();
  }

  async function handleLogin() {
    if (busyRef.current) return;
    const digits = normalizeAccountNumber(numberInput);
    if (!isValidAccountNumber(digits)) {
      setError("Enter your 16-digit account number.");
      return;
    }
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await loginAnonymousAccount(digits, turnstileToken);
      if (result.status === "expired") {
        openExpired(digits, result);
        return;
      }
      if (result.error) {
        setError(
          isTurnstileCode(result.code)
            ? "Complete the verification challenge, then try again."
            : result.error,
        );
        return;
      }
      // Success: the app shell takes over.
    } finally {
      resetTurnstile();
      setLoading(false);
      busyRef.current = false;
    }
  }

  async function handleExport() {
    if (busyRef.current || !expired) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await exportAnonymousData(expired.number, turnstileToken);
      if (result.error) {
        setError(
          isTurnstileCode(result.code)
            ? "Complete the verification challenge, then try again."
            : result.error,
        );
        return;
      }
      setNotice("Your download has started. Keep the file somewhere safe.");
    } finally {
      resetTurnstile();
      setLoading(false);
      busyRef.current = false;
    }
  }

  async function handlePurge() {
    if (busyRef.current || !expired) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await purgeAnonymousAccount(expired.number, turnstileToken);
      if (result.error) {
        setError(
          isTurnstileCode(result.code)
            ? "Complete the verification challenge, then try again."
            : result.error,
        );
        return;
      }
      setStep("purged");
    } finally {
      resetTurnstile();
      setLoading(false);
      busyRef.current = false;
    }
  }

  // --- Copy -----------------------------------------------------------------
  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(normalizeAccountNumber(createdNumber));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // The action ties each token to this form step; the server checks it.
  const turnstileAction =
    step === "purge-confirm" ? "anon-purge" : step === "expired" ? "anon-export" : view === "create" ? "anon-register" : "anon-login";

  const turnstile = (
    <div className="space-y-2">
      <Turnstile
        key={`${turnstileKey}-${turnstileAction}`}
        siteKey={PUBLIC_ENV.turnstileSiteKey}
        action={turnstileAction}
        onToken={(t) => {
          setTurnstileToken(t);
          setTurnstileError(null);
        }}
        onExpire={() => setTurnstileToken(null)}
        onError={(code) => {
          setTurnstileToken(null);
          setTurnstileError(code ?? "");
        }}
        className="flex min-h-[65px] justify-center"
      />
      {turnstileError !== null && (
        <p role="alert" className="rounded-[3px] bg-status-dnd/10 px-3 py-2.5 text-[14px] leading-[18px] text-text-normal">
          {turnstileAdvice(turnstileError)}{" "}
          <button type="button" className="font-medium text-[#00a8fc] hover:underline" onClick={resetTurnstile}>
            Retry
          </button>
          {turnstileError && turnstileError !== "timeout" && (
            <span className="ml-1 text-[12px] text-text-muted">(code {turnstileError})</span>
          )}
        </p>
      )}
    </div>
  );

  const errorBlock = error && (
    <p role="alert" className="text-[14px] leading-[18px] text-status-dnd">
      {error}
    </p>
  );

  // --- Headings -------------------------------------------------------------
  const heading =
    step === "reveal"
      ? "Save your account number"
      : step === "expired"
        ? "This account has expired"
        : step === "purge-confirm"
          ? "Delete your data?"
          : step === "purged"
            ? "Data permanently deleted"
            : view === "create"
              ? "Create an anonymous account"
              : "Log in to an anonymous account";

  const subheading =
    step === "reveal"
      ? "This is the only way back into this account. Write it down before you continue."
      : step === "expired"
        ? expired?.purged
          ? "Everything tied to this account has been permanently deleted."
          : "The account reached the end of its life. Your data is no longer in the app."
        : step === "purge-confirm"
          ? "This permanently deletes your profile, messages, reactions, notes and saved GIFs. It cannot be undone."
          : step === "purged"
            ? "There is nothing left tied to this account number."
            : view === "create"
              ? "A throwaway account with a randomised @disband.dev address. No email, no IP logging — just a 16-digit number."
              : "Enter your 16-digit account number to pick up where you left off.";

  const spinner = <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;

  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/85 overlay-fade p-4"
          : "relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#404eed] px-4 py-8"
      }
      onClick={overlay ? onClose : undefined}
    >
      {!overlay && <ScatteredIcons tone="text-white" />}
      {!overlay && (
        <div className="absolute left-6 top-6 z-10 hidden items-center gap-2 sm:flex">
          <Logo size={32} className="h-8 w-8" priority />
          <span className="text-[20px] font-extrabold tracking-[-0.01em] text-white">Disband</span>
        </div>
      )}
      <div
        className={`${overlay ? "classic-modal" : "z-10"} channel-scroll relative max-h-[calc(100dvh-32px)] w-full max-w-[480px] overflow-y-auto rounded-[5px] bg-bg-primary p-6 shadow-[var(--elevation-high)] sm:p-8`}
        onClick={overlay ? (e) => e.stopPropagation() : undefined}
      >
        <div className="mb-5 text-center">
          <h1 className="text-[24px] font-semibold leading-[30px] text-header-primary">{heading}</h1>
          <p className="mt-2 text-[16px] leading-5 text-header-secondary">{subheading}</p>
        </div>

        {/* CREATE — tier picker */}
        {step === "form" && view === "create" && (
          <div className="space-y-5">
            <div role="radiogroup" aria-label="How long the account lasts">
              <span className={LABEL}>Account lasts</span>
              <div className="grid grid-cols-2 gap-2">
                {ANON_TIER_ORDER.map((t) => {
                  const on = tier === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setTier(t)}
                      className={`flex h-11 items-center gap-2.5 rounded-[3px] px-3 text-left text-[16px] font-medium transition-colors ${
                        on ? "bg-interactive-selected text-header-primary" : "bg-bg-secondary text-header-secondary hover:bg-interactive-hover hover:text-header-primary"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-white" : "border-interactive-normal"}`}
                      >
                        {on && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                      </span>
                      {ANON_TIERS[t].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className={LABEL}>Anonymous accounts can&apos;t</span>
              <ul className="space-y-1.5 rounded-[3px] bg-bg-secondary px-3 py-2.5">
                {RESTRICTIONS.map((r) => (
                  <li key={r} className="flex items-center gap-2 text-[14px] text-header-secondary">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 text-status-dnd">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    {r.replace(/^Can't (.)/, (_, c: string) => c.toUpperCase())}
                  </li>
                ))}
              </ul>
            </div>

            {turnstile}
            {errorBlock}

            <button type="button" onClick={() => void handleCreate()} disabled={loading || !turnstileToken} className={PRIMARY}>
              {loading ? spinner : `Create ${ANON_TIERS[tier].label} Account`}
            </button>
          </div>
        )}

        {/* REVEAL */}
        {step === "reveal" && (
          <div className="space-y-4">
            <div className="rounded-[3px] bg-bg-tertiary px-4 py-4 text-center">
              <p className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">Your account number</p>
              <p className="mt-2 select-all font-mono text-[22px] font-semibold tracking-[0.12em] text-header-primary">
                {createdNumber || "—"}
              </p>
            </div>
            <button type="button" onClick={() => void copyNumber()} className={SECONDARY}>
              {copied ? "Copied!" : "Copy Account Number"}
            </button>
            <p className="rounded-[3px] bg-[#f0b232]/15 px-3 py-2.5 text-[14px] leading-[18px] text-text-normal">
              We can&apos;t recover this number for you. If you lose it, the account is gone.
            </p>
            {errorBlock}
            <button type="button" onClick={() => void handleRevealContinue()} disabled={loading} className={PRIMARY}>
              {loading ? spinner : "I've Saved It — Continue"}
            </button>
          </div>
        )}

        {/* LOGIN */}
        {step === "form" && view === "login" && (
          <div className="space-y-5">
            <label className="block">
              <span className={LABEL}>
                Account number <span className="text-status-dnd">*</span>
              </span>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={formatAccountNumber(numberInput)}
                onChange={(e) => setNumberInput(normalizeAccountNumber(e.target.value))}
                placeholder="0000 0000 0000 0000"
                className={inputClass + " font-mono tracking-[0.12em]"}
              />
            </label>

            {turnstile}
            {errorBlock}

            <button type="button" onClick={() => void handleLogin()} disabled={loading || !turnstileToken} className={PRIMARY}>
              {loading ? spinner : "Log In"}
            </button>
          </div>
        )}

        {/* EXPIRED */}
        {step === "expired" && expired && (
          <div className="space-y-4">
            <p className="rounded-[3px] bg-bg-secondary px-3 py-2.5 text-[14px] leading-[18px] text-header-secondary">
              Expired on <span className="font-medium text-header-primary">{formatDay(expired.expiresAt)}</span>.
              {expired.purged
                ? " Everything has already been deleted."
                : expired.canDownload
                  ? ` You can download a copy of your data until ${formatDay(expired.purgeAfter)} (30 days).`
                  : " The download window has closed; this data will be purged."}
            </p>

            {notice && <p className="text-[14px] leading-[18px] text-status-online">{notice}</p>}
            {errorBlock}

            {!expired.purged && expired.canDownload && (
              <>
                {turnstile}
                <button type="button" onClick={() => void handleExport()} disabled={loading || !turnstileToken} className={PRIMARY}>
                  {loading ? spinner : "Download My Data"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("purge-confirm");
                    setError(null);
                    setNotice(null);
                    resetTurnstile();
                  }}
                  className="flex h-11 w-full items-center justify-center rounded-[3px] border border-button-danger text-[16px] font-medium text-white transition-colors hover:bg-button-danger"
                >
                  Delete Everything Now
                </button>
              </>
            )}
          </div>
        )}

        {/* PURGE CONFIRM */}
        {step === "purge-confirm" && expired && (
          <div className="space-y-4">
            <p className="rounded-[3px] bg-status-dnd/10 px-3 py-2.5 text-[14px] leading-[18px] text-text-normal">
              This is permanent. Your profile, messages, reactions, notes, saved GIFs and every other trace of this
              account will be deleted right now, with no copy kept.
            </p>
            {turnstile}
            {errorBlock}
            <button
              type="button"
              onClick={() => void handlePurge()}
              disabled={loading || !turnstileToken}
              className="flex h-11 w-full items-center justify-center rounded-[3px] bg-button-danger text-[16px] font-medium text-white transition-colors hover:bg-button-danger-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? spinner : "Yes, Delete Everything"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("expired");
                setError(null);
                resetTurnstile();
              }}
              className={SECONDARY}
            >
              Cancel
            </button>
          </div>
        )}

        {/* PURGED */}
        {step === "purged" && (
          <div className="space-y-4">
            <p className="rounded-[3px] bg-status-online/10 px-3 py-2.5 text-[14px] leading-[18px] text-text-normal">
              Done. This account number now points at nothing and can&apos;t be used to sign in again.
            </p>
            <button type="button" onClick={onClose} className={PRIMARY}>
              Back to Log In
            </button>
          </div>
        )}

        {/* Footer links, left-aligned like the login card */}
        <div className="mt-3 space-y-1 text-[14px] text-text-muted">
          {step === "form" &&
            (view === "create" ? (
              <p>
                Already have a number?{" "}
                <button type="button" onClick={() => switchView("login")} className="font-medium text-[#00a8fc] hover:underline">
                  Log In
                </button>
              </p>
            ) : (
              <p>
                Need a throwaway account?{" "}
                <button type="button" onClick={() => switchView("create")} className="font-medium text-[#00a8fc] hover:underline">
                  Create One
                </button>
              </p>
            ))}
          {step !== "purged" && (
            <p>
              <button type="button" onClick={onClose} className="font-medium text-[#00a8fc] hover:underline">
                {step === "expired" ? "Back to Log In" : "Back"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export { NewBadge };
