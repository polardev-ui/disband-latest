"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CURRENCY, adReward } from "@/lib/currency";

/*
 Plays one rewarded video ad (VAST, through Google's IMA SDK, which works
 with any VAST network). This page never pays anything: the network's
 signed server callback does (api/rewards/ad/verify). It only shows what the
 ad should be worth.
*/

declare global {
  interface Window { google?: { ima: any } } // eslint-disable-line @typescript-eslint/no-explicit-any
}

function loadIma(): Promise<void> {
  if (window.google?.ima) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The ad player could not load (an ad blocker?)."));
    document.head.appendChild(s);
  });
}

export default function RewardedAdPage() {
  const slot = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => () => { /* IMA tears itself down with the page */ }, []);

  async function start() {
    setState("loading");
    setMessage("");
    try {
      const res = await apiFetch("/api/rewards/ad/start", { method: "POST" });
      const json = (await res.json()) as { adTagUrl?: string; error?: string };
      if (!res.ok || !json.adTagUrl) throw new Error(json.error ?? "No ad is available right now.");
      await loadIma();
      const ima = window.google!.ima;
      const display = new ima.AdDisplayContainer(slot.current, video.current);
      display.initialize();
      const loader = new ima.AdsLoader(display);
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { setState("error"); setMessage("The ad didn't load. Try again in a minute."); });
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const manager = e.getAdsManager(video.current);
        manager.addEventListener(ima.AdEvent.Type.STARTED, (ev: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          setSeconds(Math.round(ev.getAd()?.getDuration?.() ?? 0));
          setState("playing");
        });
        manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => setState("done"));
        manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { setState("error"); setMessage("The ad stopped early."); });
        manager.init(640, 360, ima.ViewMode.NORMAL);
        manager.start();
      });
      const request = new ima.AdsRequest();
      request.adTagUrl = json.adTagUrl;
      request.linearAdSlotWidth = 640;
      request.linearAdSlotHeight = 360;
      loader.requestAds(request);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg-tertiary p-6 text-text-normal">
      <h1 className="text-2xl font-bold text-header-primary">Watch an ad, earn {CURRENCY.plural}</h1>
      <p className="max-w-md text-center text-[15px] text-text-muted">
        Watch to the end and your {CURRENCY.plural} land in your wallet once the ad network confirms the view.
        {seconds > 0 && ` This one is ${seconds}s: about ${adReward(seconds)} ${CURRENCY.plural}.`}
      </p>
      <div className="relative aspect-video w-full max-w-[640px] overflow-hidden rounded-lg bg-black">
        <video ref={video} className="h-full w-full" playsInline muted />
        <div ref={slot} className="absolute inset-0" />
      </div>
      {state === "idle" && <button type="button" onClick={() => void start()} className="rounded-[3px] bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-hover">Start the ad</button>}
      {state === "loading" && <p className="text-text-muted">Loading an ad…</p>}
      {state === "done" && <p className="text-status-online">Thanks for watching. Your {CURRENCY.plural} arrive in a moment.</p>}
      {state === "error" && <p className="text-status-dnd">{message}</p>}
      <Link href="/app" className="text-[14px] text-text-link hover:underline">Back to Disband</Link>
    </main>
  );
}
