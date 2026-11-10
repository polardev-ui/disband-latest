"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { useI18n } from "@/contexts/I18nContext";

export function PlatformBanScreen() {
  const { t } = useI18n();
  const { platformBan, signOut } = useApp();
  const [appealOpen, setAppealOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitAppeal() {
    if (submitting || reason.trim().length < 10) return;
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await apiFetch("/api/moderation/ban-appeals", {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(json.error ?? t("Could not submit appeal."));
        return;
      }
      setStatus(t("Appeal submitted. Our team will review it."));
      setReason("");
      setAppealOpen(false);
    } catch {
      setError(t("Could not reach Disband. Check your connection and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-bg-secondary p-6">
      <div className="w-full max-w-md rounded-xl border border-status-danger/40 bg-bg-secondary p-8 text-center shadow-2xl">
        <div className="mb-4 flex justify-center">
          <Logo adaptive size={48} />
        </div>
        <h1 className="text-xl font-bold text-status-danger">{t("You have been banned from Disband")}</h1>
        <p className="mt-3 text-sm text-text-muted">
          {platformBan?.reason ?? t("Your account no longer has access to Disband.")}
        </p>
        {platformBan?.vpnBlocked && (
          <p className="mt-2 text-xs text-text-muted">
            {t("VPN or proxy connections are not allowed while banned. Disable your VPN to appeal access checks.")}
          </p>
        )}
        <p className="mt-4 text-xs text-text-muted">
          {t("You cannot use Disband until a platform owner removes this ban. Creating a new account with the same email is also blocked.")}
        </p>

        {!appealOpen ? (
          <button
            type="button"
            onClick={() => setAppealOpen(true)}
            className="mt-6 rounded bg-interactive-normal px-4 py-2 text-sm font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
          >
            {t("Appeal Ban")}
          </button>
        ) : (
          <div className="mt-6 space-y-3 text-left">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={t("Explain why this ban should be lifted…")}
              className="w-full resize-y rounded-md border border-divider bg-bg-tertiary p-3 text-sm text-text-normal outline-none transition-colors placeholder:text-text-muted focus:border-brand"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={submitting || reason.trim().length < 10}
                onClick={() => void submitAppeal()}
                className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {submitting ? <LoadingDots size={6} className="mx-auto" /> : t("Submit appeal")}
              </button>
              <button
                type="button"
                onClick={() => { setAppealOpen(false); setReason(""); setError(null); }}
                className="rounded border border-divider bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-normal transition-colors hover:bg-interactive-hover"
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-status-dnd">{error}</p>}
        {status && <p className="mt-3 text-sm text-status-online">{status}</p>}

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 rounded border border-divider bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-normal transition-colors hover:bg-interactive-hover"
        >
          {t("Sign out")}
        </button>
      </div>
    </div>
  );
}
