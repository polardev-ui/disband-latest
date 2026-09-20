"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "./Tooltip";
import { IconVerified, IconHome, IconPlus, IconCompass, IconChevron } from "@/components/icons";
import { displayName, serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import type { Profile, Server, ServerFolder, ServerListState, ViewMode } from "@/lib/supabase/types";

export interface DmRailUnread {
  threadId: string;
  friend: Profile;
  count: number;
}

export interface RailSlot {
  server_id: string;
  position: number;
  folder_id: string | null;
}

export interface RailLayout {
  top: Server[];
  folders: { folder: ServerFolder; servers: Server[] }[];
}

export function computeRailLayout(servers: Server[], folders: ServerFolder[], listState: ServerListState[]): RailLayout {
  const stateByServer = new Map(listState.map((s) => [s.server_id, s]));
  const liveFolderIds = new Set(folders.map((f) => f.id));
  const posOf = (s: Server) => stateByServer.get(s.id)?.position ?? Number.MAX_SAFE_INTEGER;
  const byPos = (a: Server, b: Server) => posOf(a) - posOf(b) || (a.created_at < b.created_at ? -1 : 1);
  const top = servers
    .filter((s) => {
      const st = stateByServer.get(s.id);
      return !st || !st.folder_id || !liveFolderIds.has(st.folder_id);
    })
    .sort(byPos);
  const sortedFolders = [...folders].sort((a, b) => a.position - b.position);
  return {
    top,
    folders: sortedFolders.map((folder) => ({
      folder,
      servers: servers
        .filter((s) => stateByServer.get(s.id)?.folder_id === folder.id)
        .sort(byPos),
    })),
  };
}

type DropTarget =
  | { kind: "space"; id: string; before: boolean }
  | { kind: "folder"; id: string }
  | { kind: "top-end" }
  | { kind: "folder-end"; id: string };

export function resolveServerDrop(
  layout: RailLayout,
  dragId: string,
  target: DropTarget,
): RailSlot[] {
  const topIds = layout.top.map((s) => s.id);
  const folderMembers = new Map(layout.folders.map((f) => [f.folder.id, f.servers.map((s) => s.id)]));
  const sourceFolder = layout.folders.find((f) => f.servers.some((s) => s.id === dragId))?.folder.id ?? null;
  const removeFrom = (ids: string[]) => ids.filter((id) => id !== dragId);

  let destFolder: string | null = null;
  let destIds: string[];
  if (target.kind === "space") {
    destFolder = layout.folders.find((f) => f.servers.some((s) => s.id === target.id))?.folder.id ?? null;
    destIds = removeFrom(destFolder ? (folderMembers.get(destFolder) ?? []) : [...topIds]);
    const idx = destIds.indexOf(target.id);
    destIds.splice(idx < 0 ? destIds.length : target.before ? idx : idx + 1, 0, dragId);
  } else if (target.kind === "folder" || target.kind === "folder-end") {
    destFolder = target.id;
    destIds = removeFrom([...(folderMembers.get(target.id) ?? [])]);
    destIds.push(dragId);
  } else {
    destIds = removeFrom([...topIds]);
    destIds.push(dragId);
  }

  const slots: RailSlot[] = [];
  const reindex = (ids: string[], folderId: string | null) => {
    ids.forEach((id, i) => slots.push({ server_id: id, position: i, folder_id: folderId }));
  };
  reindex(destIds, destFolder);
  if (sourceFolder !== destFolder) {
    const srcIds = removeFrom(sourceFolder ? [...(folderMembers.get(sourceFolder) ?? [])] : [...topIds]);
    reindex(srcIds, sourceFolder);
  } else if (target.kind === "space") {
    // same-list reorder already covered by destIds
  }
  return slots;
}

export function resolveFolderDrop(folders: ServerFolder[], dragId: string, targetId: string | null, before: boolean): string[] {
  const ids = [...folders].sort((a, b) => a.position - b.position).map((f) => f.id).filter((id) => id !== dragId);
  if (!targetId) {
    ids.push(dragId);
    return ids;
  }
  const idx = ids.indexOf(targetId);
  ids.splice(idx < 0 ? ids.length : before ? idx : idx + 1, 0, dragId);
  return ids;
}

interface ServerListProps {
  servers: Server[];
  activeServerId: string | null;
  viewMode: ViewMode;
  dmUnreads: DmRailUnread[];
  activeDmThreadId: string | null;
  serverUnreadIds: string[];
  folders: ServerFolder[];
  listState: ServerListState[];
  onSelectHome: () => void;
  onSelectServer: (id: string) => void;
  onSelectDmThread: (threadId: string) => void;
  onCreateServer: () => void;
  onDiscover: () => void;
  onServerContext: (server: Server, x: number, y: number) => void;
  onFolderContext: (folder: ServerFolder, x: number, y: number) => void;
  onReorderServers: (slots: RailSlot[]) => void;
  onReorderFolders: (orderedIds: string[]) => void;
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

/// Shows where a dragged server will land, sitting in the 8px gap between two
/// rail items. It is absolutely positioned on purpose: a border on the row
/// would resize that row mid-drag, so every icon below it would shift by 2px
/// each time the target changed.
function DropIndicator({ edge }: { edge: "before" | "after" }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-1/2 z-10 h-[3px] w-12 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.75)] ${
        edge === "before" ? "-top-[5px]" : "-bottom-[5px]"
      }`}
    />
  );
}

function ServerButton({
  server,
  active,
  hasUnread,
  draggable,
  dropBefore,
  dropAfter,
  onSelect,
  onContext,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  server: Server;
  active: boolean;
  hasUnread: boolean;
  draggable: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onSelect: () => void;
  onContext: (x: number, y: number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="relative flex w-full justify-center rounded-lg"
    >
      {dropBefore && <DropIndicator edge="before" />}
      {dropAfter && <DropIndicator edge="after" />}
      <Tooltip label={server.name}>
        <button
          type="button"
          aria-label={server.name}
          aria-current={active ? "true" : undefined}
          onClick={onSelect}
          onContextMenu={(e) => {
            e.preventDefault();
            onContext(e.clientX, e.clientY);
          }}
          draggable={draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="group relative flex h-12 w-12 cursor-grab items-center justify-center active:cursor-grabbing"
        >
          <span
            className={`absolute -left-1 top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-white transition-all duration-150 ease-in-out ${
              active ? "h-10 w-1" : hasUnread ? "h-2 w-1" : "w-0 group-hover:h-5 group-hover:w-1"
            }`}
          />
          <div className="relative">
            {safeImageUrl(server.icon_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={safeImageUrl(server.icon_url)!}
                alt=""
                draggable={false}
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
            {server.verified && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-bg-tertiary">
                <Tooltip label="This space is officially verified by Disband">
                  <IconVerified size={12} className="shrink-0 text-sky-400" />
                </Tooltip>
              </span>
            )}
          </div>
        </button>
      </Tooltip>
    </div>
  );
}

export function ServerList({
  servers,
  activeServerId,
  viewMode,
  dmUnreads,
  activeDmThreadId,
  serverUnreadIds,
  folders,
  listState,
  onSelectHome,
  onSelectServer,
  onSelectDmThread,
  onCreateServer,
  onDiscover,
  onServerContext,
  onFolderContext,
  onReorderServers,
  onReorderFolders,
}: ServerListProps) {
  const homeActive =
    viewMode === "home" || viewMode === "dm" || viewMode === "group" || viewMode === "notes";
  const visibleDmUnreads = dmUnreads.filter(
    (entry) => !(viewMode === "dm" && activeDmThreadId === entry.threadId),
  );
  const serverUnreadSet = new Set(serverUnreadIds);
  const layout = useMemo(() => computeRailLayout(servers, folders, listState), [servers, folders, listState]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!activeServerId) return;
    const holder = layout.folders.find((f) => f.servers.some((s) => s.id === activeServerId));
    if (holder) setExpanded((prev) => new Set(prev).add(holder.folder.id));
  }, [activeServerId, layout]);

  const dragRef = useRef<{ kind: "space" | "folder"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const startServerDrag = (e: React.DragEvent, id: string) => {
    dragRef.current = { kind: "space", id };
    e.dataTransfer.setData("application/x-disband-server", id);
    e.dataTransfer.effectAllowed = "move";
  };
  const startFolderDrag = (e: React.DragEvent, id: string) => {
    dragRef.current = { kind: "folder", id };
    e.dataTransfer.setData("application/x-disband-folder", id);
    e.dataTransfer.effectAllowed = "move";
  };
  const endDrag = () => {
    dragRef.current = null;
    setDropTarget(null);
  };

  const serverDragOver = (e: React.DragEvent, id: string) => {
    if (dragRef.current?.kind !== "space" && !e.dataTransfer.types.includes("application/x-disband-server")) return;
    e.preventDefault();
    // Without this the event keeps bubbling to the list (and to the enclosing
    // folder), whose own handler overwrites the target we just set — so the
    // line showed up at the end of the rail instead of beside this server.
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropTarget({ kind: "space", id, before: e.clientY < rect.top + rect.height / 2 });
  };
  const dropOnServer = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const dragId = dragRef.current?.kind === "space" ? dragRef.current.id : e.dataTransfer.getData("application/x-disband-server");
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (dragId && dragId !== id) {
      onReorderServers(resolveServerDrop(layout, dragId, { kind: "space", id, before: e.clientY < rect.top + rect.height / 2 }));
    }
    endDrag();
  };
  const dropOnFolder = (e: React.DragEvent, folderId: string, asReorder: boolean, targetId?: string, before?: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current?.kind === "folder" || e.dataTransfer.types.includes("application/x-disband-folder")) {
      const dragId = dragRef.current?.kind === "folder" ? dragRef.current.id : e.dataTransfer.getData("application/x-disband-folder");
      if (dragId && dragId !== folderId) onReorderFolders(resolveFolderDrop(folders, dragId, targetId ?? folderId, before ?? false));
    } else {
      const dragId = dragRef.current?.kind === "space" ? dragRef.current.id : e.dataTransfer.getData("application/x-disband-server");
      if (dragId) {
        onReorderServers(resolveServerDrop(layout, dragId, asReorder && targetId ? { kind: "space", id: targetId, before: before ?? false } : { kind: "folder", id: folderId }));
        setExpanded((prev) => new Set(prev).add(folderId));
      }
    }
    endDrag();
  };

  const renderServerButton = (server: Server) => {
    const active = activeServerId === server.id && viewMode === "space";
    const hasUnread = serverUnreadSet.has(server.id) && !active;
    const dt = dropTarget;
    return (
      <ServerButton
        key={server.id}
        server={server}
        active={active}
        hasUnread={hasUnread}
        draggable
        dropBefore={dt?.kind === "space" && dt.id === server.id && dt.before}
        dropAfter={dt?.kind === "space" && dt.id === server.id && !dt.before}
        onSelect={() => onSelectServer(server.id)}
        onContext={(x, y) => onServerContext(server, x, y)}
        onDragStart={(e) => startServerDrag(e, server.id)}
        onDragOver={(e) => serverDragOver(e, server.id)}
        onDrop={(e) => dropOnServer(e, server.id)}
        onDragEnd={endDrag}
      />
    );
  };

  return (
    <nav
      aria-label="Spaces"
      // Top-aligned on purpose. Centring the stack (whether with `m-auto` or
      // `justify-content: center`) leaves a gap above the home button whenever
      // the rail is shorter than the window, and pushes the first servers out
      // of reach above the scroll origin once it is taller.
      className="flex w-[72px] shrink-0 flex-col items-center overflow-y-auto bg-bg-tertiary py-3"
    >
      <div className="flex w-full flex-col items-center gap-2">
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

      <div
        className="flex w-full flex-col items-center gap-2"
        onDragOver={(e) => {
          if (!dragRef.current) return;
          e.preventDefault();
          // Only events from the list's own padding and the gaps between rows
          // reach here, since each row stops its own. Claim "drop at the end"
          // just for the area past the last row — otherwise crossing an 8px
          // gap would flick the line down to the bottom of the rail.
          const last = e.currentTarget.lastElementChild;
          const below = !last || e.clientY > last.getBoundingClientRect().bottom;
          if (below) setDropTarget({ kind: "top-end" });
        }}
        onDrop={(e) => {
          e.preventDefault();
          const serverId = dragRef.current?.kind === "space" ? dragRef.current.id : e.dataTransfer.getData("application/x-disband-server");
          const folderId = dragRef.current?.kind === "folder" ? dragRef.current.id : e.dataTransfer.getData("application/x-disband-folder");
          if (serverId) onReorderServers(resolveServerDrop(layout, serverId, { kind: "top-end" }));
          else if (folderId) onReorderFolders(resolveFolderDrop(folders, folderId, null, false));
          endDrag();
        }}
      >
        {layout.top.map((server) => renderServerButton(server))}

        {layout.folders.map(({ folder, servers: members }) => {
          const isOpen = expanded.has(folder.id);
          const hasActive = members.some((s) => s.id === activeServerId && viewMode === "space");
          const hasUnread = members.some((s) => serverUnreadSet.has(s.id) && !(s.id === activeServerId && viewMode === "space"));
          const isDrop = dropTarget?.kind === "folder" && dropTarget.id === folder.id;
          return (
            <div
              key={folder.id}
              onDragOver={(e) => {
                if (!dragRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                setDropTarget({ kind: "folder", id: folder.id });
              }}
              onDrop={(e) => dropOnFolder(e, folder.id, false)}
              className={`flex w-full flex-col items-center gap-2 rounded-lg py-1 transition-colors ${isDrop ? "bg-white/10 ring-1 ring-white" : ""}`}
            >
              <Tooltip label={folder.name}>
                <button
                  type="button"
                  aria-label={`Folder ${folder.name}`}
                  onClick={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    return next;
                  })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onFolderContext(folder, e.clientX, e.clientY);
                  }}
                  draggable
                  onDragStart={(e) => startFolderDrag(e, folder.id)}
                  onDragEnd={endDrag}
                  className="group relative flex h-12 w-12 cursor-grab items-center justify-center active:cursor-grabbing"
                >
                  <span
                    className={`absolute -left-1 top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-white transition-all ${
                      hasActive ? "h-10 w-1" : hasUnread ? "h-2 w-1" : "w-0 group-hover:h-5 group-hover:w-1"
                    }`}
                  />
                  <span
                    className="flex h-12 w-12 flex-col items-center justify-center rounded-[30%] text-white"
                    style={{ backgroundColor: `${folder.color}55` }}
                  >
                    <span className="text-[15px] font-bold leading-none" style={{ color: folder.color }}>
                      {folder.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-semibold text-text-muted">
                      {members.length}
                      <IconChevron size={10} className={`transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                    </span>
                  </span>
                </button>
              </Tooltip>
              {isOpen && (
                <div className="flex w-full flex-col items-center gap-2 border-l-2 pl-1" style={{ borderColor: `${folder.color}88` }}>
                  {members.map((server) => renderServerButton(server))}
                  {members.length === 0 && (
                    <p className="px-1 text-center text-[10px] leading-tight text-text-muted">Drop spaces here</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Tooltip label="Add a Space">
        <button
          type="button"
          aria-label="Create space"
          onClick={onCreateServer}
          className="group flex h-12 w-12 items-center justify-center rounded-[50%] bg-bg-primary text-status-online transition-all duration-150 ease-in-out hover:rounded-[30%] hover:bg-status-online hover:text-white"
        >
          <IconPlus size={24} />
        </button>
      </Tooltip>

      <Tooltip label="Discover">
        <button
          type="button"
          aria-label="Discover spaces"
          onClick={onDiscover}
          className="group flex h-12 w-12 items-center justify-center rounded-[50%] bg-bg-primary text-text-muted transition-all duration-150 ease-in-out hover:rounded-[30%] hover:bg-brand hover:text-white"
        >
          <IconCompass size={22} />
        </button>
      </Tooltip>
      <div
        aria-hidden
        className={`h-[3px] w-12 rounded-full bg-white transition-opacity ${dropTarget?.kind === "top-end" ? "opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.75)]" : "opacity-0"}`}
      />
      </div>
    </nav>
  );
}
