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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close space settings"
        className={`absolute inset-0 bg-overlay-scrim overlay-fade${exiting ? " overlay-fade-out" : ""}`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${activeServer.name} settings`}
        className={`modal-pop${exiting ? " modal-pop-out" : ""} relative flex h-[min(840px,calc(100vh-3rem))] w-full max-w-[1120px] overflow-hidden rounded-[22px] border border-divider bg-overlay-panel shadow-[0_40px_100px_-30px_rgba(0,0,0,0.85)]`}
      >
        <nav aria-label="Space settings sections" className="hidden w-[256px] shrink-0 flex-col border-r border-divider bg-bg-secondary sm:flex">
          <div className="flex items-center gap-3 px-4 pb-3 pt-5">
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-10 w-10 shrink-0 rounded-[30%] object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[30%] bg-brand text-[13px] font-semibold text-white">
                {serverInitials(activeServer.name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-tight text-text-normal">{activeServer.name}</p>
              <button
                type="button"
                onClick={() => setSection("catalysts")}
                className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-text-muted transition-colors hover:text-text-normal"
              >
                <IconSparkle size={11} className={level > 0 ? "text-brand" : undefined} />
                {level > 0 ? `Level ${level}` : "No Catalyst level"}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {GROUPS.map((group) => {
              const items = navItems.filter((n) => n.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mt-3 first:mt-1">
                  <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted/80">{group}</h2>
                  {items.map((n) => (
                    <NavButton key={n.id} item={n} active={section === n.id} onSelect={() => setSection(n.id)} />
                  ))}
                </div>
              );
            })}
          </div>

          {isOwner && (
            <div className="border-t border-divider p-3">
              <button
                type="button"
                aria-current={section === "danger" ? "page" : undefined}
                onClick={() => setSection("danger")}
                className={`flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] text-status-dnd transition-colors ${
                  section === "danger" ? "bg-status-dnd/12" : "hover:bg-status-dnd/10"
                }`}
              >
                <IconTrash size={17} />
                Delete space
              </button>
            </div>
          )}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 px-8 pb-4 pt-6">
            <div className="min-w-0 flex-1">
              <select
                value={current.id}
                onChange={(e) => setSection(e.target.value as Section)}
                aria-label="Space settings section"
                className="w-full rounded-[10px] border border-divider bg-bg-accent px-2 py-1.5 text-lg font-semibold outline-none focus:border-brand sm:hidden"
              >
                {allItems.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
              <h1 className="hidden text-[22px] font-semibold tracking-[-0.02em] text-text-normal sm:block">{current.label}</h1>
              <p className="mt-1 hidden text-[14px] text-text-muted sm:block">{current.description}</p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close space settings"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-divider text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
              >
                <IconClose size={17} />
              </button>
              <span aria-hidden className="hidden text-[10.5px] font-medium uppercase tracking-wide text-text-muted/70 sm:block">Esc</span>
            </div>
          </header>

          <div key={`${activeServer.id}:${current.id}`} className="view-enter flex-1 overflow-y-auto px-8 pb-8 pt-2">
            <div className={current.id === "roles" ? "max-w-[860px]" : "max-w-[720px]"}>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={`relative mb-px flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] transition-colors duration-150 ${
        active ? "bg-interactive-selected font-medium text-text-normal" : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
      }`}
    >
      {active && <span aria-hidden className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-r-full bg-brand" />}
      <Icon size={17} className={active ? "text-text-normal" : "text-text-muted"} />
      {item.label}
    </button>
  );
}
