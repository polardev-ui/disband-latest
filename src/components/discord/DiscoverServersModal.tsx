"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconClose, IconFriends } from "@/components/icons";
import { serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";

interface DiscoverableServer {
  id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  description: string | null;
  owner_id: string;
  owner_name: string;
  member_count: number;
  created_at: string;
}

interface DiscoverServersModalProps {
  open: boolean;
  onClose: () => void;
}

export function DiscoverServersModal({ open, onClose }: DiscoverServersModalProps) {
  const { servers, joinServerById } = useApp();
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoverableServer[]>([]);

  const memberIds = new Set(servers.map((s) => s.id));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setItems([]);
    getSupabaseClient()
      .rpc("list_discoverable_servers")
      .then(({ data, error: rpcError }) => {
        setLoading(false);
        if (rpcError) {
          setError(rpcError.message);
          return;
        }
        setItems((data ?? []) as DiscoverableServer[]);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function join(server: DiscoverableServer) {
    setJoiningId(server.id);
    setError(null);
    const err = await joinServerById(server.id);
    setJoiningId(null);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">Discover Spaces</h2>
            <p className="text-xs text-text-muted">Popular and active spaces you can join</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-text-muted hover:bg-interactive-hover hover:text-text-normal">
            <IconClose size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-text-muted">Loading spaces…</p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-status-dnd">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-muted">No discoverable spaces yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((server) => {
                const joined = memberIds.has(server.id);
                return (
                  <div
                    key={server.id}
                    className="flex items-center gap-3 rounded-lg border border-divider bg-bg-primary p-3"
                  >
                    {safeImageUrl(server.icon_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={safeImageUrl(server.icon_url)!}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-base font-semibold text-white">
                        {serverInitials(server.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{server.name}</p>
                      {server.description ? (
                        <p className="truncate text-xs text-text-muted">{server.description}</p>
                      ) : null}
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                        <IconFriends size={12} />
                        {server.member_count.toLocaleString()} members · {server.owner_name}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={joined || joiningId === server.id}
                      onClick={() => void join(server)}
                      className={`shrink-0 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                        joined
                          ? "cursor-default bg-bg-accent text-text-muted"
                          : "bg-brand text-white hover:opacity-90 disabled:opacity-50"
                      }`}
                    >
                      {joined ? "Joined" : joiningId === server.id ? "Joining…" : "Join"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
