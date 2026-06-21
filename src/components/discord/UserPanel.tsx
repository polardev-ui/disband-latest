"use client";

import { useApp } from "@/contexts/AppContext";
import { Tooltip } from "./Tooltip";
import {
  IconHeadphones,
  IconHeadphonesOff,
  IconMic,
  IconMicOff,
  IconSettings,
} from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import type { UserStatus } from "@/lib/supabase/types";

const STATUS_BG: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

interface UserPanelProps {
  onOpenSettings: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/** Discord-style pinned user bar at the bottom of the channel/friends sidebar. */
export function UserPanel({ onOpenSettings, onContextMenu }: UserPanelProps) {
  const { profile, user, micMuted, deafened, setMicMuted, setDeafened } = useApp();

  const name = profile
    ? displayName(profile)
    : user?.email?.split("@")[0] ?? "You";
  const status: UserStatus = profile?.status ?? "online";
  const statusLabel =
    status === "dnd" ? "Do Not Disturb" : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div
      className="flex h-[52px] shrink-0 items-center gap-1 border-t border-black/20 bg-[#232428] px-2"
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex min-w-0 flex-1 items-center gap-2 rounded p-1 text-left transition-all duration-150 ease-in-out hover:bg-interactive-hover"
      >
        <div className="relative shrink-0">
          <Avatar profile={profile ?? { display_name: name }} size="sm" />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#232428] ${STATUS_BG[status]}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-text-normal">{name}</p>
          <p className="truncate text-xs leading-tight text-text-muted">{statusLabel}</p>
        </div>
      </button>

      <Tooltip label={micMuted ? "Unmute" : "Mute"} side="top">
        <button
          type="button"
          aria-pressed={micMuted}
          onClick={() => setMicMuted(!micMuted)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded transition-all duration-150 ease-in-out hover:bg-interactive-hover ${
            micMuted ? "text-status-dnd" : "text-text-muted hover:text-text-normal"
          }`}
        >
          {micMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
        </button>
      </Tooltip>

      <Tooltip label={deafened ? "Undeafen" : "Deafen"} side="top">
        <button
          type="button"
          aria-pressed={deafened}
          onClick={() => {
            const next = !deafened;
            setDeafened(next);
            if (next) setMicMuted(true);
          }}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded transition-all duration-150 ease-in-out hover:bg-interactive-hover ${
            deafened ? "text-status-dnd" : "text-text-muted hover:text-text-normal"
          }`}
        >
          {deafened ? <IconHeadphonesOff size={20} /> : <IconHeadphones size={20} />}
        </button>
      </Tooltip>

      <Tooltip label="User Settings" side="top">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-muted transition-all duration-150 ease-in-out hover:bg-interactive-hover hover:text-text-normal"
        >
          <IconSettings size={20} />
        </button>
      </Tooltip>
    </div>
  );
}
