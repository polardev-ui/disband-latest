"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { IconBell, IconBellOff, IconPin, IconSearch, IconFriends, IconInbox } from "@/components/icons";

type MuteLevel = "all" | "mentions" | "nothing";

export interface HeaderToolbarProps {
  scopeKind: "server" | "channel" | "dm" | "group";
  serverId: string | null;
  containerId: string | null;
  searchOpen?: boolean;
  onOpenSearch: () => void;
  onCloseSearch?: () => void;
  pinnedOpen?: boolean;
  onTogglePins?: () => void;
  showPins?: boolean;
  membersVisible?: boolean;
  onToggleMembers?: () => void;
  showMembersToggle?: boolean;
  showSearch?: boolean;
  className?: string;
}

export function HeaderToolbar({
  scopeKind,
  serverId,
  containerId,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
  pinnedOpen,
  onTogglePins,
  showPins = true,
  membersVisible = true,
  onToggleMembers,
  showMembersToggle = true,
  showSearch = true,
  className,
}: HeaderToolbarProps) {
  const app = useApp();
  const [muteLevel, setMuteLevel] = useState<MuteLevel>("all");
  const [muteOpen, setMuteOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);

  useOverlayDismiss(() => setMuteOpen(false), muteOpen);
  useOverlayDismiss(() => setInboxOpen(false), inboxOpen);

  const canMute = scopeKind === "channel" || scopeKind === "dm";

  useEffect(() => {
    if (!canMute || !containerId || !app.user?.id) return;
    const table = scopeKind === "channel" ? "channel_notification_settings" : "dm_notification_settings";
    const col = scopeKind === "channel" ? "channel_id" : "thread_id";
    const supabase = getSupabaseClient();
    void (async () => {
      const { data } = await supabase
        .from(table as any)
        .select("level, muted_until")
        .eq("user_id", app.user!.id)
        .eq(col, containerId)
        .maybeSingle();
      if (data) setMuteLevel(((data as { level?: MuteLevel }).level as MuteLevel) ?? "all");
    })();
  }, [canMute, scopeKind, containerId, app.user?.id]);

  const setLevel = useCallback(async (level: MuteLevel) => {
    setMuteLevel(level);
    if (!canMute || !containerId || !app.user?.id) return;
    const table = scopeKind === "channel" ? "channel_notification_settings" : "dm_notification_settings";
    const col = scopeKind === "channel" ? "channel_id" : "thread_id";
    const supabase = getSupabaseClient();
    await supabase.from(table as any).upsert(
      { user_id: app.user.id, [col]: containerId, level, updated_at: new Date().toISOString() },
      { onConflict: `user_id,${col}` },
    );
  }, [canMute, scopeKind, containerId, app.user?.id]);

  const mentions = useMemo(() => app.notifications.filter((n) => /mention/i.test(n.type) || /@/.test(n.body ?? "")), [app.notifications]);
  const unreads = useMemo(() => app.notifications.filter((n) => !n.read), [app.notifications]);

  const inboxCount = unreads.length;

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      {canMute && (
        <div className="relative">
          <button
            type="button"
            title={muteLevel === "nothing" ? "Muted" : muteLevel === "mentions" ? "Mentions only" : "Notifications all"}
            onClick={() => setMuteOpen((v) => !v)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all hover:bg-interactive-hover ${
              muteLevel === "nothing" ? "text-text-muted" : "text-text-muted hover:text-text-normal"
            }`}
          >
            {muteLevel === "nothing" ? <IconBellOff size={18} /> : <IconBell size={18} />}
          </button>
          {muteOpen && (
            <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-divider bg-bg-secondary p-1 shadow-xl">
              {(["all", "mentions", "nothing"] as MuteLevel[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { void setLevel(l); setMuteOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-interactive-hover ${
                    muteLevel === l ? "text-brand" : "text-text-normal"
                  }`}
                >
                  {l === "nothing" ? <IconBellOff size={15} /> : <IconBell size={15} />}
                  {l === "all" ? "All messages" : l === "mentions" ? "Mentions only" : "Nothing"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showPins && onTogglePins && (
        <button
          type="button"
          title="Pinned messages"
          aria-pressed={!!pinnedOpen}
          onClick={onTogglePins}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all hover:bg-interactive-hover ${
            pinnedOpen ? "text-brand" : "text-text-muted hover:text-text-normal"
          }`}
        >
          <IconPin size={18} />
        </button>
      )}

      {showSearch && (
        <div className="relative">
          <IconSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            readOnly
            onFocus={() => onOpenSearch()}
            placeholder="Search"
            className="h-8 w-[240px] rounded-md bg-bg-accent pl-8 pr-3 text-[13px] text-text-normal placeholder:text-text-muted outline-none transition-[width] duration-200 focus:w-[320px] focus:ring-1 focus:ring-brand/40"
          />
          {searchOpen && onCloseSearch && (
            <button type="button" onClick={onCloseSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-normal">×</button>
          )}
        </div>
      )}

      {showMembersToggle && onToggleMembers && (
        <button
          type="button"
          title={membersVisible ? "Hide members" : "Show members"}
          aria-pressed={membersVisible}
          onClick={onToggleMembers}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all hover:bg-interactive-hover ${
            membersVisible ? "text-brand" : "text-text-muted hover:text-text-normal"
          }`}
        >
          <IconFriends size={18} />
        </button>
      )}

      <div className="relative">
        <button
          type="button"
          title="Inbox"
          onClick={() => setInboxOpen((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-all hover:bg-interactive-hover hover:text-text-normal"
        >
          <IconInbox size={18} />
          {inboxCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-brand px-1 text-center text-[10px] font-semibold text-white">
              {inboxCount > 99 ? "99+" : inboxCount}
            </span>
          )}
        </button>
        {inboxOpen && (
          <div className="absolute right-0 top-10 z-50 w-[480px] rounded-lg border border-divider bg-bg-secondary shadow-2xl">
            <InboxPopover mentions={mentions} unreads={unreads} onClose={() => setInboxOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function InboxPopover({ mentions, unreads, onClose }: { mentions: any[]; unreads: any[]; onClose: () => void }) {
  const [tab, setTab] = useState<"mentions" | "unreads">("mentions");
  const list = tab === "mentions" ? mentions : unreads;
  useOverlayDismiss(onClose, true);
  return (
    <div className="flex max-h-[480px] flex-col">
      <div className="flex items-center justify-between border-b border-divider px-4 py-3">
        <h3 className="text-sm font-semibold text-text-normal">Inbox</h3>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-normal">×</button>
      </div>
      <div className="flex gap-1 border-b border-divider px-3 py-2 text-[12px]">
        <button onClick={() => setTab("mentions")} className={`rounded px-2 py-0.5 ${tab === "mentions" ? "bg-brand/20 text-text-normal" : "text-text-muted hover:bg-interactive-hover"}`}>Mentions ({mentions.length})</button>
        <button onClick={() => setTab("unreads")} className={`rounded px-2 py-0.5 ${tab === "unreads" ? "bg-brand/20 text-text-normal" : "text-text-muted hover:bg-interactive-hover"}`}>Unreads ({unreads.length})</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-text-muted">Nothing here.</p>
        ) : (
          list.slice(0, 50).map((n) => (
            <div key={n.id} className="mb-1.5 rounded-lg border border-divider bg-bg-accent/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-text-normal">{n.title}</span>
                <span className="ml-auto text-[11px] text-text-muted">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              {n.body && <p className="mt-1 text-[12.5px] text-text-muted line-clamp-2">{n.body}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
