"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { IconFriends, IconGroup, IconPlus, IconNotes, IconCrown } from "@/components/icons";
import { UserPanel } from "./UserPanel";
import { CallIndicator } from "./CallIndicator";
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
  onUserPanelContext?: (e: React.MouseEvent) => void;
  onFriendClick?: (friendId: string) => void;
  onGroupContext?: (group: GroupChatWithMembers, x: number, y: number) => void;
  onOpenSubscription?: () => void;
}

/** A top-level destination row: circular icon badge + label, optional trailing slot. */
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
      className={`mb-0.5 flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover ${
        active ? "bg-interactive-selected" : ""
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          accent ? "bg-super/15 text-super" : "bg-brand/20 text-brand"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-normal">{label}</span>
      {trailing}
    </button>
  );
}

function DmUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[10px] font-bold text-white">
      {label}
    </span>
  );
}

export function HomePanel({
  onOpenSettings,
  onOpenProfile,
  onUserPanelContext,
  onGroupContext,
  onOpenSubscription,
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
  } = useApp();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  // Friends browsing (tabs, search, add-by-username) lives in the main pane —
  // the sidebar only routes to it and lists conversations.
  const onFriends = viewMode === "home";

  async function openDmEntry(entry: (typeof dmListEntries)[number]) {
    if (entry.threadId) {
      await selectDmThread(entry.threadId);
      return;
    }
    await openDmWithFriend(entry.friend.id);
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden bg-bg-secondary">
      <header className="flex h-12 items-center border-b border-black/20 px-4 shadow-sm">
        <IconFriends className="mr-2 text-text-muted" />
        <span className="flex-1 font-semibold text-text-normal">Friends</span>
      </header>

      <nav className="px-2 pt-2">
        <NavRow
          icon={<IconFriends size={18} />}
          label="Friends"
          active={onFriends}
          onClick={() => setViewHome()}
          trailing={
            pendingIncoming.length > 0 ? (
              <span className="rounded-full bg-status-dnd px-1.5 text-[10px] font-bold text-white">
                {pendingIncoming.length}
              </span>
            ) : null
          }
        />
        <NavRow
          icon={<IconNotes size={18} />}
          label="Notes"
          active={viewMode === "notes"}
          onClick={() => void setViewNotes()}
        />
        <NavRow
          icon={<IconCrown size={18} />}
          label="Disband SUPER"
          accent
          onClick={() => onOpenSubscription?.()}
        />
      </nav>

      <div className="mx-4 my-2 h-px bg-divider" />

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {(
          <>
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-xs font-bold uppercase text-text-muted">Group Chats — {groupChats.length}</p>
              <button
                type="button"
                onClick={() => setCreateGroupOpen(true)}
                title="Create group"
                className="rounded p-0.5 text-text-muted hover:bg-interactive-hover hover:text-text-normal"
              >
                <IconPlus size={16} />
              </button>
            </div>
            {groupChats.map((g) => {
              const inCallCount = groupCallCounts.get(g.id) ?? 0;
              const active = viewMode === "group" && activeGroupChatId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => void selectGroupChat(g.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onGroupContext?.(g, e.clientX, e.clientY);
                  }}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover ${
                    active ? "bg-interactive-selected" : ""
                  }`}
                >
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand">
                    <IconGroup size={16} />
                    {inCallCount > 0 && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary bg-status-online" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">{g.name}</span>
                    <span className="block truncate text-[11px] text-text-muted">
                      {g.members.length} members
                      {inCallCount > 0 ? ` · ${inCallCount} in voice` : ""}
                    </span>
                  </div>
                </button>
              );
            })}

            <p className="mt-3 px-2 py-1 text-xs font-bold uppercase text-text-muted">
              Direct Messages — {dmListEntries.length}
            </p>
            {dmListEntries.map((entry) => {
              const active = viewMode === "dm" && entry.threadId && activeDmThreadId === entry.threadId;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => void openDmEntry(entry)}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-all duration-150 hover:bg-interactive-hover ${
                    active ? "bg-interactive-selected" : ""
                  }`}
                >
                  <div className="relative">
                    <Avatar profile={entry.friend} size="sm" />
                    {entry.unreadCount <= 0 && (
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary ${STATUS_BG[presenceMap.get(entry.friend.id) ?? "offline"]}`} />
                    )}
                    <DmUnreadBadge count={entry.unreadCount} />
                  </div>
                  <span className="truncate text-sm">{displayName(entry.friend)}</span>
                </button>
              );
            })}
            {dmListEntries.length === 0 && (
              <p className="px-2 py-2 text-sm text-text-muted">Add friends to start chatting.</p>
            )}
          </>
        )}
      </div>

      <CallIndicator />
      <UserPanel onOpenSettings={onOpenSettings} onOpenProfile={onOpenProfile} onContextMenu={onUserPanelContext} />
      <CreateGroupChatModal open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
    </aside>
  );
}
