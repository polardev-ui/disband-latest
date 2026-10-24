"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { exchangeSpotifyCode } from "@/lib/music-presence";

function CallbackInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "manual" | "error">("working");
  const [message, setMessage] = useState("Connecting Spotify…");
  const [copied, setCopied] = useState(false);

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
      setMessage("No authorisation code from Spotify.");
      return;
    }
    // No opener means this landed in the system browser — the desktop app's
    // flow. Don't burn the single-use code here; hand it back instead.
    if (!window.opener) {
      setState("manual");
      setMessage("Copy this code into Disband to finish connecting.");
      return;
    }
    void (async () => {
      try {
        // The server stores the tokens against the signed-in account, so the
        // connection follows the user to the desktop app and other devices.
        await exchangeSpotifyCode(code);
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

  const code = params.get("code") ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6">
      <div className="w-full max-w-sm rounded-[8px] border border-divider bg-bg-secondary p-8 text-center">
        <p className="text-lg font-semibold text-text-normal">
          {state === "done"
            ? "Connected ✓"
            : state === "error"
              ? "Something went wrong"
              : state === "manual"
                ? "Almost there"
                : "Connecting…"}
        </p>
        <p className="mt-2 text-sm text-text-muted">{message}</p>
        {state === "manual" && (
          <div className="mt-4 space-y-3">
            <code className="block break-all rounded-[4px] border border-divider bg-bg-tertiary px-3 py-2 text-left font-mono text-[13px] text-text-normal">
              {code}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(code).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  },
                  () => setCopied(false),
                );
              }}
              className="w-full rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            <p className="text-[13px] leading-relaxed text-text-muted">
              In Disband: Settings → Connections → Connect Spotify → paste the code. It
              expires in a few minutes.
            </p>
          </div>
        )}
        {state !== "working" && state !== "manual" && (
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-6 rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
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
