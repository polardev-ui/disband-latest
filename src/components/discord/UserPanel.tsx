"use client";

import { useState, useCallback, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/hooks/useSubscription";
import { usePresence } from "@/hooks/usePresence";
import { SubscriptionBadge } from "@/components/ui/SubscriptionBadge";
import { Tooltip } from "./Tooltip";
import {
  IconHeadphones,
  IconHeadphonesOff,
  IconMic,
  IconMicOff,
  IconSettings,
} from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { GuildTag } from "@/components/ui/GuildTag";
import { displayName } from "@/lib/utils";
import { statusLabel, activeStatusNote } from "@/lib/presence";
import { UserPanelPopup } from "./UserPanelPopup";
import type { UserStatus } from "@/lib/supabase/types";

const STATUS_BG: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

interface UserPanelProps {
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function UserPanel({ onOpenSettings, onOpenProfile, onContextMenu }: UserPanelProps) {
  const { profile, user, micMuted, deafened, setMicMuted, setDeafened, presenceMap, voiceJoinedChannelId } = useApp();
  const { t } = useI18n();
  const { plan } = useSubscription(profile?.id);
  const [popupOpen, setPopupOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { mounted: popupMounted, exiting: popupExiting } = usePresence(popupOpen);

  const name = profile
    ? displayName(profile)
    : user?.email?.split("@")[0] ?? "You";
  const status: UserStatus = profile ? presenceMap.get(profile.id) ?? profile.status : "online";
  const statusLabelText = statusLabel(status);

  const liveNote = activeStatusNote(profile);

  const handleAvatarClick = useCallback(() => {
    setPopupOpen((prev) => !prev);
  }, []);

  return (
    <div className="shrink-0 px-2 pb-3 pt-1">
    <div
      ref={panelRef}
      className="flex h-[52px] items-center gap-0.5 rounded-xl border border-border-subtle bg-bg-secondary-alt px-1.5"
      onContextMenu={onContextMenu}
    >
      {popupMounted && (
        <UserPanelPopup
          anchorRef={panelRef}
          exiting={popupExiting}
          onClose={() => setPopupOpen(false)}
          onOpenSettings={onOpenSettings}
          onOpenProfile={onOpenProfile}
        />
      )}
      <button
        type="button"
        onClick={handleAvatarClick}
        aria-label={t("Open your profile")}
        className="mr-1 flex min-w-[120px] flex-1 items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 text-left transition-colors duration-100 hover:bg-interactive-hover"
      >
        <div className="relative shrink-0">
          <Avatar profile={profile ?? { display_name: name }} size="sm" />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-[14px] w-[14px] rounded-full border-[3px] border-bg-secondary-alt ${STATUS_BG[status]}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <p className="truncate text-[14px] font-semibold leading-[18px] text-header-primary">{name}</p>
            <GuildTag userId={profile?.id} size="sm" />
            <SubscriptionBadge plan={plan} tooltip />
          </div>
          <p className="truncate text-[12px] leading-[15px] text-text-muted">
            {liveNote ?? statusLabelText}
          </p>
        </div>
      </button>

      <PanelIconButton
        label={micMuted ? t("Unmute") : t("Mute")}
        pressed={micMuted}
        danger={micMuted}
        onClick={() => setMicMuted(!micMuted)}
      >
        {micMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
      </PanelIconButton>
      <PanelIconButton
        label={deafened ? t("Undeafen") : t("Deafen")}
        pressed={deafened}
        danger={deafened}
        onClick={() => {
          const next = !deafened;
          setDeafened(next);
          if (next) setMicMuted(true);
        }}
      >
        {deafened ? <IconHeadphonesOff size={20} /> : <IconHeadphones size={20} />}
      </PanelIconButton>
      <PanelIconButton label={t("User Settings")} onClick={onOpenSettings} spin>
        <IconSettings size={20} />
      </PanelIconButton>
    </div>
    </div>
  );
}

/** The 32px icon buttons on the user panel. Muted/deafened turn red. */
function PanelIconButton({
  label,
  pressed,
  danger,
  spin,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  danger?: boolean;
  spin?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        aria-label={t(label)}
        aria-pressed={pressed}
        onClick={onClick}
        className={`group flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-100 ${
          danger
            ? "bg-status-dnd/15 text-status-dnd hover:bg-status-dnd/25"
            : "text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
        }`}
      >
        <span className={spin ? "transition-transform duration-500 group-hover:rotate-90" : undefined}>{children}</span>
      </button>
    </Tooltip>
  );
}
