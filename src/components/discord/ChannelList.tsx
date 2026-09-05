"use client";

import { useState } from "react";
import { UserPanel } from "./UserPanel";
import { CallIndicator } from "./CallIndicator";
import { Tooltip } from "./Tooltip";
import {
  IconChevron,
  IconClose,
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
  onCreateChannel?: (name: string, type: ChannelType, categoryId: string | null) => Promise<string | null>;
  onCreateCategory?: (name: string) => Promise<string | null>;
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
  onCreateChannel,
  onCreateCategory,
}: ChannelListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragChannelId, setDragChannelId] = useState<string | null>(null);
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

  const byCategory = (catId: string | null) =>
    channels.filter((c) => c.category_id === catId).sort((a, b) => a.position - b.position);

  const dropCategory = (catId: string | null) => {
    if (dragChannelId && onMoveChannel) {
      onMoveChannel(dragChannelId, catId, byCategory(catId).length);
    }
    setDragChannelId(null);
    setOverCatId(null);
    setOverChannelId(null);
  };

  const dropOnChannel = (target: Channel) => {
    if (dragChannelId && dragChannelId !== target.id && onMoveChannel) {
      const list = byCategory(target.category_id);
      const index = list.findIndex((c) => c.id === target.id);
      onMoveChannel(dragChannelId, target.category_id, index);
    }
    setDragChannelId(null);
    setOverCatId(null);
    setOverChannelId(null);
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

  const sortedCategories = [...categories].sort((a, b) => a.position - b.position);
  const uncategorized = byCategory(null);

  const renderChannel = (ch: Channel) => {
    const active = ch.id === activeChannelId;
    const participants = ch.type === "voice" ? voicePresence.get(ch.id) ?? [] : [];
    return (
      <div key={ch.id} className="relative">
        {overChannelId === ch.id && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded bg-brand" />}
        <button
          type="button"
          draggable={canManageChannels}
          onDragStart={(e) => {
            setDragChannelId(ch.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", ch.id);
          }}
          onDragEnd={() => {
            setDragChannelId(null);
            setOverCatId(null);
            setOverChannelId(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOverChannelId(ch.id);
          }}
          onDragLeave={() => {
            if (overChannelId === ch.id) setOverChannelId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dropOnChannel(ch);
          }}
          onClick={() => onSelectChannel(ch.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            onChannelContext?.(ch, e.clientX, e.clientY);
          }}
          className={`mb-0.5 flex w-full items-center gap-1.5 rounded px-1 py-[6px] text-[15px] transition-all duration-150 ease-in-out ${
            active ? "bg-interactive-selected text-text-normal" : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          } ${canManageChannels ? "cursor-grab active:cursor-grabbing" : ""}`}
        >
          {ch.type === "text" ? <IconHash size={20} /> : <IconSpeaker size={20} />}
          <span className="min-w-0 flex-1 truncate text-left">{ch.name}</span>
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
      <div className="group/cat relative flex items-center">
        {overCatId === cat.id && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded bg-brand" />}
        <button
          type="button"
          onClick={() => setCollapsed((p) => ({ ...p, [cat.id]: !open }))}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setOverCatId(cat.id);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dropCategory(cat.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCategoryContext?.(cat, e.clientX, e.clientY);
          }}
          className={`flex min-w-0 flex-1 items-center gap-0.5 px-0.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-all duration-150 ${
            overCatId === cat.id ? "text-brand" : "text-text-muted hover:text-text-normal"
          }`}
        >
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
              {open && canManageChannels && addChannelTarget?.categoryId === cat.id && (
                <div className="mb-1 flex items-center gap-1 px-1">
                  <input
                    autoFocus
                    value={addChannelName}
                    onChange={(e) => setAddChannelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitAddChannel();
                      if (e.key === "Escape") setAddChannelTarget(null);
                    }}
                    placeholder="New channel"
                    className="min-w-0 flex-1 rounded bg-bg-accent px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setAddChannelType((t) => (t === "text" ? "voice" : "text"))}
                    className="shrink-0 rounded bg-bg-accent p-1 text-text-muted"
                    title={addChannelType === "text" ? "Text channel" : "Voice channel"}
                  >
                    {addChannelType === "text" ? <IconHash size={14} /> : <IconSpeaker size={14} />}
                  </button>
                  <button type="button" onClick={() => void submitAddChannel()} disabled={busy} className="text-xs text-brand">
                    Add
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {(uncategorized.length > 0 || canManageChannels) && (
          <div className="mb-1">
            <div className="group/cat relative flex items-center">
              {overCatId === "uncategorized" && <div className="absolute inset-x-1 -top-0.5 h-0.5 rounded bg-brand" />}
              <span
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  setOverCatId("uncategorized");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dropCategory(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={`flex min-w-0 flex-1 cursor-default items-center gap-0.5 px-0.5 py-1 text-[11px] font-bold uppercase tracking-wide text-text-muted ${
                  overCatId === "uncategorized" ? "text-brand" : ""
                }`}
              >
                Uncategorized
              </span>
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
            {uncategorized.map((ch) => renderChannel(ch))}
            {canManageChannels && addChannelTarget !== null && addChannelTarget.categoryId === null && (
              <div className="mb-1 flex items-center gap-1 px-1">
                <input
                  autoFocus
                  value={addChannelName}
                  onChange={(e) => setAddChannelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitAddChannel();
                    if (e.key === "Escape") setAddChannelTarget(null);
                  }}
                  placeholder="New channel"
                  className="min-w-0 flex-1 rounded bg-bg-accent px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                  type="button"
                  onClick={() => setAddChannelType((t) => (t === "text" ? "voice" : "text"))}
                  className="shrink-0 rounded bg-bg-accent p-1 text-text-muted"
                  title={addChannelType === "text" ? "Text channel" : "Voice channel"}
                >
                  {addChannelType === "text" ? <IconHash size={14} /> : <IconSpeaker size={14} />}
                </button>
                <button type="button" onClick={() => void submitAddChannel()} disabled={busy} className="text-xs text-brand">
                  Add
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <CallIndicator />
      <UserPanel onOpenSettings={onOpenSettings} onOpenProfile={onOpenProfile} onContextMenu={onUserPanelContext} />
    </aside>
  );
}
