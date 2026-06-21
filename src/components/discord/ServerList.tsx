"use client";

import { useContextMenu } from "@/components/ui/ContextMenu";
import { Tooltip } from "./Tooltip";
import { IconHome, IconPlus } from "@/components/icons";
import { serverInitials } from "@/lib/utils";
import type { Server } from "@/lib/supabase/types";

interface ServerListProps {
  servers: Server[];
  activeServerId: string | null;
  viewMode: "home" | "server" | "dm" | "group";
  onSelectHome: () => void;
  onSelectServer: (id: string) => void;
  onCreateServer: () => void;
  onServerContext: (server: Server, x: number, y: number) => void;
}

export function ServerList({
  servers,
  activeServerId,
  viewMode,
  onSelectHome,
  onSelectServer,
  onCreateServer,
  onServerContext,
}: ServerListProps) {
  const { openMenu } = useContextMenu();

  return (
    <nav aria-label="Spaces" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-bg-tertiary py-3">
      <Tooltip label="Direct Messages">
        <button
          type="button"
          aria-label="Direct Messages"
          aria-current={viewMode === "home" || viewMode === "dm" || viewMode === "group" ? "true" : undefined}
          onClick={onSelectHome}
          className="group relative flex h-12 w-12 items-center justify-center"
        >
          <span
            className={`absolute -left-3 top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-white transition-all duration-150 ease-in-out ${
              viewMode === "home" || viewMode === "dm" || viewMode === "group" ? "h-10 w-1" : "w-0 group-hover:h-5 group-hover:w-1"
            }`}
          />
          <span
            className={`flex h-12 w-12 items-center justify-center text-white transition-all duration-150 ease-in-out group-hover:rounded-[30%] ${
              viewMode === "home" || viewMode === "dm" || viewMode === "group" ? "rounded-[30%] bg-brand" : "rounded-[50%] bg-brand/90"
            }`}
          >
            <IconHome size={22} />
          </span>
        </button>
      </Tooltip>

      <div className="h-0.5 w-8 rounded bg-divider" />

      {servers.map((server) => {
        const active = activeServerId === server.id && viewMode === "server";
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
                  active ? "h-10 w-1" : "w-0 group-hover:h-5 group-hover:w-1"
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
