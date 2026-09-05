"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getInviteUrl } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { IconVerified } from "@/components/icons";
import { Tooltip } from "./Tooltip";

interface ServerInviteCardProps {
  code: string;
  onLoad?: () => void;
}

export function ServerInviteCard({ code, onLoad }: ServerInviteCardProps) {
  const { joinServerByInvite, selectServer, servers, user } = useApp();
  const [info, setInfo] = useState<{
    id: string;
    name: string;
    description: string | null;
    icon_url: string | null;
    banner_url: string | null;
    member_count: number;
    verified?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMember = servers.some((s) => s.invite_code === code);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/invites/${code}`);
        const json = (await res.json()) as {
          error?: string;
          id?: string;
          name?: string;
          description?: string | null;
          icon_url?: string | null;
          banner_url?: string | null;
          member_count?: number | string;
          verified?: boolean;
        };
        if (!cancelled && !res.ok) setError(json?.error ?? "Could not load invite.");
        if (!cancelled && res.ok && json?.id) {
          setInfo({
            id: json.id,
            name: json.name ?? "",
            description: json.description ?? null,
            icon_url: json.icon_url ?? null,
            banner_url: json.banner_url ?? null,
            member_count: Number(json.member_count ?? 0),
            verified: json.verified ?? false,
          });
        }
      } catch {
        if (!cancelled) setError("Could not load invite.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    if (!loading && info) onLoad?.();
  }, [loading, info, onLoad]);

  async function handleJoin() {
    if (!user) return;
    setJoining(true);
    setError(null);
    const err = await joinServerByInvite(code);
    if (err) setError(err);
    setJoining(false);
  }

  async function handleGo() {
    const s = servers.find((x) => x.invite_code === code);
    if (s) await selectServer(s.id);
  }

  if (loading) return <div className="mt-1 max-w-sm rounded-lg border border-divider bg-bg-secondary p-3 text-xs text-text-muted">Loading invite…</div>;
  if (!info) return null;

  return (
    <div className="mt-1 max-w-sm overflow-hidden rounded-lg border border-divider bg-bg-secondary">
      {info.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeImageUrl(info.banner_url) ?? ""} alt="" className="h-16 w-full object-cover" onLoad={onLoad} />
      )}
      <div className="flex gap-3 p-3">
        {info.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeImageUrl(info.icon_url) ?? ""} alt="" className="h-12 w-12 rounded-[30%] object-cover" onLoad={onLoad} />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-[30%] bg-brand text-lg font-bold text-white">
            {info.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-text-muted">Server Invite</p>
          <p className="flex min-w-0 items-center gap-1 font-semibold">
            <span className="truncate">{info.name}</span>
            {info.verified && (
              <Tooltip label="This server is officially verified by Disband">
                <IconVerified size={14} className="shrink-0 text-sky-400" />
              </Tooltip>
            )}
          </p>
          {info.description && <p className="truncate text-xs text-text-muted">{info.description}</p>}
          <p className="text-xs text-text-muted">{info.member_count} members</p>
        </div>
      </div>
      <div className="border-t border-divider px-3 py-2">
        {isMember ? (
          <button type="button" onClick={() => void handleGo()} className="w-full rounded bg-interactive-hover py-1.5 text-sm font-semibold text-text-normal hover:bg-interactive-selected">
            Go to Server
          </button>
        ) : (
          <button type="button" disabled={joining || !user} onClick={() => void handleJoin()} className="w-full rounded bg-brand py-1.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
            {joining ? "Joining…" : "Join Server"}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-status-dnd">{error}</p>}
        <p className="mt-1 truncate text-[10px] text-text-muted">{getInviteUrl(code)}</p>
      </div>
    </div>
  );
}
