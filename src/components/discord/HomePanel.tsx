"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { Avatar } from "@/components/ui/Avatar";
import { GuildTag } from "@/components/ui/GuildTag";
import { displayName } from "@/lib/utils";
import { listeningFor } from "@/lib/presence";
import { ListeningLine } from "@/components/ui/ListeningLine";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "./Tooltip";
import { CartIcon } from "@/components/icons/CartIcon";
import { SolidFriendsIcon, SolidNotesIcon } from "@/components/icons/SolidIcons";
import { AeroIcon } from "@/components/icons/AeroIcon";
import { IconClose, IconFriends, IconGroup, IconPlus, IconCrown, IconSparkle } from "@/components/icons";
import { CreateGroupChatModal } from "@/components/modals/CreateGroupChatModal";
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
      className={`group/nav mb-0.5 flex h-[42px] w-full items-center gap-3 rounded-[4px] px-2 text-left transition-colors duration-75 ${
        active ? "bg-interactive-selected text-interactive-active" : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${accent ? "text-[#ff73fa]" : ""}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[16px] font-medium leading-5">{label}</span>
      {trailing}
    </button>
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
}: HomePanelProps) {
  const {
    pendingIncoming,
    dmListEntries,
    groupChats,
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
  } = useApp();
  const { openMenu } = useContextMenu();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
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

  const onFriends = viewMode === "home";

  // Aero users get a pinned Tether row so the assistant is discoverable: it
  // opens a real DM thread (migration 0102) where every message is an ask.
  // Once the thread exists it shows up in dmListEntries on its own.
  const tetherThreadId = tetherProfile
    ? dmListEntries.find((e) => e.threadId && e.friend.id === tetherProfile.id)?.threadId ?? null
    : null;
  const showTetherRow = subscriptionPlan === "aero" && tetherProfile && !tetherThreadId;

  // DMs and group chats share one list so a DM with fresh activity can sit
  // above an older group chat instead of being trapped beneath it. Unread
  // conversations stay pinned to the top.
  const mixedConversations = useMemo(() => {
    const items: {
      kind: "group" | "dm";
      id: string;
      unread: number;
      sortAt: string;
      group?: GroupChatWithMembers;
      entry?: (typeof dmListEntries)[number];
    }[] = [];
    for (const g of groupChats) {
      items.push({
        kind: "group",
        id: `group:${g.id}`,
        unread: getGroupUnreadCount(g.id),
        sortAt: g.created_at,
        group: g,
      });
    }
    for (const entry of dmListEntries) {
      items.push({
        kind: "dm",
        id: entry.key,
        unread: entry.unreadCount,
        sortAt: entry.sortAt,
        entry,
      });
    }
    return items.sort((a, b) => {
      const aUnread = a.unread > 0 ? 1 : 0;
      const bUnread = b.unread > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return b.sortAt.localeCompare(a.sortAt);
    });
  }, [groupChats, dmListEntries, getGroupUnreadCount]);

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
    openMenu(x, y, [
      {
        id: "message",
        label: "Message",
        icon: <IconFriends size={16} />,
        onClick: () => void openDmEntry(entry),
      },
      ...(onFriendClick
        ? [
            {
              id: "profile",
              label: "View Profile",
              icon: <IconFriends size={16} />,
              onClick: () => onFriendClick(entry.friend.id),
            },
          ]
        : []),
      {
        id: "close",
        label: "Close DM",
        icon: <IconClose size={16} />,
        onClick: () => closeDmThread(entry.friend.id),
      },
    ]);
  }

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg-secondary">
      <div className="flex h-12 shrink-0 items-center px-2.5 shadow-[var(--elevation-low)]">
        <button
          type="button"
          onClick={() => onOpenQuickSwitcher?.()}
          className="h-7 w-full truncate rounded-[4px] bg-bg-tertiary px-1.5 text-left text-[14px] font-medium leading-6 text-text-muted"
        >
          Find or start a conversation
        </button>
      </div>

      <nav className="px-2 pt-2">
        <NavRow
          icon={<SolidFriendsIcon size={24} />}
          label="Friends"
          active={onFriends}
          onClick={() => setViewHome()}
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
          icon={<SolidNotesIcon size={24} />}
          label="Notes"
          active={viewMode === "notes"}
          onClick={() => void setViewNotes()}
        />
        <NavRow
          icon={<AeroIcon size={24} />}
          label="Aero"
          accent
          onClick={() => onOpenSubscription?.()}
        />
        <NavRow
          icon={<CartIcon />}
          label="Shop"
          onClick={() => onOpenShop?.()}
        />
      </nav>

      <div className="channel-scroll min-h-0 flex-1 overflow-y-auto px-2">
        {(
          <>
            <div className="group/dmh flex h-10 items-center justify-between pb-1 pl-2 pr-2 pt-[18px]">
              <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.02em] text-channels-default group-hover/dmh:text-text-normal">Direct Messages</p>
              <Tooltip label="Create DM" side="top">
                <button
                  type="button"
                  onClick={() => setCreateGroupOpen(true)}
                  aria-label="Create DM"
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
                    className={`mb-0.5 flex h-[42px] w-full items-center gap-3 rounded-[4px] px-2 text-left transition-colors duration-75 ${
                      active ? "bg-interactive-selected text-interactive-active" : unreadCount > 0 ? "text-interactive-active hover:bg-interactive-hover" : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
                    }`}
                  >
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: `hsl(${(g.id.charCodeAt(0) * 37) % 360} 55% 45%)` }}>
                      <IconGroup size={18} />
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
                    <div className="min-w-0">
                      <span className="block truncate text-[16px] font-medium leading-5">{g.name}</span>
                      <span className="block truncate text-[12px] leading-4 text-text-muted">
                        {g.members.length} members
                        {inCallCount > 0 ? ` · ${inCallCount} in voice` : ""}
                      </span>
                    </div>
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
                  className={`group/dmrow mb-0.5 flex h-[42px] w-full select-none items-center gap-3 rounded-[4px] px-2 text-left transition-colors duration-75 ${
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
                    aria-label={`Close conversation with ${displayName(entry.friend)}`}
                    title="Close DM"
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
                  <span className="group-hover/dmrow:hidden">
                    <DmRowBadge count={entry.unreadCount} />
                  </span>
                </button>
              );
            })}

            {showTetherRow && tetherProfile && (
              <button
                key="tether-dm"
                type="button"
                onClick={() => void openDmWithFriend(tetherProfile.id)}
                title="Message Tether directly"
                className="mb-0.5 flex h-[42px] w-full items-center gap-3 rounded-[4px] px-2 text-left text-channels-default transition-colors duration-75 hover:bg-interactive-hover hover:text-text-normal"
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
              <p className="px-2 py-2 text-sm text-text-muted">Add friends to start chatting.</p>
            )}
          </>
        )}
      </div>

      <CreateGroupChatModal open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
    </aside>
  );
}

