"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "./Tooltip";
import { ServerBadge, SERVER_BADGE_LABEL, serverBadgeFor } from "@/components/ui/ServerBadge";
import { IconPlus, IconCompass } from "@/components/icons";
import { displayName, serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLiveOnlineCount } from "@/hooks/useLiveOnlineCount";
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
  catalystCounts?: Record<string, number>;
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
    <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-4 border-bg-tertiary bg-status-dnd px-1 text-[12px] font-bold leading-none text-white">
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
      className={`pointer-events-none absolute left-1/2 z-10 h-[3px] w-12 -translate-x-1/2 rounded-full bg-white ${
        edge === "before" ? "-top-[5px]" : "-bottom-[5px]"
      }`}
    />
  );
}

// Hover member counts, cached per server id for the session. A request in
// flight is marked with PENDING_COUNTS so rapid re-hovers share it.
type ServerCounts = { total: number; online: number };
const PENDING_COUNTS = { total: -1, online: -1 };
const serverCountCache = new Map<string, ServerCounts>();

function ServerButton({
  server,
  catalystCount,
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
  catalystCount?: number;
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
  // Member counts are fetched lazily on first hover (one cheap RPC, cached
  // per server) so the rail never pays for servers you only glance past.
  const [counts, setCounts] = useState<{ total: number; online: number } | null>(() => {
    const cached = serverCountCache.get(server.id);
    return cached && cached !== PENDING_COUNTS ? cached : null;
  });
  // Online comes from live presence, not the stored status the counts RPC
  // reads (that lags badly). It starts on first hover and then stays live.
  const [hovered, setHovered] = useState(false);
  const liveOnline = useLiveOnlineCount(server.id, hovered);
  const ensureCounts = () => {
    if (serverCountCache.has(server.id)) {
      const cached = serverCountCache.get(server.id);
      if (cached && cached !== PENDING_COUNTS) setCounts(cached);
      return;
    }
    // Sentinel so concurrent hovers share one request; cleared on failure.
    serverCountCache.set(server.id, PENDING_COUNTS);
    void getSupabaseClient()
      .rpc("get_server_member_counts", { p_server_id: server.id })
      .maybeSingle()
      .then(
        ({ data }) => {
          const row = data as { total?: number | string; online?: number | string } | null;
          if (row && row.total != null) {
            const value = { total: Number(row.total), online: Number(row.online ?? 0) };
            serverCountCache.set(server.id, value);
            setCounts(value);
          } else {
            serverCountCache.delete(server.id);
          }
        },
        () => {
          serverCountCache.delete(server.id);
        },
      );
  };
  const icon = safeImageUrl(server.icon_url);
  const badgeKind = serverBadgeFor({ verified: server.verified, partner: server.partner, catalystCount });
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={() => {
        ensureCounts();
        setHovered(true);
      }}
      className="rail-item group relative flex w-full justify-center"
    >
      <RailPill state={active ? "active" : hasUnread ? "unread" : "none"} />
      {dropBefore && <DropIndicator edge="before" />}
      {dropAfter && <DropIndicator edge="after" />}
      <Tooltip
        side="right"
        label={
          <span className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-1">
              {badgeKind && (
                <span title={SERVER_BADGE_LABEL[badgeKind]} className="inline-flex">
                  <ServerBadge kind={badgeKind} size={14} />
                </span>
              )}
              <span>{server.name}</span>
            </span>
            {counts && (
              <span className="text-xs font-medium">
                <span className="text-text-muted">{counts.total.toLocaleString()} member{counts.total === 1 ? "" : "s"}</span>
                {liveOnline !== null && (
                  <>
                    <span className="text-text-muted"> · </span>
                    <span className="text-status-online">{liveOnline.toLocaleString()} online</span>
                  </>
                )}
              </span>
            )}
          </span>
        }
      >
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
          className="relative flex h-12 w-12 items-center justify-center"
        >
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" draggable={false} data-active={active || undefined} className="rail-icon h-12 w-12 object-cover" />
          ) : (
            <span data-active={active || undefined} className="rail-icon rail-icon-fill h-12 w-12 text-[15px] font-medium">
              {serverInitials(server.name)}
            </span>
          )}
          {badgeKind && (
            <span
              title={SERVER_BADGE_LABEL[badgeKind]}
              className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-bg-tertiary"
            >
              <ServerBadge kind={badgeKind} size={14} />
            </span>
          )}
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * The white pill on the rail's left edge: a dot for unread, a short bar on
 * hover, a tall bar for the space you're in. Height is driven from CSS so it
 * animates between states (see `.rail-pill` in globals.css).
 */
function RailPill({ state }: { state: "none" | "unread" | "active" }) {
  return <span aria-hidden className="rail-pill" data-state={state} />;
}

function RailSeparator() {
  return <div aria-hidden className="mx-auto h-0.5 w-8 shrink-0 rounded-[1px] bg-[#35363c]" />;
}

export function ServerList({
  servers,
  catalystCounts,
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
        catalystCount={catalystCounts?.[server.id] ?? 0}
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
      // Top-aligned on purpose. Centring the stack leaves a gap above the home
      // button whenever the rail is shorter than the window.
      className="rail-scroll flex w-[72px] shrink-0 flex-col items-center overflow-y-auto bg-bg-tertiary pb-3 pt-3"
    >
      <div className="flex w-full flex-col items-center gap-2">
      <div className="rail-item group relative flex w-full justify-center">
        <RailPill state={homeActive ? "active" : "none"} />
        <Tooltip label="Direct Messages" side="right">
          <button
            type="button"
            aria-label="Direct Messages"
            aria-current={homeActive ? "true" : undefined}
            onClick={onSelectHome}
            className="relative flex h-12 w-12 items-center justify-center"
          >
            <span data-active={homeActive || undefined} className="rail-icon rail-icon-fill h-12 w-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" draggable={false} className="h-8 w-8 object-contain brightness-0 invert" />
            </span>
          </button>
        </Tooltip>
      </div>

      {visibleDmUnreads.map((entry) => {
        const active = viewMode === "dm" && activeDmThreadId === entry.threadId;
        return (
          <div key={entry.threadId} className="rail-item rail-enter group relative flex w-full justify-center">
            <RailPill state={active ? "active" : "unread"} />
            <Tooltip label={displayName(entry.friend)} side="right">
              <button
                type="button"
                aria-label={`${entry.count} unread messages from ${displayName(entry.friend)}`}
                onClick={() => onSelectDmThread(entry.threadId)}
                className="relative flex h-12 w-12 items-center justify-center"
              >
                <span className="rail-icon h-12 w-12 overflow-hidden">
                  <Avatar profile={entry.friend} size="md" className="h-12 w-12" />
                </span>
                <UnreadCountBadge count={entry.count} />
              </button>
            </Tooltip>
          </div>
        );
      })}

      <RailSeparator />

      <div
        className="flex w-full flex-col items-center gap-2"
        onDragOver={(e) => {
          if (!dragRef.current) return;
          e.preventDefault();
          // Only events from the gaps between rows reach here, since each row
          // stops its own. Claim "drop at the end" only past the last row.
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
          const toggle = () => setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(folder.id)) next.delete(folder.id);
            else next.add(folder.id);
            return next;
          });
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
              className="relative flex w-full flex-col items-center"
            >
              {/* An open folder sits on a tinted column, the classic way. */}
              {isOpen && (
                <span aria-hidden className="absolute bottom-0 left-1/2 top-0 w-12 -translate-x-1/2 rounded-2xl" style={{ backgroundColor: `${folder.color}33` }} />
              )}
              <div className="rail-item group relative flex w-full justify-center">
                <RailPill state={!isOpen && hasActive ? "active" : !isOpen && hasUnread ? "unread" : "none"} />
                <Tooltip label={folder.name} side="right">
                  <button
                    type="button"
                    aria-label={`Folder ${folder.name}`}
                    aria-expanded={isOpen}
                    onClick={toggle}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onFolderContext(folder, e.clientX, e.clientY);
                    }}
                    draggable
                    onDragStart={(e) => startFolderDrag(e, folder.id)}
                    onDragEnd={endDrag}
                    className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-shadow ${isDrop ? "ring-2 ring-white/70" : ""}`}
                  >
                    {isOpen ? (
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ color: folder.color }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M20 7H12L10.553 5.106C10.214 4.428 9.521 4 8.764 4H3C2.447 4 2 4.447 2 5V19C2 20.104 2.895 21 4 21H20C21.104 21 22 20.104 22 19V9C22 7.896 21.104 7 20 7Z" />
                        </svg>
                      </span>
                    ) : (
                      <span className="grid h-12 w-12 grid-cols-2 gap-[3px] rounded-2xl p-[7px]" style={{ backgroundColor: `${folder.color}55` }}>
                        {members.slice(0, 4).map((m) => {
                          const mi = safeImageUrl(m.icon_url);
                          return mi ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={m.id} src={mi} alt="" className="h-[15px] w-[15px] rounded-full object-cover" />
                          ) : (
                            <span key={m.id} className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-bg-primary text-[7px] font-semibold text-text-normal">
                              {serverInitials(m.name).slice(0, 1)}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </button>
                </Tooltip>
              </div>
              {isOpen && (
                <div className="relative flex w-full flex-col items-center gap-2 pb-2 pt-2">
                  {members.map((server) => renderServerButton(server))}
                  {members.length === 0 && (
                    <p className="px-2 text-center text-[10px] leading-tight text-text-muted">Drop spaces here</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rail-item group relative flex w-full justify-center">
        <RailPill state="none" />
        <Tooltip label="Add a Space" side="right">
          <button type="button" aria-label="Add a Space" onClick={onCreateServer} className="relative flex h-12 w-12 items-center justify-center">
            <span className="rail-icon rail-icon-action h-12 w-12">
              <IconPlus size={24} />
            </span>
          </button>
        </Tooltip>
      </div>

      <div className="rail-item group relative flex w-full justify-center">
        <RailPill state={viewMode === "discover" ? "active" : "none"} />
        <Tooltip label="Explore Discoverable Spaces" side="right">
          <button type="button" aria-label="Explore discoverable spaces" onClick={onDiscover} className="relative flex h-12 w-12 items-center justify-center">
            <span data-active={viewMode === "discover" || undefined} className="rail-icon rail-icon-action h-12 w-12">
              <IconCompass size={24} />
            </span>
          </button>
        </Tooltip>
      </div>
      <div
        aria-hidden
        className={`h-[3px] w-12 rounded-full bg-white transition-opacity ${dropTarget?.kind === "top-end" ? "opacity-100" : "opacity-0"}`}
      />
      </div>
    </nav>
  );
}
