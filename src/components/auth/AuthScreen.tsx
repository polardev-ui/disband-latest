"use client";

import { useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { isTauri } from "@/lib/platform";
import { PUBLIC_ENV } from "@/lib/public-env";
import { Logo } from "@/components/ui/Logo";
import { Turnstile } from "@/components/ui/Turnstile";

type AuthMode = "login" | "signup" | "reset";

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
  const submittingRef = useRef(false);
  const webOnly = !isTauri();

  if (!configured) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-tertiary p-6">
        <div className="max-w-md rounded-lg bg-bg-secondary p-8 text-center">
          <h1 className="text-2xl font-bold text-text-normal">Disband</h1>
          <p className="mt-3 text-sm text-text-muted">
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

    const token = turnstileToken ?? undefined;

    if (mode === "login") {
      const err = await signIn(email, password, token);
      if (err) setError(err);
    } else if (mode === "reset") {
      const err = await requestPasswordReset(email, token);
      if (err) {
        setError(err);
      } else {
        setSuccess(
          `If an account exists for ${email.trim()}, we sent a password reset link. Check your inbox and spam folder.`,
        );
      }
    } else {
      const result = await signUp(email, password, username, token);
      if (result.error) {
        setError(result.error);
      } else if (result.needsEmailConfirmation !== false) {
        setSuccess(
          `Check your email to verify your account. We sent a link to ${email.trim()} — then log in at /login.`,
        );
      }
    }

    setLoading(false);
    submittingRef.current = false;
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setSuccess(null);
    setTurnstileToken(null);
  }

  const title =
    success
      ? "Check your email"
      : mode === "login"
        ? "Welcome back!"
        : mode === "reset"
          ? "Reset your password"
          : "Create an account";

  const subtitle =
    success
      ? mode === "reset"
        ? "Use the link in your email to choose a new password"
        : "Verify your email to finish signing up"
      : mode === "login"
        ? "We're so excited to see you again!"
        : mode === "reset"
          ? "We'll email you a link to choose a new password"
          : "Join Disband today";

  return (
    <div className="flex h-screen items-center justify-center bg-bg-tertiary p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-bg-secondary p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <Logo size={56} className="h-14 w-14" priority />
          </div>
          <h1 className="text-2xl font-bold text-text-normal">{title}</h1>
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        </div>

        {success ? (
          <div className="mb-4 space-y-3">
            <p className="rounded-lg border border-status-online/30 bg-status-online/10 px-3 py-3 text-sm leading-relaxed text-text-normal">
              {success}
            </p>
            {mode !== "reset" && (
              <p className="text-center text-xs text-text-muted">
                After verifying, come back here and log in with your email and password.
              </p>
            )}
          </div>
        ) : (
          <>
            {mode === "signup" && (
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Username</span>
                <input
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.slice(0, 25))}
                  maxLength={25}
                  className="w-full rounded bg-bg-accent px-3 py-2.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
                  pattern="[a-zA-Z0-9_]{2,25}"
                />
              </label>
            )}

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded bg-bg-accent px-3 py-2.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
              />
            </label>

            {mode !== "reset" && (
              <label className="mb-4 block">
                <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Password</span>
                <input
                  required
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded bg-bg-accent px-3 py-2.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
            )}

            {mode === "login" && (
              <div className="mb-4 text-right">
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  className="text-sm text-text-link hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </>
        )}

        {!success && webOnly && (
          <Turnstile
            siteKey={PUBLIC_ENV.turnstileSiteKey}
            onToken={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
            className="mb-3"
          />
        )}

        {error && <p className="mb-3 text-sm text-status-dnd">{error}</p>}

        {!success && (
          <button
            type="submit"
            disabled={loading || (webOnly && !turnstileToken)}
            className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-white transition-all duration-150 ease-in-out hover:bg-brand-hover disabled:opacity-50"
          >
            {loading
              ? "..."
              : mode === "login"
                ? "Log In"
                : mode === "reset"
                  ? "Send reset link"
                  : "Continue"}
          </button>
        )}

        {success ? (
          <button
            type="button"
            onClick={() => switchMode("login")}
            className="mt-4 w-full rounded bg-interactive-hover py-2.5 text-sm font-semibold text-text-normal"
          >
            Back to log in
          </button>
        ) : mode === "reset" ? (
          <p className="mt-4 text-center text-sm text-text-muted">
            Remember your password?{" "}
            <button type="button" onClick={() => switchMode("login")} className="text-text-link hover:underline">
              Log in
            </button>
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-text-muted">
            {mode === "login" ? "Need an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
              className="text-text-link hover:underline"
            >
              {mode === "login" ? "Register" : "Log in"}
            </button>
          </p>
        )}
      </form>
    </div>
  );
}
