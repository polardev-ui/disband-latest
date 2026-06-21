"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Tooltip } from "./Tooltip";
import {
  IconChevron,
  IconHash,
  IconHeadphones,
  IconHeadphonesOff,
  IconMic,
  IconMicOff,
  IconSearch,
  IconSettings,
  IconSpeaker,
} from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Channel, ChannelCategory } from "@/lib/supabase/types";

interface ChannelListProps {
  title: string;
  categories: ChannelCategory[];
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onOpenSettings: () => void;
  onOpenServerSettings?: () => void;
  onChannelContext?: (channel: Channel, x: number, y: number) => void;
  showServerHeader?: boolean;
}

export function ChannelList({
  title,
  categories,
  channels,
  activeChannelId,
  onSelectChannel,
  onOpenSettings,
  onOpenServerSettings,
  onChannelContext,
  showServerHeader = true,
}: ChannelListProps) {
  const { profile, micMuted, deafened, setMicMuted, setDeafened } = useApp();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-bg-secondary">
      {showServerHeader && (
        <button
          type="button"
          onClick={onOpenServerSettings}
          className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm transition-all duration-150 ease-in-out hover:bg-interactive-hover"
        >
          <span className="truncate text-[15px] font-semibold">{title}</span>
          <IconChevron size={18} className="shrink-0 text-text-muted" />
        </button>
      )}

      <div className="px-2 pt-2">
        <div className="flex h-7 items-center gap-2 rounded bg-bg-accent px-2 text-text-muted">
          <IconSearch size={14} />
          <span className="text-xs">Search</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {categories.map((cat) => {
          const items = channels.filter((c) => c.category_id === cat.id);
          if (items.length === 0) return null;
          const open = !collapsed[cat.id];
          return (
            <div key={cat.id} className="mb-1">
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [cat.id]: !open }))}
                className="flex w-full items-center gap-0.5 px-0.5 py-1 text-[11px] font-bold uppercase tracking-wide text-text-muted transition-all duration-150 hover:text-text-normal"
              >
                <IconChevron size={12} className={`transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
                {cat.name}
              </button>
              {open &&
                items.map((ch) => {
                  const active = ch.id === activeChannelId;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => onSelectChannel(ch.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onChannelContext?.(ch, e.clientX, e.clientY);
                      }}
                      className={`mb-0.5 flex w-full items-center gap-1.5 rounded px-1 py-[6px] text-[15px] transition-all duration-150 ease-in-out ${
                        active ? "bg-interactive-selected text-text-normal" : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                      }`}
                    >
                      {ch.type === "text" ? <IconHash size={20} /> : <IconSpeaker size={20} />}
                      <span className="truncate">{ch.name}</span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>

      <div className="flex h-[52px] shrink-0 items-center gap-1 bg-[#232428] px-2">
        <div className="relative shrink-0">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brand text-xs font-bold text-white">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              displayName(profile ?? {}).charAt(0).toUpperCase()
            )}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#232428] bg-status-online" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{displayName(profile ?? {})}</p>
          <p className="truncate text-xs capitalize leading-tight text-text-muted">{profile?.status ?? "online"}</p>
        </div>
        <Tooltip label={micMuted ? "Unmute" : "Mute"} side="top">
          <button type="button" onClick={() => setMicMuted(!micMuted)} className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-all duration-150 hover:bg-interactive-hover hover:text-text-normal">
            {micMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
          </button>
        </Tooltip>
        <Tooltip label={deafened ? "Undeafen" : "Deafen"} side="top">
          <button type="button" onClick={() => setDeafened(!deafened)} className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-all duration-150 hover:bg-interactive-hover hover:text-text-normal">
            {deafened ? <IconHeadphonesOff size={20} /> : <IconHeadphones size={20} />}
          </button>
        </Tooltip>
        <Tooltip label="User Settings" side="top">
          <button type="button" onClick={onOpenSettings} className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-all duration-150 hover:bg-interactive-hover hover:text-text-normal">
            <IconSettings size={20} />
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
