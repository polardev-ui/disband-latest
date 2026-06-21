"use client";

import { useState } from "react";

export function MobileWaitlistScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/mobile-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong.");
        return;
      }

      setStatus("success");
      setMessage(data.message ?? "You are on the list!");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg-tertiary px-6 py-10 text-text-normal">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-black text-white">
            D
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Disband is desktop-only for now</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
            We are not prepared for mobile browsers yet. Disband is built for desktop web and our native apps.
            When mobile is ready, we will email everyone on the waitlist.
          </p>
        </div>

        <div className="rounded-xl border border-black/20 bg-bg-secondary p-5 shadow-lg">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Join the waitlist</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Get notified when Disband launches on the App Store — and soon on Google Play.
          </p>

          {status === "success" ? (
            <p className="mt-4 rounded-lg bg-status-online/15 px-4 py-3 text-sm font-medium text-status-online">
              {message}
            </p>
          ) : (
            <form onSubmit={subscribe} className="mt-4 space-y-3">
              <label className="block">
                <span className="sr-only">Email</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={status === "loading"}
                  className="w-full rounded-lg border border-black/20 bg-bg-accent px-4 py-3 text-[16px] text-text-normal placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                />
              </label>
              <button
                type="submit"
                disabled={status === "loading" || !email.trim()}
                className="w-full rounded-lg bg-brand py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {status === "loading" ? "Subscribing…" : "Notify me when it is ready"}
              </button>
            </form>
          )}

          {status === "error" && message && (
            <p className="mt-3 text-sm text-status-dnd">{message}</p>
          )}
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-text-muted">
          On a computer? Open this site in a desktop browser for the full Disband experience.
        </p>
      </div>
    </div>
  );
}
