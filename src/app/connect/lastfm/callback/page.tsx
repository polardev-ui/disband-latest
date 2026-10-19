"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchLastfmSession, writeLastfmPending } from "@/lib/music-presence";

function CallbackInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Connecting Last.fm…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMessage("Last.fm didn't send an authorization token. Try again from settings.");
      return;
    }
    void (async () => {
      try {
        const username = await fetchLastfmSession(token);
        // The settings modal may or may not still be open: the message wakes
        // it now, and the stashed username lets it adopt the account on its
        // next open if it was closed in the meantime.
        writeLastfmPending(username);
        try {
          window.opener?.postMessage(
            { type: "disband:lastfm-connected", username },
            window.location.origin,
          );
        } catch {
          // Cross-origin opener: harmless.
        }
        setState("done");
        setMessage(`Connected as ${username}. You can close this tab.`);
      } catch {
        setState("error");
        setMessage("Could not finish connecting Last.fm. Try again from settings.");
      }
    })();
  }, [params]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-sm rounded-[8px] border border-divider bg-bg-secondary p-8 text-center">
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

export default function LastfmCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
