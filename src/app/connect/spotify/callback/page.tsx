"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { exchangeSpotifyCode } from "@/lib/music-presence";

function CallbackInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Connecting Spotify…");

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");
    if (error) {
      setState("error");
      setMessage("Spotify connection was cancelled.");
      return;
    }
    if (!code) {
      setState("error");
      setMessage("No authorization code from Spotify.");
      return;
    }
    void (async () => {
      try {
        const tokens = await exchangeSpotifyCode(code);
        try {
          window.localStorage.setItem("disband:spotify-tokens", JSON.stringify(tokens));
        } catch {
          // Private mode etc: connection just won't persist.
        }
        setState("done");
        setMessage("Spotify connected! You can close this tab.");
        // Tell the opener (settings) to pick it up immediately.
        try {
          window.opener?.postMessage({ type: "disband:spotify-connected" }, window.location.origin);
        } catch {
          // Cross-origin opener: harmless.
        }
      } catch {
        setState("error");
        setMessage("Could not finish connecting Spotify. Try again from settings.");
      }
    })();
  }, [params]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-sm rounded-2xl border border-divider bg-bg-secondary p-8 text-center">
        <p className="text-lg font-semibold text-text-normal">
          {state === "done" ? "Connected ✓" : state === "error" ? "Something went wrong" : "Connecting…"}
        </p>
        <p className="mt-2 text-sm text-text-muted">{message}</p>
        {state !== "working" && (
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Close this tab
          </button>
        )}
      </div>
    </main>
  );
}

export default function SpotifyCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
