"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";

export function AuthScreen() {
  const { signIn, signUp, configured } = useApp();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!configured) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-tertiary p-6">
        <div className="max-w-md rounded-lg bg-bg-secondary p-8 text-center">
          <h1 className="text-2xl font-bold text-text-normal">Disband</h1>
          <p className="mt-3 text-sm text-text-muted">
            Copy <code className="text-brand">.env.example</code> to{" "}
            <code className="text-brand">.env.local</code> and add your Supabase URL + anon key, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err =
      mode === "login"
        ? await signIn(email, password)
        : await signUp(email, password, username);
    if (err) setError(err);
    setLoading(false);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg-tertiary p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-bg-secondary p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[30%] bg-brand text-2xl font-black text-white">
            D
          </div>
          <h1 className="text-2xl font-bold text-text-normal">
            {mode === "login" ? "Welcome back!" : "Create an account"}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {mode === "login" ? "We're so excited to see you again!" : "Join Disband today"}
          </p>
        </div>

        {mode === "signup" && (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Username</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded bg-bg-accent px-3 py-2.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
              pattern="[a-zA-Z0-9_]{2,32}"
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

        {error && <p className="mb-3 text-sm text-status-dnd">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-white transition-all duration-150 ease-in-out hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? "..." : mode === "login" ? "Log In" : "Continue"}
        </button>

        <p className="mt-4 text-center text-sm text-text-muted">
          {mode === "login" ? "Need an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-text-link hover:underline"
          >
            {mode === "login" ? "Register" : "Log in"}
          </button>
        </p>
      </form>
    </div>
  );
}
