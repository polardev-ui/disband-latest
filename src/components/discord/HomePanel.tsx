"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { Avatar } from "@/components/ui/Avatar";
import { GuildTag } from "@/components/ui/GuildTag";
import { displayName, formatMessageTime } from "@/lib/utils";
import { listeningFor } from "@/lib/presence";
import { ListeningLine } from "@/components/ui/ListeningLine";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "./Tooltip";
import { CartIcon } from "@/components/icons/CartIcon";
import { SolidFriendsIcon, SolidNotesIcon } from "@/components/icons/SolidIcons";
import { AeroIcon } from "@/components/icons/AeroIcon";
import { GroupAvatar } from "@/components/ui/GroupAvatar";
import { IconChevronLeft, IconClose, IconFriends, IconGroup, IconInbox, IconPlus, IconCrown, IconSparkle } from "@/components/icons";
import { CreateGroupChatModal } from "@/components/modals/CreateGroupChatModal";
import { favoritesAvailable, isFavorite, toggleFavorite } from "@/lib/favorites";
import { IconPin, IconPinOff, IconStar } from "@/components/icons";
import { pinnedAt, pinsAvailable, togglePin, usePinnedConversations } from "@/lib/pinned-conversations";
import type { GroupChatWithMembers } from "@/lib/supabase/types";

const STATUS_BG = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
} as const;

interface HomePanelProps {
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onFriendClick?: (friendId: string) => void;
  onGroupContext?: (group: GroupChatWithMembers, x: number, y: number) => void;
  onOpenSubscription?: () => void;
  onOpenShop?: () => void;
  /** Opens the Ctrl/⌘+K quick switcher. */
  onOpenQuickSwitcher?: () => void;
  /** The Aero page is showing in the main column (its row is selected). */
  aeroActive?: boolean;
  /** Shows the friends page; defaults to the plain home view. */
  onOpenFriends?: () => void;
}

function NavRow({
  icon,
  label,
  active,
  accent,
  onClick,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group/nav mb-0.5 flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors duration-75 ${
        active ? "bg-interactive-selected text-interactive-active" : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
      }`}
    >
      {/* Icons sit in a round chip; the selected row's chip takes the accent. */}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          active
            ? "bg-brand text-brand-foreground"
            : accent
              ? "bg-[linear-gradient(135deg,#7c74ff,#e055ff)] text-white"
              : "bg-bg-tertiary text-interactive-normal group-hover/nav:text-interactive-active"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5">{label}</span>
      {trailing}
    </button>
  );
}

/** "⌘ K" / "Ctrl K" keycaps for the quick switcher row. */
function ShortcutKeys() {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  return (
    <span aria-hidden className="ml-auto flex shrink-0 items-center gap-1">
      <kbd className="flex h-5 min-w-5 items-center justify-center rounded-md bg-bg-tertiary px-1 font-sans text-[11px] font-semibold text-text-muted">
        {mac ? "⌘" : "Ctrl"}
      </kbd>
      <kbd className="flex h-5 min-w-5 items-center justify-center rounded-md bg-bg-tertiary px-1 font-sans text-[11px] font-semibold text-text-muted">K</kbd>
    </span>
  );
}

// Local row badge (not the toast-style DmUnreadBadge component): a small
// count pill pinned to the avatar's top-right so it never covers the
// presence dot at the bottom-right.
function DmRowBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      key={count}
      className="badge-pop ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[12px] font-bold leading-none text-white"
    >
      {label}
    </span>
  );
}

export function HomePanel({
  onOpenSettings,
  onOpenProfile,
  onFriendClick,
  onGroupContext,
  onOpenSubscription,
  onOpenShop,
  onOpenQuickSwitcher,
  aeroActive = false,
  onOpenFriends,
}: HomePanelProps) {
  const {
    pendingIncoming,
    dmListEntries,
    groupChats,
    groupMessages,
    groupCallCounts,
    activeGroupChatId,
    activeDmThreadId,
    viewMode,
    openDmWithFriend,
    selectDmThread,
    selectGroupChat,
    setViewHome,
    setViewNotes,
    presenceMap,
    listeningMap,
    getGroupUnreadCount,
    closeDmThread,
    tetherProfile,
    subscriptionPlan,
    messageRequests,
    user,
  } = useApp();
  const { t } = useI18n();
  const { openMenu } = useContextMenu();
  const pins = usePinnedConversations(user?.id);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  // The DM list swaps for the Message Requests list while this is on.
  const [showRequests, setShowRequests] = useState(false);
  const requestsOpen = showRequests && messageRequests.length > 0;
  // One long-press at a time: holds the pending timer + origin for whichever
  // DM row is being pressed (touch only — mouse gets the hover X and
  // right-click menu).
  const dmLongPress = useRef<{ timer: number | null; x: number; y: number; fired: boolean }>({
    timer: null,
    x: 0,
    y: 0,
    fired: false,
  });

  function dmRowPointerDown(entry: (typeof dmListEntries)[number], e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    const lp = dmLongPress.current;
    lp.fired = false;
    lp.x = e.clientX;
    lp.y = e.clientY;
    lp.timer = window.setTimeout(() => {
      lp.timer = null;
      lp.fired = true;
      openDmRowMenu(entry, lp.x, lp.y);
    }, 550);
  }

  function dmRowPointerMove(e: React.PointerEvent) {
    const lp = dmLongPress.current;
    if (lp.timer == null) return;
    if (Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 12) dmRowPointerEnd();
  }

  function dmRowPointerEnd() {
    const lp = dmLongPress.current;
    if (lp.timer != null) {
      window.clearTimeout(lp.timer);
      lp.timer = null;
    }
  }

  const onFriends = viewMode === "home" && !aeroActive;

  // Aero users get a pinned Tether row so the assistant is discoverable: it
  // opens a real DM thread (migration 0102) where every message is an ask.
  // Once the thread exists it shows up in dmListEntries on its own.
  const tetherThreadId = tetherProfile
    ? dmListEntries.find((e) => e.threadId && e.friend.id === tetherProfile.id)?.threadId ?? null
    : null;
  const showTetherRow = subscriptionPlan === "aero" && tetherProfile && !tetherThreadId;

  // DMs and group chats share one list so a DM with fresh activity can sit
  // above an older group chat instead of being trapped beneath it. Pinned
  // conversations come first (most recently pinned on top), then unread
  // ones, then the rest by latest activity.
  const mixedConversations = useMemo(() => {
    const items: {
      kind: "group" | "dm";
      id: string;
      unread: number;
      sortAt: string;
      pinnedAt: string | null;
      group?: GroupChatWithMembers;
      entry?: (typeof dmListEntries)[number];
    }[] = [];
    for (const g of groupChats) {
      const lastMsg = groupMessages
        .filter((m) => m.group_id === g.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      items.push({
        kind: "group",
        id: `group:${g.id}`,
        unread: getGroupUnreadCount(g.id),
        pinnedAt: pinnedAt("group", g.id),
        sortAt: g.last_message_at ?? lastMsg?.created_at ?? g.created_at,
        group: g,
      });
    }
    for (const entry of dmListEntries) {
      items.push({
        kind: "dm",
        id: entry.key,
        unread: entry.unreadCount,
        sortAt: entry.sortAt,
        pinnedAt: entry.threadId ? pinnedAt("dm", entry.threadId) : null,
        entry,
      });
    }
    return items.sort((a, b) => {
      if (a.pinnedAt || b.pinnedAt) {
        if (!a.pinnedAt) return 1;
        if (!b.pinnedAt) return -1;
        return b.pinnedAt.localeCompare(a.pinnedAt);
      }
      const aUnread = a.unread > 0 ? 1 : 0;
      const bUnread = b.unread > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return b.sortAt.localeCompare(a.sortAt);
    });
    // pins.items: re-sort when something is pinned or unpinned.
  }, [groupChats, groupMessages, dmListEntries, getGroupUnreadCount, pins.items]);

  async function openDmEntry(entry: (typeof dmListEntries)[number]) {
    if (entry.threadId) {
      await selectDmThread(entry.threadId);
      return;
    }
    await openDmWithFriend(entry.friend.id);
  }

  // Long-press (mobile) or right-click a DM row: profile actions plus Close.
  // Closing hides the row; messaging them again — or a new message from them
  // — brings the row and its history back.
  function openDmRowMenu(entry: (typeof dmListEntries)[number], x: number, y: number) {
    const threadId = entry.threadId;
    const userId = user?.id;
    openMenu(x, y, [
      ...(threadId && userId && favoritesAvailable()
        ? [{
            id: "favorite",
            label: isFavorite("dm", threadId) ? t("Remove from Favorites") : t("Add to Favorites"),
            icon: <IconStar size={16} />,
            onClick: () => void toggleFavorite(userId, "dm", threadId),
          }]
        : []),
      ...(threadId && userId && pinsAvailable()
        ? [{
            id: "pin",
            label: pinnedAt("dm", threadId) ? t("Unpin") : t("Pin to top"),
            icon: pinnedAt("dm", threadId) ? <IconPinOff size={16} /> : <IconPin size={16} />,
            onClick: () => void togglePin(userId, "dm", threadId),
          }]
        : []),
      {
        id: "message",
        label: t("Message"),
        icon: <IconFriends size={16} />,
        onClick: () => void openDmEntry(entry),
      },
      ...(onFriendClick
        ? [
            {
              id: "profile",
              label: t("View Profile"),
              icon: <IconFriends size={16} />,
              onClick: () => onFriendClick(entry.friend.id),
            },
          ]
        : []),
      {
        id: "close",
        label: t("Close DM"),
        icon: <IconClose size={16} />,
        onClick: () => closeDmThread(entry.friend.id),
      },
    ]);
  }

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg-secondary">
      <div className="flex h-14 shrink-0 items-center border-b border-column-border px-2">
        <button
          type="button"
          onClick={() => onOpenQuickSwitcher?.()}
          className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[14px] font-medium text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
        >
          <span className="truncate">{t("Quick switcher")}</span>
          <ShortcutKeys />
        </button>
      </div>

      <nav className="border-b border-column-border px-2 pb-2 pt-2">
        <NavRow
          icon={<SolidFriendsIcon size={18} />}
          label={t("Friends")}
          active={onFriends}
          onClick={() => (onOpenFriends ? onOpenFriends() : setViewHome())}
          trailing={
            pendingIncoming.length > 0 ? (
              <span
                key={pendingIncoming.length}
                className="badge-pop flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[12px] font-bold leading-none text-white"
              >
                {pendingIncoming.length > 99 ? "99+" : pendingIncoming.length}
              </span>
            ) : null
          }
        />
        <NavRow
          icon={<SolidNotesIcon size={18} />}
          label={t("Personal notes")}
          active={viewMode === "notes"}
          onClick={() => void setViewNotes()}
        />
        <NavRow
          icon={<AeroIcon size={18} />}
          label="Disband Aero"
          accent
          active={aeroActive}
          onClick={() => onOpenSubscription?.()}
        />
        <NavRow
          icon={<CartIcon size={18} />}
          label={t("Shop")}
          onClick={() => onOpenShop?.()}
        />
        {messageRequests.length > 0 && (
          <NavRow
            icon={<IconInbox size={18} />}
            label={t("Message Requests")}
            active={requestsOpen}
            onClick={() => setShowRequests((v) => !v)}
            trailing={
              <span
                key={messageRequests.length}
                className="badge-pop flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[12px] font-bold leading-none text-white"
              >
                {messageRequests.length > 99 ? "99+" : messageRequests.length}
              </span>
            }
          />
        )}
      </nav>

      <div className="channel-scroll min-h-0 flex-1 overflow-y-auto px-2">
        {requestsOpen ? (
          <>
            <div className="flex h-10 items-center gap-1 pb-1 pl-1 pr-2 pt-[18px]">
              <button
                type="button"
                onClick={() => setShowRequests(false)}
                aria-label={t("Back to Direct Messages")}
                className="text-interactive-normal hover:text-interactive-active"
              >
                <IconChevronLeft size={16} />
              </button>
              <p className="text-[13px] font-semibold leading-4 text-channels-default">{t("Message Requests")}</p>
            </div>
            <p className="px-2 pb-2 text-[12px] leading-4 text-text-muted">
              {t("From people you share a space with. They won’t know you’ve seen it unless you reply.")}
            </p>
            {messageRequests.map((req) => {
              const active = viewMode === "dm" && activeDmThreadId === req.threadId;
              return (
                <button
                  key={req.threadId}
                  type="button"
                  onClick={() => void selectDmThread(req.threadId)}
                  className={`mb-0.5 flex min-h-[42px] w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors duration-75 ${
                    active ? "bg-interactive-selected text-interactive-active" : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
                  }`}
                >
                  <Avatar profile={req.friend} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-medium leading-5">{displayName(req.friend)}</span>
                    {req.preview && <span className="truncate text-[12px] leading-4 text-text-muted">{req.preview}</span>}
                  </span>
                  <DmRowBadge count={req.unreadCount} />
                </button>
              );
            })}
          </>
        ) : (
          <>
            <div className="group/dmh flex h-10 items-center justify-between pb-1 pl-2 pr-2 pt-4">
              <p className="text-[13px] font-semibold leading-4 text-channels-default group-hover/dmh:text-text-normal">{t("Direct messages")}</p>
              <Tooltip label={t("Create DM")} side="top">
                <button
                  type="button"
                  onClick={() => setCreateGroupOpen(true)}
                  aria-label={t("Create DM")}
                  className="text-interactive-normal hover:text-interactive-active"
                >
                  <IconPlus size={16} />
                </button>
              </Tooltip>
            </div>
            {mixedConversations.map((item) => {
              if (item.kind === "group") {
                const g = item.group!;
                const inCallCount = groupCallCounts.get(g.id) ?? 0;
                const unreadCount = item.unread;
                const active = viewMode === "group" && activeGroupChatId === g.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void selectGroupChat(g.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onGroupContext?.(g, e.clientX, e.clientY);
                    }}
                    className={`mb-0.5 flex h-[42px] w-full items-center gap-3 rounded-lg px-2 text-left transition-colors duration-75 ${
                      active ? "bg-interactive-selected text-interactive-active" : unreadCount > 0 ? "text-interactive-active hover:bg-interactive-hover" : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
                    }`}
                  >
                    <div className="relative h-8 w-8 shrink-0">
                      <GroupAvatar group={g} size={32} />
                      {inCallCount > 0 && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary bg-status-online" />
                      )}
                      {unreadCount > 0 && (
                        <span
                          key={unreadCount}
                          className="badge-pop absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[10px] font-bold text-white"
                        >
                          {unreadCount > 99 ? "99+" : String(unreadCount)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium leading-5">{g.name}</span>
                      <span className="block truncate text-[12px] leading-4 text-text-muted">
                        {t("{count} members", { count: g.members.length })}
                        {item.sortAt && item.sortAt !== g.created_at ? ` · ${formatMessageTime(item.sortAt)}` : ""}
                        {inCallCount > 0 ? ` · ${t("{count} in voice", { count: inCallCount })}` : ""}
                      </span>
                    </div>
                    {item.pinnedAt && <IconPin size={16} className="shrink-0 text-interactive-normal" />}
                  </button>
                );
              }

              const entry = item.entry!;
              const active = viewMode === "dm" && entry.threadId && activeDmThreadId === entry.threadId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(e) => {
                    if (dmLongPress.current.fired) {
                      dmLongPress.current.fired = false;
                      e.preventDefault();
                      return;
                    }
                    void openDmEntry(entry);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openDmRowMenu(entry, e.clientX, e.clientY);
                  }}
                  onPointerDown={(e) => dmRowPointerDown(entry, e)}
                  onPointerMove={dmRowPointerMove}
                  onPointerUp={dmRowPointerEnd}
                  onPointerCancel={dmRowPointerEnd}
                  onPointerLeave={dmRowPointerEnd}
                  className={`group/dmrow mb-0.5 flex h-[42px] w-full select-none items-center gap-3 rounded-lg px-2 text-left transition-colors duration-75 ${
                    active ? "bg-interactive-selected text-interactive-active" : entry.unreadCount > 0 ? "text-interactive-active hover:bg-interactive-hover" : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar profile={entry.friend} size="sm" />
                    <StatusDot
                      status={presenceMap.get(entry.friend.id) ?? "offline"}
                      ring={active ? "var(--interactive-selected)" : "var(--bg-secondary)"}
                      className="absolute -bottom-[3px] -right-[3px] group-hover/dmrow:![background:var(--interactive-hover)]"
                    />
                  </div>
                  {(() => {
                    const live = presenceMap.get(entry.friend.id) ?? "offline";
                    const listening = live === "offline" ? null : listeningFor(entry.friend, listeningMap);
                    return (
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[16px] font-medium leading-5">{displayName(entry.friend)}</span>
                          <GuildTag userId={entry.friend.id} size="sm" />
                        </span>
                        {listening && <ListeningLine listening={listening} />}
                      </span>
                    );
                  })()}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t("Close conversation with {name}", { name: displayName(entry.friend) })}
                    title={t("Close DM")}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeDmThread(entry.friend.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        closeDmThread(entry.friend.id);
                      }
                    }}
                    className="hidden h-4 w-4 shrink-0 items-center justify-center text-interactive-normal hover:text-interactive-active focus-visible:flex group-hover/dmrow:flex"
                  >
                    <IconClose size={16} />
                  </span>
                  <span className="flex items-center gap-1.5 group-hover/dmrow:hidden">
                    <DmRowBadge count={entry.unreadCount} />
                    {item.pinnedAt && <IconPin size={16} className="shrink-0 text-interactive-normal" />}
                  </span>
                </button>
              );
            })}

            {showTetherRow && tetherProfile && (
              <button
                key="tether-dm"
                type="button"
                onClick={() => void openDmWithFriend(tetherProfile.id)}
                title={t("Message Tether directly")}
                className="mb-0.5 flex h-[42px] w-full items-center gap-3 rounded-lg px-2 text-left text-channels-default transition-colors duration-75 hover:bg-interactive-hover hover:text-text-normal"
              >
                <div className="relative">
                  <Avatar profile={tetherProfile} size="sm" />
                  <StatusDot status="online" className="absolute -bottom-[3px] -right-[3px]" />
                </div>
                <span className="truncate text-[16px] font-medium">{displayName(tetherProfile)}</span>
                <span className="ml-auto shrink-0 rounded bg-super/15 px-1 text-[10px] font-bold uppercase tracking-wide text-super">
                  Aero
                </span>
              </button>
            )}
            {mixedConversations.length === 0 && (
              <p className="px-2 py-2 text-sm text-text-muted">{t("Add friends to start chatting.")}</p>
            )}
          </>
        )}
      </div>

      <CreateGroupChatModal open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
    </aside>
  );
}

