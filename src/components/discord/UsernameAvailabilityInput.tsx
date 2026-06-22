"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

interface UsernameAvailabilityInputProps {
  value: string;
  onChange: (value: string) => void;
  currentUsername?: string | null;
  className?: string;
  maxLength?: number;
}

export function UsernameAvailabilityInput({
  value,
  onChange,
  currentUsername,
  className = "",
  maxLength = 25,
}: UsernameAvailabilityInputProps) {
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const norm = value.trim().toLowerCase();
    const current = currentUsername?.trim().toLowerCase() ?? "";

    if (!norm) {
      setStatus("idle");
      setMessage(null);
      return;
    }

    if (norm === current) {
      setStatus("available");
      setMessage("Current username");
      return;
    }

    setStatus("checking");
    setMessage(null);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data: { session } } = await getSupabaseClient().auth.getSession();
          const res = await fetch(`/api/profile/check-username?username=${encodeURIComponent(norm)}`, {
            headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          });
          if (id !== requestId.current) return;
          const json = (await res.json()) as { available?: boolean; reason?: string };
          if (json.available) {
            setStatus("available");
            setMessage("Available");
          } else {
            setStatus(json.reason?.includes("not allowed") ? "invalid" : "taken");
            setMessage(json.reason ?? "Unavailable");
          }
        } catch {
          if (id !== requestId.current) return;
          setStatus("idle");
          setMessage(null);
        }
      })();
    }, 350);

    return () => clearTimeout(timer);
  }, [value, currentUsername]);

  const indicator = (() => {
    if (status === "checking") {
      return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />;
    }
    if (status === "available") {
      return <span className="text-status-online" aria-hidden>✓</span>;
    }
    if (status === "taken" || status === "invalid") {
      return <span className="text-status-danger" aria-hidden>✕</span>;
    }
    return <span className="inline-block h-4 w-4" aria-hidden />;
  })();

  return (
    <div>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center">
          {indicator}
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          maxLength={maxLength}
          className={`w-full rounded bg-bg-accent py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand ${className}`}
          autoComplete="username"
          spellCheck={false}
        />
      </div>
      {message && (
        <p
          className={`mt-1 text-xs ${
            status === "available" ? "text-status-online" : status === "checking" ? "text-text-muted" : "text-status-danger"
          }`}
        >
          {status === "checking" ? "Checking availability…" : message}
        </p>
      )}
    </div>
  );
}
