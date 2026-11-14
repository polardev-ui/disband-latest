"use client";

/*
 The sidebar shown under the rail's star: everything someone has favorited —
 channels from any space (grouped by space), DMs and group chats. Picking one
 opens it, wherever it lives, through the same router notifications use.

 Channels outside the space that's loaded are looked up by id; a channel the
 person can no longer see (left the space, deleted) reads as unavailable and
 can be removed.
*/

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toggleFavorite, useFavorites, type Favorite } from "@/lib/favorites";
import { alertDialog } from "@/lib/dialogs";
import { Avatar } from "@/components/ui/Avatar";
import { GroupAvatar } from "@/components/ui/GroupAvatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { displayName, serverInitials } from "@/lib/utils";
import { safeImageUrl, thumbImageUrl, mayBeAnimated } from "@/lib/safe-url";
import { IconClose, IconForum, IconHash, IconMegaphone, IconSpeaker, IconStar } from "@/components/icons";
import type { Channel } from "@/lib/supabase/types";

type ChannelInfo = Pick<Channel, "id" | "name" | "server_id" | "type" | "read_only" | "parent_id">;

export function FavoritesPanel() {
  const app = useApp();
  const { t } = useI18n();
  const favorites = useFavorites(app.user?.id);
  const [remote, setRemote] = useState<Map<string, ChannelInfo | null>>(new Map());

  const channelIds = useMemo(
    () => favorites.items.filter((f) => f.kind === "channel").map((f) => f.target_id),
    [favorites.items],
  );

  // Channels not in the loaded space: fetch once (RLS answers for access).
  useEffect(() => {
    const missing = channelIds.filter((id) => !app.channels.some((c) => c.id === id) && !remote.has(id));
    if (missing.length === 0) return;
    let alive = true;
    void (async () => {
      const { data } = await getSupabaseClient()
        .from("channels")
        .select("id, name, server_id, type, read_only, parent_id")
        .in("id", missing);
      if (!alive) return;
      const found = new Map(((data as ChannelInfo[] | null) ?? []).map((c) => [c.id, c]));
      setRemote((prev) => {
        const next = new Map(prev);
        for (const id of missing) next.set(id, found.get(id) ?? null);
        return next;
      });
    })();
    return () => {
      alive = false;
    };
    // `remote` is read to skip known ids, not to re-run on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelIds, app.channels]);

  const channelInfo = (id: string): ChannelInfo | null | undefined =>
    app.channels.find((c) => c.id === id) ?? remote.get(id);

  const remove = async (f: Favorite) => {
    if (!app.user?.id) return;
    const err = await toggleFavorite(app.user.id, f.kind, f.target_id);
    if (err) void alertDialog(err, t("Favorites"));
  };

  const open = (f: Favorite) => {
    void app.routeToNotification(`${f.kind}:${f.target_id}`).then((ok) => {
      if (!ok) void alertDialog(t("That conversation isn't available any more."), t("Favorites"));
    });
  };

  const channelGroups = useMemo(() => {
    const groups = new Map<string, Favorite[]>();
    for (const f of favorites.items) {
      if (f.kind !== "channel") continue;
      const info = channelInfo(f.target_id);
      const key = info ? info.server_id : "unavailable";
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    return [...groups.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites.items, app.channels, remote]);

  const people = favorites.items.filter((f) => f.kind === "dm" || f.kind === "group");

  const rowClass = (active: boolean) =>
    `group/fav mb-0.5 flex h-[38px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-[15px] font-medium transition-colors ${
      active ? "bg-interactive-selected text-interactive-active" : "text-channels-default hover:bg-interactive-hover hover:text-text-normal"
    }`;

  const removeButton = (f: Favorite, label: string) => (
    <span
      role="button"
      tabIndex={0}
      aria-label={t("Remove {name} from Favorites", { name: label })}
      title={t("Remove from Favorites")}
      onClick={(e) => {
        e.stopPropagation();
        void remove(f);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          void remove(f);
        }
      }}
      className="ml-auto hidden h-5 w-5 shrink-0 items-center justify-center rounded text-interactive-normal hover:text-interactive-active focus-visible:flex group-hover/fav:flex"
    >
      <IconClose size={14} />
    </span>
  );

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-bg-secondary">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-column-border px-4">
        <IconStar size={18} className="text-status-idle" />
        <h2 className="truncate text-[16px] font-semibold text-header-primary">{t("Favorites")}</h2>
      </div>

      <div className="channel-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {favorites.unavailable ? (
          <p className="px-2 py-6 text-[14px] text-text-muted">{t("Favorites aren't available right now.")}</p>
        ) : !favorites.loaded ? (
          <div className="space-y-1.5 pt-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-glimmer h-[34px] rounded-lg" />
            ))}
          </div>
        ) : favorites.items.length === 0 ? (
          <div className="flex flex-col items-center px-4 pt-14 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-tertiary text-status-idle">
              <IconStar size={26} />
            </span>
            <p className="text-[15px] font-semibold text-header-primary">{t("Nothing starred yet")}</p>
            <p className="mt-1 text-[13px] leading-5 text-text-muted">
              {t("Use the star in a channel or conversation header, or right-click one, to keep it here.")}
            </p>
          </div>
        ) : (
          <>
            {channelGroups.map(([serverId, items]) => {
              const server = app.servers.find((s) => s.id === serverId);
              const icon = thumbImageUrl(server?.icon_url, 32, { still: mayBeAnimated(server?.icon_url) });
              return (
                <div key={serverId} className="pt-4">
                  <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[13px] font-semibold text-channels-default">
                    {serverId !== "unavailable" && (
                      icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={icon} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-bg-tertiary text-[8px] font-bold text-text-normal">
                          {serverInitials(server?.name ?? "?").slice(0, 1)}
                        </span>
                      )
                    )}
                    <span className="truncate">{serverId === "unavailable" ? t("Unavailable") : server?.name ?? t("A space")}</span>
                  </p>
                  {items.map((f) => {
                    const info = channelInfo(f.target_id);
                    if (!info) {
                      return (
                        <div key={f.target_id} className={rowClass(false)}>
                          <IconHash size={18} className="shrink-0 opacity-50" />
                          <span className="truncate italic text-text-muted">{info === null ? t("Channel unavailable") : t("Loading…")}</span>
                          {removeButton(f, t("this channel"))}
                        </div>
                      );
                    }
                    const active = app.viewMode === "space" && app.activeChannelId === info.id;
                    const Icon = info.type === "voice" ? IconSpeaker : info.type === "forum" || info.parent_id ? IconForum : info.read_only ? IconMegaphone : IconHash;
                    const unread = !active && app.getChannelUnreadCount(info.id) > 0;
                    return (
                      <button key={f.target_id} type="button" onClick={() => open(f)} className={`${rowClass(active)} ${unread ? "text-interactive-active" : ""}`}>
                        <Icon size={18} className="shrink-0" />
                        <span className="truncate">{info.name}</span>
                        {removeButton(f, info.name)}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {people.length > 0 && (
              <div className="pt-4">
                <p className="px-2 pb-1.5 text-[13px] font-semibold text-channels-default">{t("Conversations")}</p>
                {people.map((f) => {
                  if (f.kind === "group") {
                    const group = app.groupChats.find((g) => g.id === f.target_id);
                    const active = app.viewMode === "group" && app.activeGroupChatId === f.target_id;
                    return (
                      <button key={f.target_id} type="button" onClick={() => open(f)} className={rowClass(active)}>
                        {group ? <GroupAvatar group={group} size={26} /> : <span className="h-[26px] w-[26px] shrink-0 rounded-full bg-bg-tertiary" />}
                        <span className="truncate">{group?.name ?? t("Group chat")}</span>
                        {removeButton(f, group?.name ?? t("this group"))}
                      </button>
                    );
                  }
                  const thread = app.dmThreads.find((d) => d.id === f.target_id);
                  const friend = thread?.friend;
                  const active = app.viewMode === "dm" && app.activeDmThreadId === f.target_id;
                  return (
                    <button key={f.target_id} type="button" onClick={() => open(f)} className={rowClass(active)}>
                      <span className="relative shrink-0">
                        <Avatar profile={friend ?? { display_name: "?" }} size="sm" className="!h-[26px] !w-[26px] !text-[11px]" />
                        {friend && (
                          <StatusDot
                            status={app.presenceMap.get(friend.id) ?? "offline"}
                            ring="var(--bg-secondary)"
                            className="absolute -bottom-[3px] -right-[3px]"
                          />
                        )}
                      </span>
                      <span className="truncate">{friend ? displayName(friend) : t("Direct message")}</span>
                      {removeButton(f, friend ? displayName(friend) : t("this conversation"))}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
