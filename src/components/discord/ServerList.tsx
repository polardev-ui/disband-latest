"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "./Tooltip";
import { IconHome, IconPlus } from "@/components/icons";
import { displayName, serverInitials } from "@/lib/utils";
import type { Profile, Server } from "@/lib/supabase/types";

export interface DmRailUnread {
  threadId: string;
  friend: Profile;
  count: number;
}

interface ServerListProps {
  servers: Server[];
  activeServerId: string | null;
  viewMode: "home" | "server" | "dm" | "group";
  dmUnreads: DmRailUnread[];
  activeDmThreadId: string | null;
  serverUnreadIds: string[];
  onSelectHome: () => void;
  onSelectServer: (id: string) => void;
  onSelectDmThread: (threadId: string) => void;
  onCreateServer: () => void;
  onServerContext: (server: Server, x: number, y: number) => void;
}

function UnreadCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-dnd px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg-tertiary">
      {label}
    </span>
  );
}

export function ServerList({
  servers,
  activeServerId,
  viewMode,
  dmUnreads,
  activeDmThreadId,
  serverUnreadIds,
  onSelectHome,
  onSelectServer,
  onSelectDmThread,
  onCreateServer,
  onServerContext,
}: ServerListProps) {
  const homeActive = viewMode === "home" || viewMode === "dm" || viewMode === "group";
  const visibleDmUnreads = dmUnreads.filter(
    (entry) => !(viewMode === "dm" && activeDmThreadId === entry.threadId),
  );
  const serverUnreadSet = new Set(serverUnreadIds);

  return (
    <nav aria-label="Spaces" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-bg-tertiary py-3">
      <Tooltip label="Direct Messages">
        <button
          type="button"
          aria-label="Direct Messages"
          aria-current={homeActive ? "true" : undefined}
          onClick={onSelectHome}
          className="group relative flex h-12 w-12 items-center justify-center"
        >
          <span
            className={`absolute -left-3 top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-white transition-all duration-150 ease-in-out ${
              homeActive ? "h-10 w-1" : "w-0 group-hover:h-5 group-hover:w-1"
            }`}
          />
          <span
            className={`flex h-12 w-12 items-center justify-center text-white transition-all duration-150 ease-in-out group-hover:rounded-[30%] ${
              homeActive ? "rounded-[30%] bg-brand" : "rounded-[50%] bg-brand/90"
            }`}
          >
            <IconHome size={22} />
          </span>
        </button>
      </Tooltip>

      {visibleDmUnreads.length > 0 && (
        <div className="flex w-full flex-col items-center gap-2 transition-all duration-300 ease-out">
          {visibleDmUnreads.map((entry) => {
            const active = viewMode === "dm" && activeDmThreadId === entry.threadId;
            return (
              <Tooltip key={entry.threadId} label={`${displayName(entry.friend)} — ${entry.count} new`}>
                <button
                  type="button"
                  aria-label={`${entry.count} unread messages from ${displayName(entry.friend)}`}
                  onClick={() => onSelectDmThread(entry.threadId)}
                  className="group relative flex h-12 w-12 animate-in fade-in slide-in-from-top-2 items-center justify-center duration-300"
                >
                  <span
                    className={`absolute -left-3 top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-white transition-all duration-150 ease-in-out ${
                      active ? "h-10 w-1" : "w-0 group-hover:h-5 group-hover:w-1"
                    }`}
                  />
                  <div className="relative">
                    <Avatar
                      profile={entry.friend}
                      size="md"
                      className={`h-12 w-12 transition-all duration-150 ease-in-out group-hover:rounded-[30%] ${
                        active ? "rounded-[30%] ring-2 ring-brand" : "rounded-[50%]"
                      }`}
                    />
                    <UnreadCountBadge count={entry.count} />
                  </div>
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}

      <div className="h-0.5 w-8 rounded bg-divider transition-all duration-300" />

      {servers.map((server) => {
        const active = activeServerId === server.id && viewMode === "server";
        const hasUnread = serverUnreadSet.has(server.id) && !active;
        return (
          <Tooltip key={server.id} label={server.name}>
            <button
              type="button"
              aria-label={server.name}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelectServer(server.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onServerContext(server, e.clientX, e.clientY);
              }}
              className="group relative flex h-12 w-12 items-center justify-center"
            >
              <span
                className={`absolute -left-3 top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-white transition-all duration-150 ease-in-out ${
                  active ? "h-10 w-1" : hasUnread ? "h-2 w-1" : "w-0 group-hover:h-5 group-hover:w-1"
                }`}
              />
              {server.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={server.icon_url}
                  alt=""
                  className={`h-12 w-12 object-cover transition-all duration-150 ease-in-out group-hover:rounded-[30%] ${
                    active ? "rounded-[30%]" : "rounded-[50%]"
                  }`}
                />
              ) : (
                <span
                  className={`flex h-12 w-12 items-center justify-center bg-brand text-[15px] font-semibold text-white transition-all duration-150 ease-in-out group-hover:rounded-[30%] ${
                    active ? "rounded-[30%]" : "rounded-[50%]"
                  }`}
                >
                  {serverInitials(server.name)}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}

      <Tooltip label="Add a Space">
        <button
          type="button"
          aria-label="Create server"
          onClick={onCreateServer}
          className="group flex h-12 w-12 items-center justify-center rounded-[50%] bg-bg-primary text-status-online transition-all duration-150 ease-in-out hover:rounded-[30%] hover:bg-status-online hover:text-white"
        >
          <IconPlus size={24} />
        </button>
      </Tooltip>
    </nav>
  );
}
