"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { AD_REWARD, CURRENCY } from "@/lib/currency";

/*
 Plays one rewarded video ad through AppLixir's player. This page never pays
 anything: AppLixir's signed server callback does (api/rewards/ad/verify),
 matched to the view by the id passed as userId.
*/

const SDK = "https://cdn.applixir.com/applixir.app.v6.1.0.js";

interface AdStatus { type: string }
declare global {
  interface Window {
    initializeAndOpenPlayer?: (options: {
      apiKey: string;
      injectionElementId: string;
      userId?: string;
      adStatusCallbackFn?: (status: AdStatus) => void;
      adErrorCallbackFn?: (error: unknown) => void;
    }) => void;
  }
}

function loadSdk(): Promise<void> {
  if (window.initializeAndOpenPlayer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The ad player could not load (an ad blocker?)."));
    document.head.appendChild(s);
  });
}

export default function RewardedAdPage() {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function start() {
    setState("loading");
    setMessage("");
    try {
      const res = await apiFetch("/api/rewards/ad/start", { method: "POST" });
      const json = (await res.json()) as { viewId?: string; apiKey?: string; error?: string };
      if (res.status === 401) throw new Error("Sign in to Disband in this browser first, then come back to this page.");
      if (!res.ok || !json.viewId || !json.apiKey) throw new Error(json.error ?? "No ad is available right now.");
      await loadSdk();
      window.initializeAndOpenPlayer!({
        apiKey: json.apiKey,
        injectionElementId: "applixir-ad-container",
        userId: json.viewId,
        adStatusCallbackFn: (status) => {
          if (status.type === "started") setState("playing");
          else if (status.type === "complete") setState("done");
          else if (status.type === "consentDeclined") {
            setState("error");
            setMessage("Ads need your agreement to play. You can still earn Glimmers by chatting.");
          } else if (status.type === "skipped" || status.type === "manuallyEnded") {
            setState("error");
            setMessage("The ad was closed early, so it doesn't count.");
          } else if (status.type === "allAdsCompleted") {
            setState((s) => {
              if (s === "loading") setMessage("No ad is available right now. Try again later.");
              return s === "loading" ? "error" : s;
            });
          }
        },
        adErrorCallbackFn: () => {
          setState("error");
          setMessage("The ad didn't load. Try again in a minute.");
        },
      });
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg-tertiary p-6 text-text-normal">
      <h1 className="text-2xl font-bold text-header-primary">Watch an ad, earn {CURRENCY.plural}</h1>
      <p className="max-w-md text-center text-[15px] text-text-muted">
        Watch to the end and {AD_REWARD} {CURRENCY.plural} land in your wallet once the ad network confirms the view.
      </p>
      <div id="applixir-ad-container" className="w-full max-w-[640px]" />
      {(state === "idle" || state === "error") && (
        <button type="button" onClick={() => void start()} className="rounded-[3px] bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-hover">
          {state === "idle" ? "Start the ad" : "Try again"}
        </button>
      )}
      {state === "loading" && <p className="text-text-muted">Loading an ad…</p>}
      {state === "done" && <p className="text-status-online">Thanks for watching. Your {CURRENCY.plural} arrive in a moment.</p>}
      {state === "error" && <p className="text-status-dnd">{message}</p>}
      <Link href="/app" className="text-[14px] text-text-link hover:underline">Back to Disband</Link>
    </main>
  );
}
