"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { IconBell, IconBellOff, IconPin, IconSearch, IconFriends, IconInbox } from "@/components/icons";
import { Tooltip } from "./Tooltip";

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

  const iconBtn = (on: boolean) =>
    `flex h-6 w-6 shrink-0 items-center justify-center transition-colors ${
      on ? "text-interactive-active" : "text-interactive-normal hover:text-interactive-active"
    }`;

  return (
    <div className={`flex items-center gap-3 md:gap-4 ${className ?? ""}`}>
      {canMute && (
        <div className="relative">
          <Tooltip label="Notification Settings" side="bottom">
            <button
              type="button"
              aria-label="Notification Settings"
              onClick={() => setMuteOpen((v) => !v)}
              className={iconBtn(muteOpen)}
            >
              {muteLevel === "nothing" ? <IconBellOff size={24} /> : <IconBell size={24} />}
            </button>
          </Tooltip>
          {muteOpen && (
            <div className="menu-pop absolute right-0 top-9 z-50 w-[220px] origin-top-right rounded-[4px] bg-bg-floating px-1.5 py-1.5 shadow-[var(--elevation-high)]">
              {(["all", "mentions", "nothing"] as MuteLevel[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { void setLevel(l); setMuteOpen(false); }}
                  className="group/opt flex w-full items-center justify-between rounded-[2px] px-2 py-1.5 text-left text-[14px] font-medium text-interactive-normal hover:bg-brand-hover hover:text-white"
                >
                  {l === "all" ? "All Messages" : l === "mentions" ? "Only @mentions" : "Nothing"}
                  <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${muteLevel === l ? "border-brand group-hover/opt:border-white" : "border-current"}`}>
                    {muteLevel === l && <span className="h-2 w-2 rounded-full bg-brand group-hover/opt:bg-white" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showPins && onTogglePins && (
        <Tooltip label="Pinned Messages" side="bottom">
          <button type="button" aria-label="Pinned Messages" aria-pressed={!!pinnedOpen} onClick={onTogglePins} className={iconBtn(!!pinnedOpen)}>
            <IconPin size={24} />
          </button>
        </Tooltip>
      )}

      {showMembersToggle && onToggleMembers && (
        <Tooltip label={membersVisible ? "Hide Member List" : "Show Member List"} side="bottom">
          <button
            type="button"
            aria-label={membersVisible ? "Hide Member List" : "Show Member List"}
            aria-pressed={membersVisible}
            onClick={onToggleMembers}
            className={iconBtn(!!membersVisible)}
          >
            <IconFriends size={24} />
          </button>
        </Tooltip>
      )}

      {showSearch && (
        <Tooltip label="Search" side="bottom">
          <button type="button" aria-label="Search" onClick={() => onOpenSearch()} className={`lg:hidden ${iconBtn(!!searchOpen)}`}>
            <IconSearch size={22} />
          </button>
        </Tooltip>
      )}
      {showSearch && (
        <div className="relative hidden lg:block">
          <input
            type="text"
            readOnly
            onFocus={() => onOpenSearch()}
            placeholder="Search"
            aria-label="Search"
            className="h-6 w-36 rounded-[4px] bg-bg-tertiary pl-1.5 pr-7 text-[14px] text-text-normal outline-none transition-[width] duration-200 ease-out placeholder:text-text-muted focus:w-60"
          />
          {searchOpen && onCloseSearch ? (
            <button type="button" aria-label="Clear search" onClick={onCloseSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-interactive-normal hover:text-interactive-active">×</button>
          ) : (
            <IconSearch size={16} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
          )}
        </div>
      )}

      <div className="relative">
        <Tooltip label="Inbox" side="bottom">
          <button type="button" aria-label="Inbox" onClick={() => setInboxOpen((v) => !v)} className={`relative ${iconBtn(inboxOpen)}`}>
            <IconInbox size={24} />
            {inboxCount > 0 && (
              <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-[3px] border-bg-primary bg-status-dnd px-0.5 text-[10px] font-bold text-white">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}
          </button>
        </Tooltip>
        {inboxOpen && (
          <div className="menu-pop absolute right-0 top-9 z-50 w-[480px] origin-top-right overflow-hidden rounded-lg bg-bg-secondary shadow-[var(--elevation-high)]">
            <InboxPopover mentions={mentions} unreads={unreads} onClose={() => setInboxOpen(false)} />
          </div>
        )}
      </div>

      <Tooltip label="Help" side="bottom">
        <a href="/support" target="_blank" rel="noreferrer" aria-label="Help" className={iconBtn(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <path fill="currentColor" d="M12 2C6.486 2 2 6.487 2 12c0 5.515 4.486 10 10 10s10-4.485 10-10c0-5.513-4.486-10-10-10Zm0 16.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm1-4.375V15h-2v-2h1c1.104 0 2-.897 2-2 0-1.104-.896-2-2-2s-2 .896-2 2H8c0-2.205 1.795-4 4-4s4 1.795 4 4a4.01 4.01 0 0 1-3 3.875Z" />
          </svg>
        </a>
      </Tooltip>
    </div>
  );
}

function InboxPopover({ mentions, unreads, onClose }: { mentions: any[]; unreads: any[]; onClose: () => void }) {
  const [tab, setTab] = useState<"mentions" | "unreads">("mentions");
  const list = tab === "mentions" ? mentions : unreads;
  useOverlayDismiss(onClose, true);
  return (
    <div className="flex max-h-[480px] flex-col">
      <div className="bg-bg-tertiary px-4 pt-4">
        <div className="flex items-center gap-2">
          <IconInbox size={24} className="text-header-primary" />
          <h3 className="text-[20px] font-semibold leading-6 text-header-primary">Inbox</h3>
        </div>
        <div className="mt-3 flex gap-4 text-[14px] font-medium">
          {(["mentions", "unreads"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 pb-2.5 transition-colors ${tab === t ? "border-brand text-header-primary" : "border-transparent text-interactive-normal hover:text-interactive-active"}`}
            >
              {t === "mentions" ? `Mentions (${mentions.length})` : `Unreads (${unreads.length})`}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <div className="flex flex-col items-center px-3 py-10 text-center">
            <p className="text-[16px] font-semibold text-header-primary">You&apos;re all caught up!</p>
            <p className="mt-1 text-[14px] text-text-muted">Come back for notifications, mentions and unreads.</p>
          </div>
        ) : (
          list.slice(0, 50).map((n) => (
            <div key={n.id} className="mb-2 rounded-lg bg-bg-primary px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-text-normal">{n.title}</span>
                <span className="ml-auto text-[11px] text-text-muted">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              {n.body && <p className="mt-1 text-[13px] text-text-muted line-clamp-2">{n.body}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
