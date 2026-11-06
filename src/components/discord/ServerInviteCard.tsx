"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { apiFetch } from "@/lib/api";
import { getInviteUrl } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { ServerBadge, SERVER_BADGE_LABEL, serverBadgeFor } from "@/components/ui/ServerBadge";
import { Tooltip } from "./Tooltip";
import { useI18n } from "@/contexts/I18nContext";

interface ServerInviteCardProps {
  code: string;
  onLoad?: () => void;
}

interface InviteInfo {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  member_count: number;
  verified?: boolean;
  partner?: boolean;
}

type InviteResult = { info: InviteInfo } | { missing: true } | { failed: true };

// One lookup per code, shared by every card showing it (a busy channel can
// show the same invite many times). Failures aren't kept, so a blip retries.
const INVITE_TTL_MS = 5 * 60_000;
const inviteCache = new Map<string, { at: number; result: InviteResult }>();
const inviteInflight = new Map<string, Promise<InviteResult>>();

function cachedInvite(code: string): InviteResult | null {
  const hit = inviteCache.get(code);
  return hit && Date.now() - hit.at < INVITE_TTL_MS ? hit.result : null;
}

function loadInvite(code: string): Promise<InviteResult> {
  const hit = cachedInvite(code);
  if (hit) return Promise.resolve(hit);
  const pending = inviteInflight.get(code);
  if (pending) return pending;
  const p = (async (): Promise<InviteResult> => {
    try {
      const res = await apiFetch(`/api/invites/${encodeURIComponent(code)}`);
      if (res.status === 404) return { missing: true };
      const json = (await res.json().catch(() => null)) as Partial<InviteInfo> & { member_count?: number | string } | null;
      if (!res.ok || !json?.id) return { failed: true };
      return {
        info: {
          id: json.id,
          name: json.name ?? "",
          description: json.description ?? null,
          icon_url: json.icon_url ?? null,
          banner_url: json.banner_url ?? null,
          member_count: Number(json.member_count ?? 0),
          verified: json.verified ?? false,
          partner: json.partner ?? false,
        },
      };
    } catch {
      return { failed: true };
    }
  })().then((result) => {
    inviteInflight.delete(code);
    if (!("failed" in result)) {
      if (inviteCache.size > 200) inviteCache.delete(inviteCache.keys().next().value as string);
      inviteCache.set(code, { at: Date.now(), result });
    }
    return result;
  });
  inviteInflight.set(code, p);
  return p;
}

export function ServerInviteCard({ code, onLoad }: ServerInviteCardProps) {
  const { t } = useI18n();
  const { joinServerByInvite, selectServer, servers, user } = useApp();
  const [result, setResult] = useState<InviteResult | null>(() => cachedInvite(code));
  const [attempt, setAttempt] = useState(0);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMember = servers.some((s) => s.invite_code === code || (s.vanity_code && s.vanity_code.toLowerCase() === code.toLowerCase()));

  useEffect(() => {
    let cancelled = false;
    void loadInvite(code).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => { cancelled = true; };
  }, [code, attempt]);

  useEffect(() => {
    if (result) onLoad?.();
  }, [result, onLoad]);

  const info = result && "info" in result ? result.info : null;

  async function handleJoin() {
    if (!user) return;
    setJoining(true);
    setError(null);
    const err = await joinServerByInvite(code);
    if (err) setError(err);
    setJoining(false);
  }

  async function handleGo() {
    const s = servers.find((x) => x.invite_code === code || (x.vanity_code && x.vanity_code.toLowerCase() === code.toLowerCase()));
    if (s) await selectServer(s.id);
  }

  if (!result) return <div className="mt-1 max-w-sm rounded-lg border border-divider bg-bg-secondary p-3 text-xs text-text-muted">{t("Loading invite…")}</div>;
  if (!info) {
    // The link is no longer in the message text, so the card always says
    // something, even when the invite can't be shown.
    const missing = "missing" in result;
    return (
      <div className="mt-1 max-w-sm rounded-lg border border-divider bg-bg-secondary p-3">
        <p className="text-xs font-bold uppercase text-text-muted">{t("Space Invite")}</p>
        <p className="mt-1 text-sm font-semibold text-text-normal">
          {missing ? t("Invalid invite") : t("Couldn't load this invite")}
        </p>
        <p className="text-xs text-text-muted">
          {missing ? t("This invite may have expired, or the space may no longer exist.") : t("Check your connection and try again.")}
        </p>
        {!missing && (
          <button
            type="button"
            onClick={() => { setResult(null); setAttempt((n) => n + 1); }}
            className="mt-1 text-xs text-text-link hover:underline"
          >
            {t("Try again")}
          </button>
        )}
        <p className="mt-1 truncate text-[10px] text-text-muted">{getInviteUrl(code)}</p>
      </div>
    );
  }

  return (
    <div className="mt-1 max-w-sm overflow-hidden rounded-lg border border-divider bg-bg-secondary">
      {info.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeImageUrl(info.banner_url) || undefined} alt="" className="h-16 w-full object-cover" onLoad={onLoad} />
      )}
      <div className="flex gap-3 p-3">
        {info.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeImageUrl(info.icon_url) || undefined} alt="" className="h-12 w-12 rounded-[30%] object-cover" onLoad={onLoad} />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-[30%] bg-brand text-lg font-bold text-white">
            {info.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-text-muted">{t("Space Invite")}</p>
          {}
          <div className="flex min-w-0 items-center gap-1 font-semibold">
            {(() => {
              const kind = serverBadgeFor({ verified: info.verified, partner: info.partner });
              return kind ? (
                <Tooltip as="span" label={SERVER_BADGE_LABEL[kind]} side="top">
                  <ServerBadge kind={kind} size={14} />
                </Tooltip>
              ) : null;
            })()}
            <span className="truncate">{info.name}</span>
          </div>
          {info.description && <p className="truncate text-xs text-text-muted">{info.description}</p>}
          <p className="text-xs text-text-muted">{info.member_count} members</p>
        </div>
      </div>
      <div className="border-t border-divider px-3 py-2">
        {isMember ? (
          <button type="button" onClick={() => void handleGo()} className="w-full rounded bg-interactive-hover py-1.5 text-sm font-semibold text-text-normal hover:bg-interactive-selected">
            {t("Go to Space")}
          </button>
        ) : (
          <button type="button" disabled={joining || !user} onClick={() => void handleJoin()} className="w-full rounded bg-brand py-1.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
            {joining ? t("Joining…") : t("Join Space")}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-status-dnd">{error}</p>}
        <p className="mt-1 truncate text-[10px] text-text-muted">{getInviteUrl(code)}</p>
      </div>
    </div>
  );
}