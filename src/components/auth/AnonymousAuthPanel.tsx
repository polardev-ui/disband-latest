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
  "w-full rounded-md border border-divider bg-bg-accent px-3.5 py-2.5 text-[15px] text-text-normal " +
  "outline-none transition-colors placeholder:text-text-muted focus:border-brand/60";

const RESTRICTIONS = [
  "Can't create servers",
  "Can't buy Disband Aero",
  "Can't accept gifts",
  "Can't create bots",
];

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
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const busyRef = useRef(false);

  function resetTurnstile() {
    setTurnstileToken(null);
    setTurnstileFailed(false);
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
          result.code === TURNSTILE_REQUIRED
            ? "Complete the verification challenge, then try again."
            : result.error,
        );
        if (result.code === TURNSTILE_REQUIRED) resetTurnstile();
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
        // Session minting failed at creation; sign in with the number instead.
        const result = await loginAnonymousAccount(createdNumber, turnstileToken);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.status === "expired") {
          openExpired(createdNumber, result);
        }
      } else {
        setError("Copy your account number first.");
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
          result.code === TURNSTILE_REQUIRED
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
          result.code === TURNSTILE_REQUIRED
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
          result.code === TURNSTILE_REQUIRED
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

  const turnstile = (
    <div className="space-y-2">
      <Turnstile
        key={turnstileKey}
        siteKey={PUBLIC_ENV.turnstileSiteKey}
        onToken={setTurnstileToken}
        onExpire={() => setTurnstileToken(null)}
        onError={() => {
          setTurnstileToken(null);
          setTurnstileFailed(true);
        }}
      />
      {turnstileFailed && (
        <p className="rounded-md border border-divider bg-bg-accent px-3.5 py-2.5 text-[13px] leading-relaxed text-text-muted">
          The verification couldn&apos;t load.{" "}
          <button
            type="button"
            className="font-medium text-brand hover:underline"
            onClick={resetTurnstile}
          >
            Retry
          </button>{" "}
          — or turn off content blockers for this page.
        </p>
      )}
    </div>
  );

  const errorBlock = error && (
    <p
      role="alert"
      className="rounded-md border border-status-dnd/30 bg-status-dnd/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-status-dnd"
    >
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

  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-overlay-scrim overlay-fade px-6 py-12 backdrop-blur-sm"
          : "relative flex app-screen items-center justify-center overflow-hidden bg-bg-tertiary px-6 py-12"
      }
      onClick={overlay ? onClose : undefined}
    >
      {!overlay && <ScatteredIcons />}
      <div
        className={
          overlay
            ? "modal-pop relative w-full max-w-[420px] rounded-2xl bg-bg-tertiary p-6 shadow-2xl"
            : "relative z-10 w-full max-w-[420px]"
        }
        onClick={overlay ? (e) => e.stopPropagation() : undefined}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo adaptive size={44} className="h-11 w-11" priority />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em] text-text-normal">{heading}</h1>
          <p className="mt-2 max-w-[21rem] text-[14px] leading-relaxed text-text-muted">{subheading}</p>
        </div>

        <div className="rounded-xl border border-divider bg-bg-secondary p-6 shadow-[0_16px_50px_-20px_rgba(0,0,0,0.8)]">
          {/* CREATE — tier picker ------------------------------------------- */}
          {step === "form" && view === "create" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {ANON_TIER_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    aria-pressed={tier === t}
                    className={
                      "rounded-md border px-3 py-2.5 text-[14px] font-medium transition-colors " +
                      (tier === t
                        ? "border-brand/70 bg-brand/10 text-text-normal"
                        : "border-divider text-text-muted hover:border-text-muted hover:bg-interactive-hover")
                    }
                  >
                    {ANON_TIERS[t].label}
                  </button>
                ))}
              </div>

              <ul className="space-y-1.5 rounded-md border border-divider bg-bg-accent px-3.5 py-3">
                {RESTRICTIONS.map((r) => (
                  <li key={r} className="flex items-center gap-2 text-[13px] text-text-muted">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-status-dnd">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    {r}
                  </li>
                ))}
              </ul>

              {turnstile}
              {errorBlock}

              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={loading}
                className="flex w-full items-center justify-center rounded-md bg-brand py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  `Create ${ANON_TIERS[tier].label} account`
                )}
              </button>
            </div>
          )}

          {/* REVEAL ---------------------------------------------------------- */}
          {step === "reveal" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-brand/40 bg-brand/[0.06] px-4 py-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Your account number</p>
                <p className="mt-2 select-all font-mono text-[22px] font-semibold tracking-[0.12em] text-text-normal">
                  {createdNumber || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyNumber()}
                className="w-full rounded-md border border-divider py-2.5 text-[14px] font-medium text-text-normal transition-colors hover:border-text-muted hover:bg-interactive-hover"
              >
                {copied ? "Copied!" : "Copy account number"}
              </button>
              <p className="rounded-md border border-status-dnd/30 bg-status-dnd/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-status-dnd">
                We can&apos;t recover this number for you. If you lose it, the account is gone.
              </p>
              {errorBlock}
              <button
                type="button"
                onClick={() => void handleRevealContinue()}
                disabled={loading}
                className="flex w-full items-center justify-center rounded-md bg-brand py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  "I've saved it — continue"
                )}
              </button>
            </div>
          )}

          {/* LOGIN ----------------------------------------------------------- */}
          {step === "form" && view === "login" && (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-text-normal">Account number</span>
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

              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={loading}
                className="flex w-full items-center justify-center rounded-md bg-brand py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  "Log in"
                )}
              </button>
            </div>
          )}

          {/* EXPIRED --------------------------------------------------------- */}
          {step === "expired" && expired && (
            <div className="space-y-4">
              <div className="rounded-md border border-divider bg-bg-accent px-3.5 py-3 text-[13px] leading-relaxed text-text-muted">
                Expired on <span className="font-medium text-text-normal">{formatDay(expired.expiresAt)}</span>.
                {expired.purged
                  ? " Everything has already been deleted."
                  : expired.canDownload
                    ? ` You can download a copy of your data until ${formatDay(expired.purgeAfter)} (30 days).`
                    : " The download window has closed; this data will be purged."}
              </div>

              {notice && (
                <p className="rounded-md border border-status-online/25 bg-status-online/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-text-normal">
                  {notice}
                </p>
              )}
              {errorBlock}

              {!expired.purged && expired.canDownload && (
                <>
                  {turnstile}
                  <button
                    type="button"
                    onClick={() => void handleExport()}
                    disabled={loading}
                    className="flex w-full items-center justify-center rounded-md bg-brand py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      "Download my data"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("purge-confirm");
                      setError(null);
                      setNotice(null);
                      resetTurnstile();
                    }}
                    className="w-full rounded-md border border-divider py-2.5 text-[14px] font-medium text-status-dnd transition-colors hover:border-status-dnd/50 hover:bg-status-dnd/10"
                  >
                    Deny the copy — delete everything now
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-md py-2 text-[14px] font-medium text-text-muted transition-colors hover:text-text-normal"
              >
                Back to sign in
              </button>
            </div>
          )}

          {/* PURGE CONFIRM --------------------------------------------------- */}
          {step === "purge-confirm" && expired && (
            <div className="space-y-4">
              <p className="rounded-md border border-status-dnd/30 bg-status-dnd/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-status-dnd">
                This is permanent. Your profile, messages, reactions, notes, saved GIFs and every
                other trace of this account will be deleted right now, with no copy kept.
              </p>
              {turnstile}
              {errorBlock}
              <button
                type="button"
                onClick={() => void handlePurge()}
                disabled={loading}
                className="flex w-full items-center justify-center rounded-md bg-status-dnd py-2.5 text-[15px] font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  "Yes, delete everything permanently"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("expired");
                  setError(null);
                  resetTurnstile();
                }}
                className="w-full rounded-md border border-divider py-2.5 text-[14px] font-medium text-text-normal transition-colors hover:border-text-muted hover:bg-interactive-hover"
              >
                Cancel
              </button>
            </div>
          )}

          {/* PURGED ---------------------------------------------------------- */}
          {step === "purged" && (
            <div className="space-y-4">
              <p className="rounded-md border border-status-online/25 bg-status-online/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-text-normal">
                Done. This account number now points at nothing. It can&apos;t be used to sign in
                again.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-md bg-brand py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover"
              >
                Back to sign in
              </button>
            </div>
          )}
        </div>

        {step === "form" && (
          <p className="mt-6 text-center text-[14px] text-text-muted">
            {view === "create" ? (
              <>
                Already have a number?{" "}
                <button
                  type="button"
                  onClick={() => switchView("login")}
                  className="font-medium text-text-normal transition-colors hover:text-brand"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                Need a throwaway account?{" "}
                <button
                  type="button"
                  onClick={() => switchView("create")}
                  className="font-medium text-text-normal transition-colors hover:text-brand"
                >
                  Create one
                </button>
              </>
            )}
          </p>
        )}

        <p className="mt-4 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-text-muted transition-colors hover:text-text-normal"
          >
            Back
          </button>
        </p>
      </div>
    </div>
  );
}

export { NewBadge };
