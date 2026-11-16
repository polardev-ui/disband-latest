"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

/*
 Where the "Authorise this IP address" email link lands. The token is in the
 URL's #fragment, so it never reaches a server log or a Referer header; it's
 read here and posted to /api/auth/authorize-ip.
*/
export default function AuthorizeIpPage() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    // Out of the address bar, so a screenshot or shared URL doesn't carry it.
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setState("error");
      setMessage("This link isn't valid. Sign in again to get a new one.");
      return;
    }
    void (async () => {
      try {
        const res = await apiFetch("/api/auth/authorize-ip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (res.ok && json?.ok) {
          setState("done");
        } else {
          setState("error");
          setMessage(json?.error ?? "Couldn't authorise it. Try again.");
        }
      } catch {
        setState("error");
        setMessage("Couldn't reach Disband. Check your connection and try again.");
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-tertiary px-4 text-text-normal">
      <div className="flex w-full max-w-[720px] overflow-hidden rounded-2xl border border-white/5 bg-bg-secondary shadow-2xl max-sm:flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 border-white/5 p-10 sm:border-r max-sm:border-b">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-24 w-24 rounded-[28%]" />
          <span className="text-3xl font-extrabold tracking-tight text-header-primary">Disband</span>
        </div>
        <div className="flex flex-[1.4] flex-col items-center justify-center gap-3 p-10 text-center">
          {state === "working" && (
            <>
              <span className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-brand" />
              <h1 className="text-xl font-bold text-header-primary">Authorising…</h1>
            </>
          )}
          {state === "done" && (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-status-online text-white">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <h1 className="text-xl font-bold text-header-primary">IP address authorised</h1>
              <p className="text-text-muted">You can sign in from it now. Close this page, or sign in again.</p>
              <a href="/app" className="mt-4 text-sm font-medium text-text-link hover:underline">Go to sign-in</a>
            </>
          )}
          {state === "error" && (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-status-dnd text-2xl font-bold text-white">!</span>
              <h1 className="text-xl font-bold text-header-primary">Couldn&apos;t authorise it</h1>
              <p className="text-text-muted">{message}</p>
              <a href="/app" className="mt-4 text-sm font-medium text-text-link hover:underline">Go to sign-in</a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
