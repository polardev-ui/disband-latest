"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { ClassicModal, classicBtn } from "@/components/ui/ClassicModal";
import { ServerBadge, SERVER_BADGE_LABEL, serverBadgeFor } from "@/components/ui/ServerBadge";
import { IconLock } from "@/components/icons";
import { safeImageUrl } from "@/lib/safe-url";
import { serverInitials } from "@/lib/utils";
import {
  fetchGuildTagSpace,
  hideGuildTagSpace,
  useGuildTagSpaceServerId,
  type GuildTagSpace,
} from "@/lib/guild-tags";

/**
 * The card behind a guild tag. A tag is a small piece of a space's identity,
 * so clicking one should answer "what is this place?" without a join being
 * implied. Discoverable spaces get a Join button; invite-only spaces show
 * their profile but no door; a private tag shows nothing at all.
 */
export function GuildTagSpaceModal() {
  const serverId = useGuildTagSpaceServerId();
  const { servers, joinServerById, selectServer } = useApp();
  const [space, setSpace] = useState<GuildTagSpace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!serverId) {
      setSpace(null);
      setError(null);
      setLoading(false);
      setJoinError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSpace(null);
    setError(null);
    setJoinError(null);
    void fetchGuildTagSpace(serverId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      setSpace(result.space);
      setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  if (!serverId) return null;

  const joined = !space || space.private ? false : space.joined || servers.some((s) => s.id === space.server_id);
  const canJoin = !!space && !space.private && space.discoverable && !joined;

  const title = space?.private ? "Private space" : loading ? "Space" : space?.name ?? "Space";

  async function join() {
    if (!space || space.private) return;
    setJoining(true);
    setJoinError(null);
    const message = await joinServerById(space.server_id);
    setJoining(false);
    if (message) {
      setJoinError(message);
      return;
    }
    hideGuildTagSpace();
  }

  async function open() {
    if (!space || space.private) return;
    hideGuildTagSpace();
    await selectServer(space.server_id);
  }

  const badgeKind = space && !space.private
    ? serverBadgeFor({ verified: space.verified, partner: space.partner })
    : null;

  return (
    <ClassicModal
      open
      title={title}
      onClose={hideGuildTagSpace}
      width={470}
      centered={false}
      footer={
        <>
          <button type="button" onClick={hideGuildTagSpace} className={`${classicBtn.grey} ${classicBtn.md}`}>
            Close
          </button>
          {joined && (
            <button type="button" onClick={() => void open()} className={`${classicBtn.brand} ${classicBtn.md}`}>
              Open Space
            </button>
          )}
          {canJoin && (
            <button type="button" disabled={joining} onClick={() => void join()} className={`${classicBtn.brand} ${classicBtn.md}`}>
              {joining ? "Joining…" : "Join Space"}
            </button>
          )}
        </>
      }
    >
      {loading ? (
        <div className="space-y-3" aria-hidden>
          <div className="skeleton-glimmer h-24 w-full rounded-[6px]" />
          <div className="skeleton-glimmer h-5 w-2/3 rounded" />
          <div className="skeleton-glimmer h-4 w-full rounded" />
          <div className="skeleton-glimmer h-4 w-4/5 rounded" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-[4px] border border-status-dnd/30 bg-status-dnd/10 px-3.5 py-3 text-[14px] text-status-dnd">
          {error}
        </p>
      ) : space?.private ? (
        <div className="flex flex-col items-center py-5 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-tertiary text-text-muted">
            <IconLock size={24} />
          </span>
          <p className="mt-4 max-w-[320px] text-[14px] leading-5 text-text-muted">
            This space keeps its identity private. The tag is real, but the people wearing it have chosen not to reveal where it comes from.
          </p>
        </div>
      ) : space ? (
        <div className="overflow-hidden rounded-[6px] border border-divider/70 bg-bg-secondary">
          <div className="relative h-[104px] bg-brand">
            {safeImageUrl(space.banner_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={safeImageUrl(space.banner_url) || undefined} alt="" className="h-full w-full object-cover" />
            )}
            <span className="absolute -bottom-6 left-4 rounded-[15px] bg-bg-secondary p-1">
              {safeImageUrl(space.icon_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={safeImageUrl(space.icon_url) || undefined} alt="" className="h-12 w-12 rounded-[12px] object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-brand text-[15px] font-semibold text-white">
                  {serverInitials(space.name)}
                </span>
              )}
            </span>
          </div>
          <div className="px-4 pb-4 pt-9">
            <p className="flex min-w-0 items-center gap-1.5 text-[18px] font-semibold leading-6 text-header-primary">
              {badgeKind && (
                <span title={SERVER_BADGE_LABEL[badgeKind]}>
                  <ServerBadge kind={badgeKind} size={17} />
                </span>
              )}
              <span className="truncate">{space.name}</span>
            </p>
            <p className="mt-1 min-h-[40px] text-[14px] leading-5 text-header-secondary">
              {space.description || "No description yet."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-status-online" aria-hidden />
                {space.online_count.toLocaleString()} online
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#80848e]" aria-hidden />
                {space.member_count.toLocaleString()} {space.member_count === 1 ? "member" : "members"}
              </span>
            </div>
            {!space.discoverable && !joined && (
              <p className="mt-3 rounded-[4px] bg-bg-tertiary px-3 py-2 text-[12px] leading-4 text-text-muted">
                This space isn&apos;t discoverable. Ask someone inside for an invite to join.
              </p>
            )}
            {joinError && (
              <p role="alert" className="mt-3 text-[12px] leading-4 text-status-dnd">
                {joinError}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </ClassicModal>
  );
}
