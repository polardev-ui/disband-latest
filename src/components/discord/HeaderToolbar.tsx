"use client";

import { websiteHref } from "@/lib/platform";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { IconBell, IconBellOff, IconCheckAll, IconPin, IconSearch, IconFriends, IconInbox, IconHelp, IconStar, IconBookmark } from "@/components/icons";
import { useSavedMessages } from "@/lib/saved-messages";
import { SavedPanel } from "./SavedMessages";
import { toggleFavorite, useFavorites, type FavoriteKind } from "@/lib/favorites";
import { alertDialog } from "@/lib/dialogs";
import { Tooltip } from "./Tooltip";

type MuteLevel = "all" | "mentions" | "nothing";

export interface HeaderToolbarProps {
  scopeKind: "server" | "channel" | "dm" | "group";
  serverId: string | null;
  containerId: string | null;
  searchOpen?: boolean;
  onOpenSearch: () => void;
  onCloseSearch?: () => void;
  /** What is typed in the header search box; results show in the search panel. */
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  /** Shown first in the row, at the same spacing (the call button). */
  leading?: React.ReactNode;
  pinnedOpen?: boolean;
  onTogglePins?: () => void;
  showPins?: boolean;
  membersVisible?: boolean;
  onToggleMembers?: () => void;
  showMembersToggle?: boolean;
  showSearch?: boolean;
  className?: string;
  /** Adds a star that favorites this channel or conversation (migration 0237). */
  favoriteTarget?: { kind: FavoriteKind; id: string } | null;
}

export function HeaderToolbar({
  scopeKind,
  serverId,
  containerId,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
  searchQuery,
  onSearchQueryChange,
  leading,
  pinnedOpen,
  onTogglePins,
  showPins = true,
  membersVisible = true,
  onToggleMembers,
  showMembersToggle = true,
  showSearch = true,
  className,
  favoriteTarget = null,
}: HeaderToolbarProps) {
  const app = useApp();
  const { t } = useI18n();
  const favorites = useFavorites(app.user?.id);
  const starred = !!favoriteTarget && favorites.items.some((f) => f.kind === favoriteTarget.kind && f.target_id === favoriteTarget.id);
  const showStar = !!favoriteTarget && favorites.loaded && !favorites.unavailable;
  const toggleStar = async () => {
    if (!favoriteTarget || !app.user?.id) return;
    const err = await toggleFavorite(app.user.id, favoriteTarget.kind, favoriteTarget.id);
    if (err) void alertDialog(err, t("Favorites"));
  };
  const [muteLevel, setMuteLevel] = useState<MuteLevel>("all");
  const [muteOpen, setMuteOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const saved = useSavedMessages(app.user?.id);

  useOverlayDismiss(() => setMuteOpen(false), muteOpen);
  useOverlayDismiss(() => setInboxOpen(false), inboxOpen);
  useOverlayDismiss(() => setSavedOpen(false), savedOpen);

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
    `flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors [&_svg]:h-[21px] [&_svg]:w-[21px] ${
      on ? "bg-interactive-selected text-interactive-active" : "text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
    }`;

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      {leading}
      {showStar && (
        <Tooltip label={starred ? t("Remove from Favorites") : t("Add to Favorites")} side="bottom">
          <button
            type="button"
            aria-label={starred ? t("Remove from Favorites") : t("Add to Favorites")}
            aria-pressed={starred}
            onClick={() => void toggleStar()}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors [&_svg]:h-[21px] [&_svg]:w-[21px] ${
              starred ? "text-status-idle hover:bg-interactive-hover" : "text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
            }`}
          >
            <span className={starred ? "[&_svg]:fill-current" : undefined}>
              <IconStar size={21} />
            </span>
          </button>
        </Tooltip>
      )}
      {canMute && (
        <div className="relative">
          <Tooltip label={t("Notification Settings")} side="bottom">
            <button
              type="button"
              aria-label={t("Notification Settings")}
              onClick={() => setMuteOpen((v) => !v)}
              className={iconBtn(muteOpen)}
            >
              {muteLevel === "nothing" ? <IconBellOff size={24} /> : <IconBell size={24} />}
            </button>
          </Tooltip>
          {muteOpen && (
            <div className="menu-pop absolute right-0 top-10 z-50 w-[220px] origin-top-right rounded-xl border border-border-subtle bg-bg-floating px-1.5 py-1.5 shadow-[var(--elevation-high)]">
              {(["all", "mentions", "nothing"] as MuteLevel[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { void setLevel(l); setMuteOpen(false); }}
                  className="group/opt flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[14px] font-medium text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
                >
                  {l === "all" ? t("All Messages") : l === "mentions" ? t("Only @mentions") : t("Nothing")}
                  <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${muteLevel === l ? "border-brand" : "border-current"}`}>
                    {muteLevel === l && <span className="h-2 w-2 rounded-full bg-brand" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showPins && onTogglePins && (
        <Tooltip label={t("Pinned Messages")} side="bottom">
          <button type="button" aria-label={t("Pinned Messages")} aria-pressed={!!pinnedOpen} onClick={onTogglePins} className={iconBtn(!!pinnedOpen)}>
            <IconPin size={24} />
          </button>
        </Tooltip>
      )}

      {showMembersToggle && onToggleMembers && (
        <Tooltip label={membersVisible ? t("Hide Member List") : t("Show Member List")} side="bottom">
          <button
            type="button"
            aria-label={membersVisible ? t("Hide Member List") : t("Show Member List")}
            aria-pressed={membersVisible}
            onClick={onToggleMembers}
            className={iconBtn(!!membersVisible)}
          >
            <IconFriends size={24} />
          </button>
        </Tooltip>
      )}

      {showSearch && (
        <Tooltip label={t("Search")} side="bottom">
          <button type="button" aria-label={t("Search")} onClick={() => onOpenSearch()} className={`lg:hidden ${iconBtn(!!searchOpen)}`}>
            <IconSearch size={22} />
          </button>
        </Tooltip>
      )}
      {showSearch && (
        <div className="relative hidden lg:block">
          <input
            id="header-search-input"
            type="text"
            value={searchQuery ?? ""}
            onChange={(e) => {
              onSearchQueryChange?.(e.target.value);
              if (!searchOpen) onOpenSearch();
            }}
            onFocus={() => { if (!searchOpen) onOpenSearch(); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.blur();
                onCloseSearch?.();
              }
            }}
            placeholder={t("Search messages")}
            aria-label={t("Search")}
            autoComplete="off"
            spellCheck={false}
            className={`mx-1 h-8 rounded-lg border border-border-subtle bg-bg-secondary-alt pl-8 pr-7 text-[14px] text-text-normal outline-none transition-[width,border-color] duration-200 ease-out placeholder:text-text-muted focus:border-border-strong ${searchOpen || searchQuery ? "w-64" : "w-48 focus:w-64"}`}
          />
          <IconSearch size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          {searchOpen && onCloseSearch && (
            <button type="button" aria-label={t("Clear search")} onClick={onCloseSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] leading-none text-interactive-normal hover:text-interactive-active">×</button>
          )}
        </div>
      )}

      {saved.loaded && !saved.unavailable && (
        <div className="relative">
          <Tooltip label={t("Saved")} side="bottom">
            <button
              type="button"
              aria-label={t("Saved")}
              aria-expanded={savedOpen}
              onClick={() => {
                setSavedOpen((v) => !v);
                setInboxOpen(false);
              }}
              className={iconBtn(savedOpen)}
            >
              <IconBookmark size={22} />
            </button>
          </Tooltip>
          {savedOpen && (
            <div className="menu-pop absolute right-0 top-10 z-50 w-[440px] max-w-[calc(100vw-24px)] origin-top-right overflow-hidden rounded-xl border border-border-subtle bg-bg-floating shadow-[var(--elevation-high)]">
              <SavedPanel
                onClose={() => setSavedOpen(false)}
                onJump={(link, at) => {
                  setSavedOpen(false);
                  void app.routeToNotification(link, at);
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <Tooltip label={t("Inbox")} side="bottom">
          <button type="button" aria-label={t("Inbox")} onClick={() => setInboxOpen((v) => !v)} className={`relative ${iconBtn(inboxOpen)}`}>
            <IconInbox size={24} />
            {inboxCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-bg-primary bg-status-dnd px-0.5 text-[10px] font-bold text-white">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}
          </button>
        </Tooltip>
        {inboxOpen && (
          <div className="menu-pop absolute right-0 top-10 z-50 w-[480px] origin-top-right overflow-hidden rounded-xl border border-border-subtle bg-bg-floating shadow-[var(--elevation-high)]">
            <InboxPopover
              mentions={mentions}
              unreads={unreads}
              onReadAll={() => void app.markNotificationsRead()}
              onClose={() => setInboxOpen(false)}
            />
          </div>
        )}
      </div>

      <Tooltip label={t("Help")} side="bottom">
        <a href={websiteHref("/support")} target="_blank" rel="noreferrer" aria-label={t("Help")} className={iconBtn(false)}>
          <IconHelp size={24} />
        </a>
      </Tooltip>
    </div>
  );
}

function InboxPopover({
  mentions,
  unreads,
  onReadAll,
  onClose,
}: {
  mentions: any[];
  unreads: any[];
  onReadAll: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"mentions" | "unreads">("mentions");
  const list = tab === "mentions" ? mentions : unreads;
  useOverlayDismiss(onClose, true);
  return (
    <div className="flex max-h-[480px] flex-col">
      <div className="border-b border-border-subtle bg-bg-secondary-alt px-4 pt-4">
        <div className="flex items-center gap-2">
          <IconInbox size={24} className="text-header-primary" />
          <h3 className="flex-1 text-[20px] font-semibold leading-6 text-header-primary">{t("Inbox")}</h3>
          <button
            type="button"
            onClick={onReadAll}
            disabled={unreads.length === 0}
            title={t("Mark all as read")}
            className="flex h-7 items-center gap-1 rounded-lg bg-bg-secondary px-2 text-[12px] font-semibold text-interactive-normal transition-colors hover:text-interactive-active disabled:cursor-default disabled:opacity-40"
          >
            <IconCheckAll size={14} />
            {t("Read all")}
          </button>
        </div>
        <div className="mt-3 flex gap-4 text-[14px] font-medium">
          {(["mentions", "unreads"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setTab(kind)}
              className={`border-b-2 pb-2.5 transition-colors ${tab === kind ? "border-brand text-header-primary" : "border-transparent text-interactive-normal hover:text-interactive-active"}`}
            >
              {kind === "mentions" ? `${t("Mentions")} (${mentions.length})` : `${t("Unreads")} (${unreads.length})`}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 ? (
          <div className="flex flex-col items-center px-3 py-10 text-center">
            <p className="text-[16px] font-semibold text-header-primary">{t("You're all caught up")}</p>
            <p className="mt-1 text-[14px] text-text-muted">{t("Mentions, replies, and messages will show up here.")}</p>
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
