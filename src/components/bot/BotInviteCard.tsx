"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { BotTag } from "@/components/ui/BotTag";
import { IconClose } from "@/components/icons";
import { getSupabaseClient } from "@/lib/supabase/client";
import { BOT_SCOPE_LABELS } from "@/lib/bot-scopes";
import { Logo } from "@/components/ui/Logo";
import type { BotScope } from "@/lib/bot-auth";

interface InviteData {
  code: string;
  status: "pending" | "approved" | "declined" | "expired";
  expires_at: string | null;
  created_at: string | null;
  scopes: BotScope[];
  bot: { id: string; user_id: string; name: string; avatar_url: string | null };
  server: { id: string; name: string; icon_url: string | null; owner_id: string };
}

const STATUS_COPY: Record<InviteData["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for approval", tone: "text-[#f0b232]" },
  approved: { label: "Approved — the bot has joined", tone: "text-[#57f287]" },
  declined: { label: "Declined", tone: "text-[#f04747]" },
  expired: { label: "Expired", tone: "text-text-muted" },
};

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function BotInviteCard({ code }: { code: string }) {
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/bot/invites/${code}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.bot) {
          setNotFound(true);
          return;
        }
        setInvite(data as InviteData);
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  useEffect(() => {
    void (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      setSignedIn(!!data.session);
    })();
  }, []);

  const act = useCallback(
    async (action: "approve" | "decline") => {
      setBusy(true);
      setError(null);
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session) {
          setError("Sign in to approve or decline this invite.");
          setSignedIn(false);
          return;
        }
        const res = await fetch(`/api/bot/invites/${code}/${action}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
        setInvite((prev) => (prev ? { ...prev, status: action === "approve" ? "approved" : "declined" } : prev));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  const pending = invite?.status === "pending";
  const status = invite ? STATUS_COPY[invite.status] : null;

  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg-tertiary px-4 py-12">
        <Link href="/home" className="mb-8 flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-xl font-bold tracking-tight text-text-normal">Disband</span>
        </Link>

        {loading ? (
          <div className="w-full max-w-md rounded-xl bg-bg-primary p-8 text-center text-sm text-text-muted shadow-2xl">
            Loading invite…
          </div>
        ) : notFound || !invite ? (
          <div className="w-full max-w-md rounded-xl bg-bg-primary p-8 text-center shadow-2xl">
            <h1 className="text-lg font-semibold text-text-normal">Invite not found</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              This invite link doesn&apos;t exist or is no longer valid. Ask the bot&apos;s developer
              for a fresh one.
            </p>
            <Link
              href="/home"
              className="mt-6 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              Back to Disband
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-bg-primary shadow-2xl">
            <div className="border-b border-divider px-6 py-5 text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
                Bot invite
              </p>
              <h1 className="mt-1 text-xl font-bold text-text-normal">Join {invite.server.name}?</h1>
              {status && <p className={`mt-2 text-sm font-medium ${status.tone}`}>{status.label}</p>}
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-accent text-2xl font-bold text-text-normal">
                  {invite.bot.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={invite.bot.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(invite.bot.name)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-lg font-semibold text-text-normal">{invite.bot.name}</p>
                    <BotTag profile={{ is_bot: true }} size="sm" />
                  </div>
                  <p className="text-sm text-text-muted">wants access to {invite.server.name}</p>
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  {invite.scopes.length === 1 ? "1 permission requested" : `${invite.scopes.length} permissions requested`}
                </p>
                <div className="space-y-2">
                  {invite.scopes.map((scope) => (
                    <div key={scope} className="flex items-start gap-2.5 rounded-md bg-bg-secondary px-3 py-2.5">
                      <span className="mt-0.5 text-[#57f287]">✓</span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-text-normal">
                          {BOT_SCOPE_LABELS[scope]?.label ?? scope}
                        </p>
                        <p className="text-[12px] leading-relaxed text-text-muted">
                          {BOT_SCOPE_LABELS[scope]?.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-text-muted">
                  Bots are self-hosted. Approving this invite makes {invite.bot.name} a member with
                  the permissions above and adds it to your server&apos;s member list.
                </p>
              </div>

              {error && (
                <p className="mt-4 rounded-md bg-status-dnd/10 px-3 py-2 text-[12.5px] text-status-dnd">
                  {error}
                </p>
              )}
            </div>

            <div className="border-t border-divider bg-bg-secondary px-6 py-4">
              {pending ? (
                signedIn ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void act("decline")}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-divider px-4 py-2 text-sm font-semibold text-text-normal transition-colors hover:bg-interactive-hover disabled:opacity-60"
                    >
                      <IconClose size={15} />
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => void act("approve")}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
                    >
                      <span aria-hidden>✓</span>
                      {busy ? "Working…" : `Add to ${invite.server.name}`}
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    className="block w-full rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                  >
                    Sign in to approve
                  </Link>
                )
              ) : (
                <Link
                  href="/home"
                  className="block w-full rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  Back to Disband
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}
