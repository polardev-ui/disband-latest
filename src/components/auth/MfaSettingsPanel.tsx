"use client";

import { useCallback, useEffect, useState } from "react";
import {
  completeTotpEnrollment,
  factorLabel,
  listAllMfaFactors,
  startTotpEnrollment,
  totpQrSrc,
  unenrollMfaFactor,
  type MfaFactor,
  type TotpEnrollment,
} from "@/lib/mfa";

export function MfaSettingsPanel() {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TotpEnrollment | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await listAllMfaFactors();
    setFactors(result.factors);
    if (result.error) setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function beginTotpSetup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await startTotpEnrollment();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTotpSetup(result.data);
    setTotpCode("");
    void reload();
  }

  async function confirmTotpSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!totpSetup) return;
    setBusy(true);
    setError(null);
    const err = await completeTotpEnrollment(totpSetup.factorId, totpCode);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setTotpSetup(null);
    setTotpCode("");
    setMessage("Authenticator app enabled.");
    void reload();
  }

  async function removeFactor(factorId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const err = await unenrollMfaFactor(factorId);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMessage("Security method removed.");
    void reload();
  }

  const verified = factors.filter((f) => f.status === "verified");
  const pending = factors.filter((f) => f.status !== "verified");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-normal">Two-factor authentication</h3>
        <p className="mt-1 text-sm text-text-muted">
          Add an authenticator app or passkey. After setup, sign-in requires your password plus a code or passkey.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading security methods…</p>
      ) : (
        <div className="space-y-2">
          {verified.length === 0 && pending.length === 0 && (
            <p className="rounded-lg border border-divider bg-bg-secondary px-4 py-3 text-sm text-text-muted">
              No two-factor methods are enabled yet.
            </p>
          )}
          {[...verified, ...pending].map((factor) => (
            <div
              key={factor.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-divider bg-bg-secondary px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text-normal">{factorLabel(factor)}</p>
                <p className="text-xs text-text-muted">
                  {factor.factor_type === "totp"
                    ? "Authenticator app"
                    : factor.factor_type === "webauthn"
                      ? "Passkey"
                      : factor.factor_type}
                  {factor.status !== "verified" ? " · setup incomplete" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeFactor(factor.id)}
                className="shrink-0 text-sm text-status-dnd hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {!totpSetup ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void beginTotpSetup()}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              Add authenticator app
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={confirmTotpSetup} className="space-y-4 rounded-lg border border-divider bg-bg-secondary p-4">
          <p className="text-sm text-text-normal">
            Scan this QR code with Google Authenticator, 1Password, Authy, or another TOTP app.
          </p>
          <div className="flex justify-center rounded bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={totpQrSrc(totpSetup.qrCode)} alt="Authenticator QR code" className="h-44 w-44" />
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase text-text-muted">Manual entry key</span>
            <input
              readOnly
              value={totpSetup.secret}
              className="mt-1 w-full rounded bg-bg-accent px-3 py-2 font-mono text-xs outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-text-muted">Verification code</span>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-center text-lg tracking-[0.35em] outline-none focus:ring-2 focus:ring-brand"
              placeholder="000000"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || totpCode.length !== 6}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              Confirm app
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setTotpSetup(null)}
              className="rounded bg-interactive-hover px-4 py-2 text-sm font-semibold text-text-normal"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {message && <p className="text-sm text-status-online">{message}</p>}
      {error && <p className="text-sm text-status-dnd">{error}</p>}
    </div>
  );
}
