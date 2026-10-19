"use client";

import { ServerBadge, SERVER_BADGE_LABEL, serverBadgeFor } from "@/components/ui/ServerBadge";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";
import {
  IconChevron,
  IconClose,
  IconHash,
  IconHeadphonesOff,
  IconMegaphone,
  IconMicOff,
  IconPlus,
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

  voiceStartTimes: Map<string, number>;
  onSelectChannel: (id: string) => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onOpenServerSettings?: () => void;
  onChannelContext?: (channel: Channel, x: number, y: number) => void;
  onCategoryContext?: (category: ChannelCategory, x: number, y: number) => void;
  showServerHeader?: boolean;
  verified?: boolean;
  onMoveChannel?: (channelId: string, categoryId: string | null, index: number) => void;
  onMoveCategory?: (categoryId: string, index: number) => void;
  onCreateChannel?: (name: string, type: ChannelType, categoryId: string | null) => Promise<string | null>;
  onCreateCategory?: (name: string) => Promise<string | null>;

  getUnreadCount?: (channelId: string) => number;

  getMentionCount?: (channelId: string) => number;

  catalystCount?: number;
  onOpenCatalysts?: () => void;
  /** Server banner shown behind the header title with a fade. Null = plain header. */
  bannerUrl?: string | null;
  /** Opens the space dropdown menu at a screen point (the header's dropdown). */
  onOpenServerMenu?: (x: number, y: number) => void;
}

function MiniAvatar({ profile }: { profile?: Profile }) {
  const name = profile ? displayName(profile) : "?";
  const accent = getAvatarStyle(profile ?? {});
  return (
    <span
      className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold"
      style={accent}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeImageUrl(profile.avatar_url) || undefined} alt="" className="h-full w-full" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ChannelList({
  title,
  categories,
  channels,
  activeChannelId,
  canManageChannels,
  voicePresence,
  voiceStartTimes,
  onSelectChannel,
  onOpenSettings,
  onOpenProfile,
  onOpenServerSettings,
  onChannelContext,
  onCategoryContext,
  showServerHeader = true,
  verified,
  onMoveChannel,
  onMoveCategory,
  onCreateChannel,
  onCreateCategory,
  getUnreadCount,
  getMentionCount,
  catalystCount,
  onOpenCatalysts,
  bannerUrl,
  onOpenServerMenu,
}: ChannelListProps) {

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

  const [addChannelTarget, setAddChannelTarget] =
    useState<{ categoryId: string | null } | null>(null);
  const [addChannelName, setAddChannelName] = useState("");
  const [addChannelType, setAddChannelType] = useState<ChannelType>("text");
  const [busy, setBusy] = useState(false);

  const suppressClickRef = useRef<HTMLElement | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const anyCallActive = voiceStartTimes.size > 0;
  useEffect(() => {
    if (!anyCallActive) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [anyCallActive]);

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
    (e: React.PointerEvent<HTMLElement>) => {
      if (!canManageChannels) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { kind, id, label, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };

  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
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

  const releaseDrag = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.active) return;
    suppressClickRef.current = e.currentTarget;
    const dragEl = e.currentTarget;
    window.setTimeout(() => {
      if (suppressClickRef.current === dragEl) suppressClickRef.current = null;
    }, 500);
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

  const cancelDrag = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    clearDragState();
  };

  const consumeSuppressed = (el: HTMLElement) => {
    if (suppressClickRef.current === el) {
      suppressClickRef.current = null;
      return true;
    }
    return false;
  };

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
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
              addChannelType === t
                ? "bg-brand/15 text-text-normal"
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

    const unread = !active && (getUnreadCount?.(ch.id) ?? 0) > 0;
    const mentions = active ? 0 : getMentionCount?.(ch.id) ?? 0;
    return (
      <div key={ch.id} className="relative">
        {overChannelId === ch.id && <div className="absolute inset-x-2 -top-0.5 h-0.5 rounded bg-brand" />}
        {/* The unread pill, flush with the sidebar's left edge. */}
        {unread && (
          <span aria-hidden className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-header-primary" />
        )}
        <button
          type="button"
          data-channel-id={ch.id}
          onClick={(e) => {
            if (consumeSuppressed(e.currentTarget)) return;
            onSelectChannel(ch.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onChannelContext?.(ch, e.clientX, e.clientY);
          }}
          onPointerDown={armDrag("channel", ch.id, ch.name)}
          onPointerMove={moveDrag}
          onPointerUp={releaseDrag}
          onPointerCancel={cancelDrag}
          style={canManageChannels ? { touchAction: "none" } : undefined}
          className={`group/chan relative flex h-8 w-full items-center gap-1.5 rounded-[4px] px-2 text-[16px] font-medium leading-5 transition-colors duration-75 ${
            active
              ? "bg-interactive-selected text-interactive-active"
              : unread
                ? "text-interactive-active hover:bg-interactive-hover"
                : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
          }`}
        >
          <span className={`shrink-0 ${active || unread ? "text-interactive-active/70" : "text-channels-default"}`}>
            {ch.type === "text" ? (
              ch.read_only ? <IconMegaphone size={20} /> : <IconHash size={20} />
            ) : (
              <IconSpeaker size={20} />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{ch.name}</span>
          {mentions > 0 && (
            <span className="ml-1 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-status-dnd px-1 text-[12px] font-bold leading-none text-white">
              {mentions > 99 ? "99+" : mentions}
            </span>
          )}
          {ch.type === "voice" && participants.length > 0 && (() => {
            const start = voiceStartTimes.get(ch.id);
            return start !== undefined ? (
              <span className="shrink-0 text-[12px] font-medium tabular-nums text-channels-default">
                {formatCallDuration(now - start)}
              </span>
            ) : null;
          })()}
          {/* Classic hover actions: invite and settings ride the row. */}
          {canManageChannels && mentions === 0 && !(ch.type === "voice" && participants.length > 0) && (
            <span className="hidden shrink-0 items-center gap-1 text-interactive-normal group-hover/chan:flex">
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Edit ${ch.name}`}
                title="Edit Channel"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onChannelContext?.(ch, e.clientX, e.clientY);
                }}
                className="hover:text-interactive-active"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" clipRule="evenodd" d="M19.738 10H22V14H19.739C19.498 14.931 19.1 15.798 18.565 16.564L20 18L18 20L16.565 18.564C15.797 19.099 14.932 19.498 14 19.738V22H10V19.738C9.069 19.498 8.203 19.099 7.436 18.564L6 20L4 18L5.436 16.564C4.901 15.799 4.502 14.932 4.262 14H2V10H4.262C4.502 9.068 4.9 8.202 5.436 7.436L4 6L6 4L7.436 5.436C8.202 4.9 9.068 4.502 10 4.262V2H14V4.261C14.932 4.502 15.797 4.9 16.565 5.435L18 3.999L20 5.999L18.564 7.436C19.099 8.202 19.498 9.069 19.738 10ZM12 16C14.209 16 16 14.209 16 12C16 9.791 14.209 8 12 8C9.791 8 8 9.791 8 12C8 14.209 9.791 16 12 16Z" />
                </svg>
              </span>
            </span>
          )}
        </button>
        {ch.type === "voice" && participants.length > 0 && (
          <div className="pb-1 pl-9">
            {participants.map((vp) => (
              <span key={vp.user_id} className="mb-px flex h-[30px] items-center gap-2 rounded-[4px] px-2 text-[14px] text-channels-default hover:bg-interactive-hover hover:text-text-normal">
                <MiniAvatar profile={vp.profile} />
                <span className="min-w-0 flex-1 truncate">{vp.profile ? displayName(vp.profile) : "Unknown"}</span>
                {vp.muted && <IconMicOff size={16} className="shrink-0 text-interactive-normal" />}
                {vp.deafened && <IconHeadphonesOff size={16} className="shrink-0 text-interactive-normal" />}
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
          onClick={(e) => {
            if (consumeSuppressed(e.currentTarget)) return;
            toggleCollapsed(cat.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCategoryContext?.(cat, e.clientX, e.clientY);
          }}
          onPointerDown={armDrag("category", cat.id, cat.name)}
          onPointerMove={moveDrag}
          onPointerUp={releaseDrag}
          onPointerCancel={cancelDrag}
          style={canManageChannels ? { touchAction: "none" } : undefined}
          className={`flex min-w-0 flex-1 items-center gap-0.5 pb-1 pt-4 text-[12px] font-semibold uppercase leading-4 tracking-[0.02em] transition-colors duration-100 ${
            overCatId === cat.id ? "text-brand" : "text-channels-default hover:text-text-normal"
          }`}
        >
          <IconChevron size={12} className={`-ml-0.5 shrink-0 transition-transform duration-100 ${open ? "" : "-rotate-90"}`} />
          <span className="truncate">{cat.name}</span>
        </button>
        {canManageChannels && (
          <button
            type="button"
            onClick={() => startAddChannel(cat.id)}
            aria-label={`Add channel to ${cat.name}`}
            title="Create Channel"
            className="mt-3 shrink-0 text-interactive-normal hover:text-interactive-active"
          >
            <IconPlus size={18} />
          </button>
        )}
      </div>
    );
  };

  return (
    <aside className="flex w-full min-w-0 flex-col bg-bg-secondary">
      {showServerHeader && (() => {
        const banner = bannerUrl ? safeImageUrl(bannerUrl) : null;
        const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
          if (!onOpenServerMenu) {
            onOpenServerSettings?.();
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          onOpenServerMenu(r.left + 10, r.bottom + 6);
        };
        const titleRow = (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              {(() => {
                const kind = serverBadgeFor({ verified, catalystCount });
                return kind ? (
                  <Tooltip label={SERVER_BADGE_LABEL[kind]} side="bottom">
                    <ServerBadge kind={kind} size={16} />
                  </Tooltip>
                ) : null;
              })()}
              <span className={`truncate text-[16px] font-semibold leading-5 ${banner ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" : "text-header-primary"}`}>
                {title}
              </span>
            </span>
            <IconChevron size={18} className={`shrink-0 ${banner ? "text-white" : "text-interactive-normal"}`} />
          </>
        );
        return banner ? (
          <div className="relative h-[138px] shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/50 to-transparent" />
            <button
              type="button"
              onClick={openMenu}
              className="absolute inset-x-0 top-0 flex h-12 min-w-0 items-center justify-between px-4 text-left transition-colors hover:bg-white/5"
            >
              {titleRow}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openMenu}
            className="relative z-[1] flex h-12 w-full shrink-0 items-center justify-between px-4 text-left shadow-[var(--elevation-low)] transition-colors hover:bg-interactive-hover"
          >
            {titleRow}
          </button>
        );
      })()}
      {onOpenCatalysts && (
        <button
          type="button"
          onClick={onOpenCatalysts}
          className="mx-2 mt-2 flex shrink-0 items-center gap-2 rounded-[4px] px-2 py-1.5 text-left transition-colors hover:bg-interactive-hover"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-[#ff73fa]">
            <path fill="currentColor" d="M12 2 5 7v10l7 5 7-5V7l-7-5Zm0 3.2 4.5 3.2v7.2L12 18.8l-4.5-3.2V8.4L12 5.2Z" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-header-secondary">
            {(catalystCount ?? 0) > 0 ? `Level ${(catalystCount ?? 0) >= 6 ? 3 : (catalystCount ?? 0) >= 3 ? 2 : 1} · ${catalystCount} ${(catalystCount ?? 0) === 1 ? "Boost" : "Boosts"}` : "Boost this space"}
          </span>
          <IconChevron size={12} className="-rotate-90 shrink-0 text-interactive-normal" />
        </button>
      )}

      <div className="channel-scroll flex-1 overflow-y-auto pb-2 pl-2 pr-2">
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
              <button
                type="button"
                data-drop-uncategorized="true"
                onClick={() => toggleCollapsed(UNCATEGORIZED_KEY)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={`flex min-w-0 flex-1 items-center gap-0.5 pb-1 pt-4 text-[12px] font-semibold uppercase leading-4 tracking-[0.02em] transition-colors duration-100 ${
                  overCatId === "uncategorized" ? "text-brand" : "text-channels-default hover:text-text-normal"
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
                  title="Create Channel"
                  className="mt-3 shrink-0 text-interactive-normal hover:text-interactive-active"
                >
                  <IconPlus size={18} />
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
          className="pointer-events-none fixed z-50 flex translate-x-2 translate-y-2 items-center gap-1.5 whitespace-nowrap rounded border border-divider bg-bg-tertiary px-3 py-1.5 text-sm font-medium text-text-normal shadow-lg"
          style={{ left: dragGhost.x, top: dragGhost.y }}
        >
          {dragGhost.kind === "category" ? (
            <IconChevron size={12} className="-rotate-90 shrink-0 text-text-muted" />
          ) : channels.find((c) => c.id === dragGhost.id)?.read_only ? (
            <IconMegaphone size={14} className="shrink-0 text-text-muted" />
          ) : (
            <IconHash size={14} className="shrink-0 text-text-muted" />
          )}
          <span className="max-w-[180px] truncate">{dragGhost.label}</span>
        </div>
      )}

    </aside>
  );
}
