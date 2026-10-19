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

  const HEADING = "text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary";
  const BTN = "inline-flex h-8 min-w-[60px] items-center justify-center rounded-[3px] px-4 text-[14px] font-medium leading-4 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const enabled = verified.length > 0;

  return (
    <div>
      <h3 className={`${HEADING} mb-2`}>{enabled ? "Two-Factor Authentication Enabled" : "Two-Factor Authentication"}</h3>
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 text-header-secondary">
            {enabled
              ? "Your account is protected by an extra layer of security. Signing in needs your password plus a code from your authenticator app."
              : "Protect your Disband account with an extra layer of security. Once configured, you'll be required to enter both your password and an authentication code from your mobile phone in order to sign in."}
          </p>

          {loading ? (
            <p className="mt-4 text-[14px] text-text-muted">Loading security methods…</p>
          ) : (
            [...verified, ...pending].length > 0 && (
              <div className="mt-4 overflow-hidden rounded-lg bg-bg-secondary">
                {[...verified, ...pending].map((factor) => {
                  const isLastVerified = factor.status === "verified" && verified.length <= 1;
                  const confirming = confirmingId === factor.id;
                  return (
                    <div key={factor.id} className="flex items-center justify-between gap-3 border-b border-bg-tertiary px-4 py-3 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-medium text-header-primary">{factorLabel(factor)}</p>
                        <p className="text-[12px] text-header-secondary">
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
                          title="Your last verified method can't be removed — add another one first."
                          className="shrink-0 cursor-not-allowed text-[14px] text-text-muted/60"
                        >
                          Remove
                        </span>
                      ) : confirming ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <button type="button" disabled={busy} onClick={() => setConfirmingId(null)} className="px-2 text-[14px] font-medium text-white hover:underline disabled:opacity-50">
                            Keep
                          </button>
                          <button type="button" disabled={busy} onClick={() => void removeFactor(factor.id)} className={`${BTN} bg-button-danger hover:bg-button-danger-hover`}>
                            Remove
                          </button>
                        </span>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void removeFactor(factor.id)} className={`${BTN} bg-button-secondary hover:bg-button-secondary-hover`}>
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {!totpSetup && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void beginTotpSetup()}
              className={`${BTN} mt-4 bg-brand hover:bg-brand-hover`}
            >
              {enabled ? "Add Another Authenticator" : "Enable Two-Factor Auth"}
            </button>
          )}
        </div>
        {!enabled && <TwoFactorArt />}
      </div>

      {totpSetup && (
        <form onSubmit={confirmTotpSetup} className="mt-5 rounded-lg bg-bg-secondary p-4">
          <h4 className="text-[16px] font-semibold text-header-primary">Set up an authenticator app</h4>
          <div className="mt-4 flex flex-wrap gap-5">
            <div className="shrink-0 rounded-[4px] bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpQrSrc(totpSetup.qrCode)} alt="Authenticator QR code" className="h-36 w-36" />
            </div>
            <div className="min-w-[220px] flex-1 space-y-4">
              <p className="text-[14px] leading-5 text-header-secondary">
                Scan the QR code with Google Authenticator, 1Password, Authy or another authenticator app, then enter the 6-digit code it shows.
              </p>
              <div>
                <span className={`${HEADING} mb-2 block`}>Or enter this key</span>
                <span className="flex items-center gap-2">
                  <input
                    readOnly
                    value={totpSetup.secret}
                    aria-label="Manual entry key"
                    onFocus={(e) => e.target.select()}
                    className="h-8 min-w-0 flex-1 rounded-[3px] bg-bg-tertiary px-2.5 font-mono text-[12px] text-text-normal outline-none"
                  />
                  <button type="button" onClick={() => void copyManualKey()} className={`${BTN} bg-button-secondary hover:bg-button-secondary-hover`}>
                    {copiedKey ? "Copied" : "Copy"}
                  </button>
                </span>
              </div>
              <label className="block">
                <span className={`${HEADING} mb-2 block`}>6-digit code</span>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[16px] tracking-[0.3em] text-text-normal outline-none focus:border-[#00a8fc]"
                  placeholder="000000"
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={busy || totpCode.length !== 6} className={`${BTN} bg-brand hover:bg-brand-hover`}>
                  Activate
                </button>
                <button type="button" disabled={busy} onClick={() => setTotpSetup(null)} className="px-3 text-[14px] font-medium text-white hover:underline">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {message && <p className="mt-3 text-[14px] text-status-online">{message}</p>}
      {error && <p className="mt-3 text-[14px] text-status-dnd">{error}</p>}
    </div>
  );
}

/** A small flat line drawing of a phone and key, like Discord's 2FA art. */
function TwoFactorArt() {
  return (
    <svg aria-hidden width="128" height="80" viewBox="0 0 128 80" fill="none" className="hidden shrink-0 sm:block">
      <rect x="20" y="10" width="34" height="60" rx="5" stroke="#4e5058" strokeWidth="2.5" />
      <rect x="25" y="17" width="24" height="40" rx="2" fill="#2b2d31" stroke="#4e5058" strokeWidth="2" />
      <circle cx="37" cy="63.5" r="2" fill="#4e5058" />
      <path d="M31 34h12M31 40h8" stroke="#5865f2" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="84" cy="40" r="11" stroke="#80848e" strokeWidth="2.5" />
      <circle cx="84" cy="40" r="4" fill="#80848e" />
      <path d="M95 40h22M109 40v8M115 40v6" stroke="#80848e" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M60 24l4-4M62 30h5M60 36l4 4" stroke="#4e5058" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
