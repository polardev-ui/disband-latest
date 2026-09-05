"use client";

import { useRef, useState } from "react";
import { UserPanel } from "./UserPanel";
import { CallIndicator } from "./CallIndicator";
import { Tooltip } from "./Tooltip";
import {
  IconChevron,
  IconClose,
  IconGripVertical,
  IconHash,
  IconHeadphonesOff,
  IconMicOff,
  IconPlus,
  IconSearch,
  IconSpeaker,
  IconVerified,
} from "@/components/icons";
import { displayName } from "@/lib/utils";
import { getAvatarStyle } from "@/lib/profileColor";
import { safeImageUrl } from "@/lib/safe-url";
import type { PresenceMember } from "@/hooks/useServerVoicePresence";
import type { Channel, ChannelCategory, ChannelType, Profile } from "@/lib/supabase/types";
import {
  getCollapsedCategories,
  setCategoryCollapsed,
  UNCATEGORIZED_KEY,
} from "@/lib/collapsed-categories";

interface ChannelListProps {
  title: string;
  categories: ChannelCategory[];
  channels: Channel[];
  activeChannelId: string | null;
  canManageChannels: boolean;
  voicePresence: Map<string, PresenceMember[]>;
  onSelectChannel: (id: string) => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onOpenServerSettings?: () => void;
  onChannelContext?: (channel: Channel, x: number, y: number) => void;
  onCategoryContext?: (category: ChannelCategory, x: number, y: number) => void;
  onUserPanelContext?: (e: React.MouseEvent) => void;
  showServerHeader?: boolean;
  verified?: boolean;
  onMoveChannel?: (channelId: string, categoryId: string | null, index: number) => void;
  onMoveCategory?: (categoryId: string, index: number) => void;
  onCreateChannel?: (name: string, type: ChannelType, categoryId: string | null) => Promise<string | null>;
  onCreateCategory?: (name: string) => Promise<string | null>;
  /** Unread messages per channel — drives the white pill and bold name. */
  getUnreadCount?: (channelId: string) => number;
  /** Messages naming you — drives the red badge. */
  getMentionCount?: (channelId: string) => number;
}

function MiniAvatar({ profile }: { profile?: Profile }) {
  const name = profile ? displayName(profile) : "?";
  const accent = getAvatarStyle(profile ?? {});
  return (
    <span
      className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold"
      style={accent}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeImageUrl(profile.avatar_url) ?? ""} alt="" className="h-full w-full" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

export function ChannelList({
  title,
  categories,
  channels,
  activeChannelId,
  canManageChannels,
  voicePresence,
  onSelectChannel,
  onOpenSettings,
  onOpenProfile,
  onOpenServerSettings,
  onChannelContext,
  onCategoryContext,
  onUserPanelContext,
  showServerHeader = true,
  verified,
  onMoveChannel,
  onMoveCategory,
  onCreateChannel,
  onCreateCategory,
  getUnreadCount,
  getMentionCount,
}: ChannelListProps) {
  // Seeded from storage so a collapsed category stays collapsed across reloads
  // and server switches; a lazy initialiser keeps localStorage off the server
  // render.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => getCollapsedCategories());

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = !prev[key];
      setCategoryCollapsed(key, next);
      return { ...prev, [key]: next };
    });
  };
  const [dragChannelId, setDragChannelId] = useState<string | null>(null);
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<{ kind: "channel" | "category"; id: string; label: string; x: number; y: number } | null>(null);
  const [overCatId, setOverCatId] = useState<string | "uncategorized" | null>(null);
  const [overChannelId, setOverChannelId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  // `null` means "not adding". The category is wrapped so that adding an
  // *uncategorized* channel (categoryId: null) stays distinguishable from the
  // idle state — sharing `null` for both made the composer render permanently,
  // for every member, regardless of permissions.
  const [addChannelTarget, setAddChannelTarget] =
    useState<{ categoryId: string | null } | null>(null);
  const [addChannelName, setAddChannelName] = useState("");
  const [addChannelType, setAddChannelType] = useState<ChannelType>("text");
  const [busy, setBusy] = useState(false);

  // Pointer-event dragging replaces HTML5 drag-and-drop, which does not work in
  // Safari/iOS over <button> rows and offers no touch support at all. A short
  // threshold keeps a plain click from turning into a drag; once armed, the grip
  // element keeps the pointer captured so move/up keep flowing even off-window.
  const DRAG_THRESHOLD = 6;
  const dragRef = useRef<{
    kind: "channel" | "category";
    id: string;
    label: string;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  const byCategory = (catId: string | null) =>
    channels.filter((c) => c.category_id === catId).sort((a, b) => a.position - b.position);

  const clearDragState = () => {
    setDragChannelId(null);
    setDragCategoryId(null);
    setOverCatId(null);
    setOverChannelId(null);
    setDragGhost(null);
  };

  const dropCategory = (catId: string | null) => {
    if (dragChannelId && onMoveChannel) {
      onMoveChannel(dragChannelId, catId, byCategory(catId).length);
    }
    clearDragState();
  };

  const dropOnChannel = (target: Channel) => {
    if (dragChannelId && dragChannelId !== target.id && onMoveChannel) {
      const list = byCategory(target.category_id);
      const index = list.findIndex((c) => c.id === target.id);
      onMoveChannel(dragChannelId, target.category_id, index);
    }
    clearDragState();
  };

  const hitTest = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const target = el?.closest?.(
      "[data-channel-id], [data-category-id], [data-drop-uncategorized]",
    ) as HTMLElement | null | undefined;
    const overChannel = target?.dataset?.channelId ?? null;
    const overCategory = target?.dataset?.categoryId ?? null;
    const overUncategorized = target?.dataset?.dropUncategorized != null;
    if (overChannel) {
      setOverChannelId(overChannel);
      setOverCatId(null);
    } else if (overCategory) {
      setOverCatId(overCategory);
      setOverChannelId(null);
    } else if (overUncategorized) {
      setOverCatId("uncategorized");
      setOverChannelId(null);
    } else {
      setOverChannelId(null);
      setOverCatId(null);
    }
  };

  const armDrag = (kind: "channel" | "category", id: string, label: string) =>
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!canManageChannels) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { kind, id, label, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };

  const moveDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.active = true;
      if (d.kind === "channel") setDragChannelId(d.id);
      else setDragCategoryId(d.id);
    }
    e.preventDefault();
    setDragGhost({ kind: d.kind, id: d.id, label: d.label, x: e.clientX, y: e.clientY });
    hitTest(e.clientX, e.clientY);
  };

  const releaseDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.active) return;
    if (d.kind === "channel") {
      if (overChannelId && overChannelId !== d.id) {
        const target = channels.find((c) => c.id === overChannelId);
        if (target) {
          dropOnChannel(target);
          return;
        }
      }
      const src = channels.find((c) => c.id === d.id);
      const targetCategory: string | null =
        overCatId === "uncategorized" ? null : overCatId;
      const movingAcross = overCatId != null
        && (targetCategory ?? null) !== (src?.category_id ?? null);
      if (overCatId != null && movingAcross && onMoveChannel) {
        onMoveChannel(d.id, targetCategory, byCategory(targetCategory).length);
        clearDragState();
      } else {
        clearDragState();
      }
    } else if (d.kind === "category") {
      const dragged = categories.find((c) => c.id === d.id);
      const over = overCategoryIdForDrop();
      if (dragged && over && over !== "uncategorized" && over !== d.id) {
        onMoveCategory?.(d.id, overCategoryPosition(over));
      }
      clearDragState();
    } else {
      clearDragState();
    }
  };

  const overCategoryPosition = (targetCatId: string) => {
    const sorted = [...categories].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((c) => c.id === targetCatId);
    return idx < 0 ? sorted.length : idx;
  };

  const overCategoryIdForDrop = () => {
    if (overChannelId) {
      const ch = channels.find((c) => c.id === overChannelId);
      return ch?.category_id ?? "uncategorized";
    }
    if (overCatId) return overCatId;
    return null;
  };

  const cancelDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    clearDragState();
  };

  const Grip = ({ kind, id, label }: { kind: "channel" | "category"; id: string; label: string }) =>
    canManageChannels ? (
      <span
        role="button"
        aria-label={`Drag ${label} to reorder`}
        title="Drag to reorder"
        className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-text-muted opacity-0 transition-opacity group-hover/drag:opacity-100 hover:!text-text-normal"
        style={{ touchAction: "none" }}
        onPointerDown={armDrag(kind, id, label)}
        onPointerMove={moveDrag}
        onPointerUp={releaseDrag}
        onPointerCancel={cancelDrag}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      >
        <IconGripVertical size={12} />
      </span>
    ) : null;

  const startAddChannel = (catId: string | null) => {
    if (!canManageChannels) return;
    setAddChannelTarget({ categoryId: catId });
    setAddChannelName("");
    setAddChannelType("text");
  };

  const submitAddChannel = async () => {
    if (!onCreateChannel || !addChannelName.trim() || !addChannelTarget) return;
    if (!canManageChannels) return;
    setBusy(true);
    await onCreateChannel(addChannelName.trim(), addChannelType, addChannelTarget.categoryId);
    setBusy(false);
    setAddChannelTarget(null);
    setAddChannelName("");
  };

  const submitAddCategory = async () => {
    if (!onCreateCategory || !newCategoryName.trim()) return;
    setBusy(true);
    await onCreateCategory(newCategoryName.trim());
    setBusy(false);
    setAddingCategory(false);
    setNewCategoryName("");
  };

  const renderAddChannelComposer = () => (
    <div className="mb-1 rounded-md bg-bg-accent/50 px-1.5 py-1.5">
      <div className="mb-1 flex items-center gap-1">
        {(["text", "voice"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setAddChannelType(t)}
            title={t === "text" ? "Text channel" : "Voice channel"}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
              addChannelType === t
                ? "bg-interactive-selected text-text-normal"
                : "text-text-muted hover:text-text-normal"
            }`}
          >
            {t === "text" ? <IconHash size={12} /> : <IconSpeaker size={12} />}
            {t === "text" ? "Text" : "Voice"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={addChannelName}
          onChange={(e) => setAddChannelName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitAddChannel();
            if (e.key === "Escape") setAddChannelTarget(null);
          }}
          placeholder={addChannelType === "text" ? "New channel" : "New voice channel"}
          className="min-w-0 flex-1 rounded bg-bg-accent px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand"
        />
        <button
          type="button"
          onClick={() => void submitAddChannel()}
          disabled={busy}
          className="shrink-0 text-xs font-medium text-brand hover:underline"
        >
          Create
        </button>
      </div>
    </div>
  );

  const sortedCategories = [...categories].sort((a, b) => a.position - b.position);
  const uncategorized = byCategory(null);

  const renderChannel = (ch: Channel) => {
    const active = ch.id === activeChannelId;
    const participants = ch.type === "voice" ? voicePresence.get(ch.id) ?? [] : [];
    // An open channel is being read, so it never advertises itself as unread.
    const unread = !active && (getUnreadCount?.(ch.id) ?? 0) > 0;
    const mentions = active ? 0 : getMentionCount?.(ch.id) ?? 0;
    return (
      <div key={ch.id} className="relative">
        {overChannelId === ch.id && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded bg-brand" />}
        {/* The pill: a channel with something new is legible at a glance,
            without having to open it to find out. */}
        {unread && (
          <span
            aria-hidden
            className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-text-normal"
          />
        )}
        <button
          type="button"
          data-channel-id={ch.id}
          onClick={() => onSelectChannel(ch.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            onChannelContext?.(ch, e.clientX, e.clientY);
          }}
          className={`group/drag mb-0.5 flex w-full items-center gap-1.5 rounded px-1 py-[6px] text-[15px] transition-all duration-150 ease-in-out ${
            active
              ? "bg-interactive-selected text-text-normal"
              : unread
                ? "font-semibold text-text-normal hover:bg-interactive-hover"
                : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          }`}
        >
          <Grip kind="channel" id={ch.id} label={ch.name} />
          {ch.type === "text" ? <IconHash size={20} /> : <IconSpeaker size={20} />}
          <span className="min-w-0 flex-1 truncate text-left">{ch.name}</span>
          {/* Red badge means it was addressed to you — a mention or a reply —
              which is a different thing from merely unread. */}
          {mentions > 0 && (
            <span className="ml-1 shrink-0 rounded-full bg-status-dnd px-[6px] py-[1px] text-[11px] font-bold leading-[16px] text-white">
              {mentions > 99 ? "99+" : mentions}
            </span>
          )}
          {ch.type === "voice" && participants.length > 0 && (
            <span className="shrink-0 text-[11px] font-semibold text-text-muted">{participants.length}</span>
          )}
        </button>
        {ch.type === "voice" && participants.length > 0 && (
          <div className="mb-1 flex flex-col gap-0.5 pb-1 pl-8">
            {participants.map((vp) => (
              <span key={vp.user_id} className="flex items-center gap-1.5 text-[12px] text-text-muted">
                <MiniAvatar profile={vp.profile} />
                <span className="min-w-0 flex-1 truncate">{vp.profile ? displayName(vp.profile) : "Unknown"}</span>
                {vp.muted && <IconMicOff size={12} className="shrink-0 text-status-dnd" />}
                {vp.deafened && <IconHeadphonesOff size={12} className="shrink-0 text-status-dnd" />}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCategoryHeader = (cat: ChannelCategory) => {
    const open = !collapsed[cat.id];
    return (
      <div className="group/cat group/drag relative flex items-center" data-category-id={cat.id}>
        {overCatId === cat.id && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded bg-brand" />}
        <button
          type="button"
          onClick={() => toggleCollapsed(cat.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCategoryContext?.(cat, e.clientX, e.clientY);
          }}
          className={`flex min-w-0 flex-1 items-center gap-0.5 px-0.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-all duration-150 ${
            overCatId === cat.id ? "text-brand" : "text-text-muted hover:text-text-normal"
          }`}
        >
          <Grip kind="category" id={cat.id} label={cat.name} />
          <IconChevron size={12} className={`shrink-0 transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
          <span className="truncate">{cat.name}</span>
        </button>
        {canManageChannels && (
          <button
            type="button"
            onClick={() => startAddChannel(cat.id)}
            aria-label={`Add channel to ${cat.name}`}
            className="shrink-0 rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-text-normal group-hover/cat:opacity-100"
          >
            <IconPlus size={12} />
          </button>
        )}
      </div>
    );
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-bg-secondary">
      {showServerHeader && (
        <div className="flex h-12 shrink-0 items-center border-b border-black/20 px-4 shadow-sm">
          <button
            type="button"
            onClick={onOpenServerSettings}
            className="flex min-w-0 flex-1 items-center justify-between py-2 text-left transition-all duration-150 ease-in-out hover:text-text-normal"
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[15px] font-semibold">{title}</span>
              {verified && (
                <Tooltip label="This server is officially verified by Disband">
                  <IconVerified size={15} className="shrink-0 text-sky-400" />
                </Tooltip>
              )}
            </span>
            <IconChevron size={18} className="shrink-0 text-text-muted" />
          </button>
          {canManageChannels && (
            <button
              type="button"
              onClick={() => setAddingCategory((v) => !v)}
              aria-label="Create category"
              className="ml-1 shrink-0 rounded p-1 text-text-muted transition-colors hover:text-text-normal"
            >
              <IconPlus size={16} />
            </button>
          )}
        </div>
      )}

      <div className="px-2 pt-2">
        <div className="flex h-7 items-center gap-2 rounded bg-bg-accent px-2 text-text-muted">
          <IconSearch size={14} />
          <span className="text-xs">Search</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {addingCategory && (
          <div className="mb-1 flex items-center gap-1">
            <input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitAddCategory();
                if (e.key === "Escape") {
                  setAddingCategory(false);
                  setNewCategoryName("");
                }
              }}
              placeholder="Category name"
              className="min-w-0 flex-1 rounded bg-bg-accent px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand"
            />
            <button type="button" onClick={() => void submitAddCategory()} disabled={busy} className="text-xs text-brand">
              Add
            </button>
            <button type="button" onClick={() => setAddingCategory(false)} className="text-text-muted">
              <IconClose size={14} />
            </button>
          </div>
        )}

        {sortedCategories.map((cat) => {
          const items = byCategory(cat.id);
          const open = !collapsed[cat.id];
          return (
            <div key={cat.id} className="mb-1">
              {renderCategoryHeader(cat)}
              {open && items.map((ch) => renderChannel(ch))}
              {open && canManageChannels && addChannelTarget?.categoryId === cat.id && renderAddChannelComposer()}
            </div>
          );
        })}

        {(uncategorized.length > 0 || canManageChannels) && (
          <div className="mb-1">
            <div className="group/cat relative flex items-center">
              {overCatId === "uncategorized" && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded bg-brand" />}
              {/* A button like every other category header. It was the one
                  group that could not be collapsed, which is visible at a
                  glance: it was the only heading without a chevron. */}
              <button
                type="button"
                data-drop-uncategorized="true"
                onClick={() => toggleCollapsed(UNCATEGORIZED_KEY)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={`flex min-w-0 flex-1 items-center gap-0.5 px-0.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-all duration-150 ${
                  overCatId === "uncategorized" ? "text-brand" : "text-text-muted hover:text-text-normal"
                }`}
              >
                <IconChevron
                  size={12}
                  className={`shrink-0 transition-transform duration-150 ${
                    collapsed[UNCATEGORIZED_KEY] ? "-rotate-90" : ""
                  }`}
                />
                <span className="truncate">Uncategorized</span>
              </button>
              {canManageChannels && (
                <button
                  type="button"
                  onClick={() => startAddChannel(null)}
                  aria-label="Add uncategorized channel"
                  className="shrink-0 rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-text-normal group-hover/cat:opacity-100"
                >
                  <IconPlus size={12} />
                </button>
              )}
            </div>
            {!collapsed[UNCATEGORIZED_KEY] && uncategorized.map((ch) => renderChannel(ch))}
            {!collapsed[UNCATEGORIZED_KEY]
              && canManageChannels
              && addChannelTarget !== null
              && addChannelTarget.categoryId === null
              && renderAddChannelComposer()}
          </div>
        )}
      </div>

      {dragGhost && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 flex translate-x-2 translate-y-2 items-center gap-1.5 whitespace-nowrap rounded border border-white/10 bg-bg-tertiary px-3 py-1.5 text-sm font-medium text-text-normal shadow-lg"
          style={{ left: dragGhost.x, top: dragGhost.y }}
        >
          {dragGhost.kind === "category" ? (
            <IconChevron size={12} className="-rotate-90 shrink-0 text-text-muted" />
          ) : (
            <IconHash size={14} className="shrink-0 text-text-muted" />
          )}
          <span className="max-w-[180px] truncate">{dragGhost.label}</span>
        </div>
      )}

      <CallIndicator />
      <UserPanel onOpenSettings={onOpenSettings} onOpenProfile={onOpenProfile} onContextMenu={onUserPanelContext} />
    </aside>
  );
}
