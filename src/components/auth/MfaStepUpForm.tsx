"use client";

import { useEffect, useState } from "react";
import {
  factorLabel,
  listVerifiedMfaFactors,
  verifyPasskeyChallenge,
  verifyTotpChallenge,
  type MfaFactor,
} from "@/lib/mfa";

export function MfaStepUpForm({ onVerified }: { onVerified: () => void }) {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFactors, setLoadingFactors] = useState(true);

  useEffect(() => {
    void (async () => {
      const list = await listVerifiedMfaFactors();
      setFactors(list);
      setSelectedFactorId(list.find((f) => f.factor_type === "totp")?.id ?? list[0]?.id ?? "");
      setLoadingFactors(false);
    })();
  }, []);

  const totpFactors = factors.filter((f) => f.factor_type === "totp");
  const passkeyFactors = factors.filter((f) => f.factor_type === "webauthn");

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFactorId) return;
    setLoading(true);
    setError(null);
    const err = await verifyTotpChallenge(selectedFactorId, code);
    setLoading(false);
    if (err) { setError(err); return; }
    onVerified();
  }

  async function usePasskey(factorId: string) {
    setLoading(true);
    setError(null);
    const err = await verifyPasskeyChallenge(factorId);
    setLoading(false);
    if (err) { setError(err); return; }
    onVerified();
  }

  if (loadingFactors) {
    return <p className="py-4 text-center text-sm text-text-muted">Loading…</p>;
  }

  if (factors.length === 0) {
    return (
      <p className="rounded border border-status-dnd/40 bg-status-dnd/10 px-3 py-2.5 text-sm text-status-dnd">
        This account has two-factor authentication enabled, but no working method is
        registered. Contact support to recover it.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded border border-divider bg-bg-accent px-3 py-2.5 text-sm text-text-muted">
        This account uses two-factor authentication. Confirm it&apos;s you before
        setting a new password.
      </p>

      {totpFactors.length > 0 && (
        <form onSubmit={submitTotp} className="space-y-4">
          {totpFactors.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Authenticator</span>
              <select
                value={selectedFactorId}
                onChange={(e) => setSelectedFactorId(e.target.value)}
                className="w-full rounded bg-bg-accent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand"
              >
                {totpFactors.map((factor) => (
                  <option key={factor.id} value={factor.id}>{factorLabel(factor)}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Authentication code</span>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded bg-bg-accent px-3 py-2.5 text-center text-lg tracking-[0.35em] outline-none focus:ring-2 focus:ring-brand"
              placeholder="000000"
            />
          </label>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {loading ? "…" : "Verify code"}
          </button>
        </form>
      )}

      {passkeyFactors.length > 0 && (
        <div className={totpFactors.length > 0 ? "space-y-2" : "space-y-2"}>
          {totpFactors.length > 0 && (
            <p className="text-center text-xs uppercase tracking-wide text-text-muted">or</p>
          )}
          {passkeyFactors.map((factor) => (
            <button
              key={factor.id}
              type="button"
              disabled={loading}
              onClick={() => void usePasskey(factor.id)}
              className="w-full rounded border border-divider bg-bg-accent py-2.5 text-sm font-semibold text-text-normal hover:bg-interactive-hover disabled:opacity-50"
            >
              {loading ? "…" : `Use ${factorLabel(factor)}`}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-status-dnd">{error}</p>}
    </div>
  );
}
