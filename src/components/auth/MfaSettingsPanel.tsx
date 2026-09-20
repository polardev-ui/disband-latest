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
  // Two-step removal: first click arms the confirm, second click removes.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

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
    if (confirmingId !== factorId) {
      // Arm the confirm instead of removing one-click: deleting the last
      // verified method strands you on the MFA challenge with nothing to
      // verify with, so this must never happen by accident.
      setConfirmingId(factorId);
      setError(null);
      setMessage(null);
      return;
    }
    setConfirmingId(null);
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

  async function copyManualKey() {
    if (!totpSetup) return;
    try {
      await navigator.clipboard.writeText(totpSetup.secret);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      setError("Couldn’t copy the key — select and copy it manually.");
    }
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
          {[...verified, ...pending].map((factor) => {
            const isLastVerified = factor.status === "verified" && verified.length <= 1;
            const confirming = confirmingId === factor.id;
            return (
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
              {isLastVerified ? (
                <span
                  title="Your last verified method can’t be removed — add another one first."
                  className="shrink-0 cursor-not-allowed text-sm text-text-muted/60"
                >
                  Remove
                </span>
              ) : confirming ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingId(null)}
                    className="text-sm text-text-muted hover:underline disabled:opacity-50"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeFactor(factor.id)}
                    className="shrink-0 rounded bg-status-dnd px-2.5 py-1 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Confirm remove
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeFactor(factor.id)}
                  className="shrink-0 text-sm text-status-dnd hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            );
          })}
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
            <span className="mt-1 flex items-center gap-2">
              <input
                readOnly
                value={totpSetup.secret}
                aria-label="Manual entry key"
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded bg-bg-accent px-3 py-2 font-mono text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => void copyManualKey()}
                className="shrink-0 rounded bg-interactive-hover px-3 py-2 text-xs font-semibold text-text-normal transition-colors hover:bg-interactive-selected"
              >
                {copiedKey ? "Copied" : "Copy"}
              </button>
            </span>
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
