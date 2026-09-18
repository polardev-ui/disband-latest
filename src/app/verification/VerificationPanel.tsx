"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

export function VerificationPanel() {
  const search = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    void (async () => {
      const tokenHash = search.get("token_hash") ?? "";
      const type = search.get("type") ?? "";
      if (!tokenHash || (type !== "signup" && type !== "email" && type !== "recovery" && type !== "invite")) {
        setStatus("error");
        setMessage("This confirmation link is incomplete. Request a fresh one and try again.");
        return;
      }
      const { error } = await getSupabaseClient().auth.verifyOtp({ token_hash: tokenHash, type: type as "signup" });
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("done");
      setMessage("Email confirmed. Taking you in…");
      window.setTimeout(() => router.replace("/app"), 1200);
    })();
  }, [search, router]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      {status === "working" && <span className="h-6 w-6 animate-spin rounded-full border-2 border-text-muted/30 border-t-text-muted" />}
      {status === "done" && <span className="text-4xl">✓</span>}
      {status === "error" && <span className="text-4xl">⚠️</span>}
      <h1 className="mt-4 text-xl font-bold text-text-normal">
        {status === "done" ? "You're confirmed" : status === "error" ? "Link didn't work" : "Confirming…"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{message}</p>
      {status === "error" && (
        <Link
          href="/login"
          className="mt-5 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Back to sign in
        </Link>
      )}
    </div>
  );
}
