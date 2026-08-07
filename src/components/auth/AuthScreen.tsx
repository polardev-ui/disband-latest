"use client";

import { useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { isTauri } from "@/lib/platform";
import { PUBLIC_ENV } from "@/lib/public-env";
import { Logo } from "@/components/ui/Logo";
import { Turnstile } from "@/components/ui/Turnstile";

type AuthMode = "login" | "signup" | "reset";

/** Shared input chrome — a quiet field that lights up on focus. */
const fieldClass =
  "w-full rounded-md border border-divider bg-bg-accent px-3.5 py-2.5 text-[15px] text-text-normal " +
  "outline-none transition-colors placeholder:text-text-muted " +
  "focus:border-brand/60 focus:bg-bg-accent";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-text-normal">{label}</span>
        {hint}
      </span>
      {children}
    </label>
  );
}

export function AuthScreen() {
  const { signIn, signUp, requestPasswordReset, configured } = useApp();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const submittingRef = useRef(false);
  const webOnly = !isTauri();

  if (!configured) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-tertiary p-6">
        <div className="max-w-md rounded-lg border border-divider bg-bg-secondary p-8 text-center">
          <h1 className="text-xl font-semibold text-text-normal">Disband</h1>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            {isTauri()
              ? "This build is missing Supabase configuration. Rebuild the desktop app with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set."
              : "Copy .env.example to .env.local and add your Supabase URL + anon key, then restart the dev server."}
          </p>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || success) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (mode === "login") {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else if (mode === "reset") {
      const err = await requestPasswordReset(email);
      if (err) {
        setError(err);
      } else {
        setSuccess(
          `If an account exists for ${email.trim()}, we sent a password reset link. Check your inbox and spam folder.`,
        );
      }
    } else {
      const sanitized = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (sanitized.length < 2) {
        setError("Username must be at least 2 characters (letters, numbers, and underscores).");
      } else {
        const result = await signUp(email, password, username);
        if (result.error) {
          setError(result.error);
        } else if (result.needsEmailConfirmation !== false) {
          setSuccess(
            `Check your email to verify your account. We sent a link to ${email.trim()} — then log in at /login.`,
          );
        }
      }
    }

    // Turnstile tokens are single-use — remount the widget after every attempt.
    setTurnstileToken(null);
    setTurnstileFailed(false);
    setTurnstileKey((k) => k + 1);
    setLoading(false);
    submittingRef.current = false;
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setSuccess(null);
    setTurnstileToken(null);
    setTurnstileFailed(false);
    setTurnstileKey((k) => k + 1);
  }

  const title = success
    ? "Check your email"
    : mode === "login"
      ? "Sign in to Disband"
      : mode === "reset"
        ? "Reset your password"
        : "Create your account";

  const subtitle = success
    ? mode === "reset"
      ? "Use the link we sent to choose a new password."
      : "Verify your email address to finish signing up."
    : mode === "login"
      ? "Your servers, messages, and calls — on every device."
      : mode === "reset"
        ? "We'll email you a link to choose a new one."
        : "Free to join. No card required.";

  const submitLabel =
    mode === "login" ? "Sign in" : mode === "reset" ? "Send reset link" : "Create account";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-tertiary px-6 py-12">
      <div className="w-full max-w-[400px]">
        {/* Mark sits outside the card so the card reads as a single input surface. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo adaptive size={44} className="h-11 w-11" priority />
          <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.02em] text-text-normal">{title}</h1>
          <p className="mt-2 max-w-[19rem] text-[15px] leading-relaxed text-text-muted">{subtitle}</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-xl border border-divider bg-bg-secondary p-6 shadow-[0_16px_50px_-20px_rgba(0,0,0,0.8)]"
        >
          {success ? (
            <div className="space-y-4">
              <p className="rounded-md border border-status-online/25 bg-status-online/[0.08] px-3.5 py-3 text-[14px] leading-relaxed text-text-normal">
                {success}
              </p>
              {mode !== "reset" && (
                <p className="text-[13px] leading-relaxed text-text-muted">
                  Once verified, come back here and sign in with your email and password.
                </p>
              )}
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="w-full rounded-md border border-divider py-2.5 text-[15px] font-medium text-text-normal transition-colors hover:border-text-muted hover:bg-interactive-hover"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {mode === "signup" && (
                <Field label="Username">
                  <input
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.slice(0, 25))}
                    maxLength={25}
                    autoComplete="username"
                    placeholder="nova_reyes"
                    className={fieldClass}
                  />
                </Field>
              )}

              <Field label="Email">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={fieldClass}
                />
              </Field>

              {mode !== "reset" && (
                <Field
                  label="Password"
                  hint={
                    mode === "login" ? (
                      <button
                        type="button"
                        onClick={() => switchMode("reset")}
                        className="text-[13px] text-text-muted transition-colors hover:text-text-normal"
                      >
                        Forgot?
                      </button>
                    ) : undefined
                  }
                >
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                    className={fieldClass}
                  />
                </Field>
              )}

              {webOnly && !turnstileFailed && (
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
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-status-dnd/30 bg-status-dnd/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-status-dnd"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || (webOnly && !turnstileToken && !turnstileFailed)}
                className="flex w-full items-center justify-center rounded-md bg-brand py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  submitLabel
                )}
              </button>
            </div>
          )}
        </form>

        {!success && (
          <p className="mt-6 text-center text-[14px] text-text-muted">
            {mode === "reset" ? (
              <>
                Remembered it?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-text-normal transition-colors hover:text-brand"
                >
                  Sign in
                </button>
              </>
            ) : mode === "login" ? (
              <>
                New to Disband?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="font-medium text-text-normal transition-colors hover:text-brand"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-text-normal transition-colors hover:text-brand"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
