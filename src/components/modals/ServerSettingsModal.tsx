"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";
import type { ServerPermissionKey } from "@/lib/supabase/types";
import { catalystLevel } from "@/lib/catalysts";
import { useApp } from "@/contexts/AppContext";
import {
  IconClose,
  IconEmoji,
  IconFriends,
  IconHash,
  IconImage,
  IconLink,
  IconLock,
  IconNotes,
  IconSettings,
  IconShield,
  IconSparkle,
  IconSpeaker,
  IconTrash,
} from "@/components/icons";
import { safeImageUrl } from "@/lib/safe-url";
import { serverInitials } from "@/lib/utils";
import { RoleManager } from "@/components/modals/RoleManager";
import { AuditLogPanel } from "@/components/modals/AuditLogPanel";
import { SettingsLayer, SettingsNavHeader, SettingsNavItem, SettingsNavSeparator } from "@/components/ui/SettingsLayer";
import { OverviewSection } from "./server-settings/OverviewSection";
import { AppearanceSection } from "./server-settings/AppearanceSection";
import { InvitesSection } from "./server-settings/InvitesSection";
import { CatalystSection } from "./server-settings/CatalystSection";
import { ChannelsSection } from "./server-settings/ChannelsSection";
import { MembersSection } from "./server-settings/MembersSection";
import { BansSection } from "./server-settings/BansSection";
import { EmojiSection } from "./server-settings/EmojiSection";
import { SoundboardSection } from "./server-settings/SoundboardSection";
import { DangerSection } from "./server-settings/DangerSection";

interface ServerSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onEditChannel?: (channel: { id: string; name: string; type: string }) => void;
  /** Opens the Catalyst sheet for this space. */
  onOpenCatalysts?: () => void;
}

type Section =
  | "overview"
  | "appearance"
  | "invite"
  | "catalysts"
  | "members"
  | "roles"
  | "bans"
  | "channels"
  | "emoji"
  | "soundboard"
  | "audit"
  | "danger";

type Group = "Space" | "People" | "Content" | "Moderation";

interface NavItem {
  id: Section;
  label: string;
  description: string;
  group: Group;
  icon: ComponentType<{ size?: number; className?: string }>;
  ownerOnly?: boolean;
  permission?: ServerPermissionKey;
}

const NAV: NavItem[] = [
  { id: "overview", label: "Overview", group: "Space", icon: IconSettings, description: "Your space's name, description and whether people can find it." },
  { id: "appearance", label: "Icon & banner", group: "Space", icon: IconImage, ownerOnly: true, description: "The pictures people see in the sidebar, on invites and in Discover." },
  { id: "invite", label: "Invites", group: "Space", icon: IconLink, description: "Share a link, claim a custom one, or send invites to friends." },
  { id: "catalysts", label: "Catalysts", group: "Space", icon: IconSparkle, description: "Perks unlocked by members boosting this space." },
  { id: "members", label: "Members", group: "People", icon: IconFriends, permission: "manage_roles", description: "Everyone in this space. Assign roles, kick or ban." },
  { id: "roles", label: "Roles", group: "People", icon: IconShield, permission: "manage_roles", description: "Group members, give them a colour and icon, and decide what they can do." },
  { id: "bans", label: "Bans", group: "People", icon: IconLock, permission: "ban", description: "People who can't rejoin until you lift their ban." },
  { id: "channels", label: "Channels", group: "Content", icon: IconHash, permission: "manage_channels", description: "Create, rename and remove text and voice channels." },
  { id: "emoji", label: "Emoji", group: "Content", icon: IconEmoji, ownerOnly: true, description: "Custom emoji everyone here can use in chat." },
  { id: "soundboard", label: "Soundboard", group: "Content", icon: IconSpeaker, ownerOnly: true, description: "Short sounds members can play in voice channels and calls." },
  { id: "audit", label: "Audit log", group: "Moderation", icon: IconNotes, permission: "view_audit_log", description: "Who kicked, banned, timed out or deleted what, most recent first." },
];

const DANGER: NavItem = {
  id: "danger",
  label: "Delete space",
  group: "Moderation",
  icon: IconTrash,
  ownerOnly: true,
  description: "Permanent actions that can't be undone.",
};

const GROUPS: Group[] = ["Space", "People", "Content", "Moderation"];

export function ServerSettingsModal({ open, onClose, onEditChannel, onOpenCatalysts }: ServerSettingsModalProps) {
  const { activeServer, user, serverPermissions, catalystCounts } = useApp();
  const [section, setSection] = useState<Section>("overview");

  // Each opening starts at the top; switching spaces does too.
  useEffect(() => {
    if (open) setSection("overview");
  }, [open, activeServer?.id]);

  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);

  const isOwner = !!activeServer && activeServer.owner_id === user?.id;
  const navItems = useMemo(
    () =>
      NAV.filter((n) => {
        if (n.ownerOnly && !isOwner) return false;
        if (n.permission && !(isOwner || serverPermissions[n.permission])) return false;
        return true;
      }),
    [isOwner, serverPermissions],
  );

  if (!mounted || !activeServer) return null;

  const catalystCount = catalystCounts[activeServer.id] ?? 0;
  const level = catalystLevel(catalystCount).level;
  const allItems = isOwner ? [...navItems, DANGER] : navItems;
  const current = allItems.find((n) => n.id === section) ?? allItems[0];
  const icon = safeImageUrl(activeServer.icon_url);
  const boost = onOpenCatalysts
    ? () => {
        onClose();
        onOpenCatalysts();
      }
    : undefined;

  const shared = { server: activeServer, isOwner, catalystCount, onBoost: boost };

  return (
    <SettingsLayer
      label={`${activeServer.name} settings`}
      exiting={exiting}
      onClose={onClose}
      contentKey={`${activeServer.id}:${current.id}`}
      wide={current.id === "roles"}
      mobileNav={
        <select
          value={current.id}
          onChange={(e) => setSection(e.target.value as Section)}
          aria-label="Space settings section"
          className="w-full rounded-[4px] bg-bg-tertiary px-2 py-2 text-[16px] font-semibold text-text-normal outline-none"
        >
          {allItems.map((n) => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>
      }
      sidebar={
        <>
          <div className="mb-1 flex items-center gap-2 px-2.5 pb-1.5">
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            ) : null}
            <h2 className="truncate text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-channels-default">{activeServer.name}</h2>
          </div>
          {GROUPS.map((group, gi) => {
            const items = navItems.filter((n) => n.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                {gi > 0 && <SettingsNavSeparator />}
                {gi > 0 && <SettingsNavHeader>{group}</SettingsNavHeader>}
                {items.map((n) => (
                  <SettingsNavItem
                    key={n.id}
                    active={section === n.id}
                    onClick={() => setSection(n.id)}
                    trailing={
                      n.id === "catalysts" && level > 0 ? (
                        <span className="text-[12px] font-semibold text-[#ff73fa]">Lvl {level}</span>
                      ) : undefined
                    }
                  >
                    {n.label}
                  </SettingsNavItem>
                ))}
              </div>
            );
          })}
          {isOwner && (
            <>
              <SettingsNavSeparator />
              <SettingsNavItem danger active={section === "danger"} onClick={() => setSection("danger")} trailing={<IconTrash size={16} />}>
                Delete Space
              </SettingsNavItem>
            </>
          )}
        </>
      }
    >
      <h2 className="text-[20px] font-semibold leading-6 text-header-primary">{current.label}</h2>
      <p className="mb-5 mt-1 text-[14px] leading-5 text-text-muted">{current.description}</p>
      {current.id === "overview" && <OverviewSection {...shared} />}
      {current.id === "appearance" && <AppearanceSection {...shared} />}
      {current.id === "invite" && <InvitesSection {...shared} />}
      {current.id === "catalysts" && <CatalystSection {...shared} />}
      {current.id === "members" && <MembersSection {...shared} />}
      {current.id === "roles" && <RoleManager onBoost={boost} />}
      {current.id === "bans" && <BansSection {...shared} />}
      {current.id === "channels" && <ChannelsSection {...shared} onEditChannel={onEditChannel} />}
      {current.id === "emoji" && <EmojiSection {...shared} />}
      {current.id === "soundboard" && <SoundboardSection {...shared} />}
      {current.id === "audit" && <AuditLogPanel serverId={activeServer.id} />}
      {current.id === "danger" && <DangerSection {...shared} onDeleted={onClose} />}
    </SettingsLayer>
  );
}

