"use client";

import { useState, useEffect, useCallback } from "react";
import { MarketingFooter, MarketingNav } from "@/components/marketing/MarketingLayout";

type CheckState = "checking" | "up" | "down";

interface StatusCheck {
  name: string;
  description: string;
  state: CheckState;
  latencyMs?: number;
}

async function pingEndpoint(url: string, timeoutMs = 8000): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return { ok: res.ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

const CHECKS = [
  { name: "API", description: "Core API server", url: "/api/status" },
  { name: "App", description: "Web application", url: "/app" },
  { name: "Auth", description: "Authentication service", url: "/" },
  { name: "Marketing", description: "Marketing site", url: "/" },
  { name: "CDN", description: "Static assets & media", url: "/logo.png" },
];

function StatusDot({ state }: { state: CheckState }) {
  const colors: Record<CheckState, string> = {
    checking: "bg-yellow-500 animate-pulse",
    up: "bg-green-500",
    down: "bg-red-500 animate-pulse",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[state]}`} />;
}

function StatusCard({ check }: { check: StatusCheck }) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-[#2b2d31] px-5 py-4 ring-1 ring-white/5">
      <StatusDot state={check.state} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{check.name}</p>
        <p className="text-xs text-[#949ba4]">{check.description}</p>
      </div>
      <span className="text-xs tabular-nums text-[#949ba4]">
        {check.state === "checking"
          ? "Checking..."
          : check.state === "up"
          ? `${check.latencyMs}ms`
          : "Unreachable"}
      </span>
    </div>
  );
}

export default function StatusPage() {
  const [checks, setChecks] = useState<StatusCheck[]>(() =>
    CHECKS.map((c) => ({ ...c, state: "checking" })),
  );
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runChecks = useCallback(async () => {
    const results = await Promise.all(
      CHECKS.map(async (c) => {
        const { ok, ms } = await pingEndpoint(c.url);
        return { ...c, state: (ok ? "up" : "down") as CheckState, latencyMs: ms };
      }),
    );
    setChecks(results);
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    void runChecks();
    const id = setInterval(() => void runChecks(), 30_000);
    return () => clearInterval(id);
  }, [runChecks]);

  const allUp = checks.every((c) => c.state === "up");
  const anyDown = checks.some((c) => c.state === "down");
  const checking = checks.some((c) => c.state === "checking");

  return (
    <div className="min-h-screen bg-[#1e1f22] text-[#dbdee1]">
      <MarketingNav />
      <main className="mx-auto max-w-xl px-6 pb-16 pt-24">
        <h1 className="text-3xl font-bold text-white">Disband Status</h1>
        <p className="mt-2 text-sm text-[#949ba4]">
          Real-time checks across Disband services
        </p>

        <div className="mt-8 space-y-3">
          {checks.map((c) => (
            <StatusCard key={c.name} check={c} />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-[#949ba4]">
          {!checking && (
            <span className={allUp ? "text-green-400" : anyDown ? "text-red-400" : ""}>
              {allUp ? "All systems operational" : anyDown ? "Some systems degraded" : ""}
            </span>
          )}
          <span>
            {lastChecked && `Last checked: ${lastChecked.toLocaleTimeString()}`}
          </span>

          <button
            type="button"
            onClick={() => void runChecks()}
            className="rounded bg-[#2b2d31] px-3 py-1 text-xs text-white transition-colors hover:bg-[#383a40]"
          >
            Refresh
          </button>
        </div>

        <p className="mt-12 text-center text-xs text-[#949ba4]">
          Checks run automatically every 30 seconds. If you are experiencing issues not shown here,
          please{" "}
          <a href="/bug-report" className="text-brand underline underline-offset-2">
            report a bug
          </a>
          .
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
