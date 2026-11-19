"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { BotTag } from "@/components/ui/BotTag";
import { IconBot, IconExternalLink } from "@/components/icons";
import { displayName } from "@/lib/utils";
import { ConfirmDialog, EmptyState, InlineError, btn, enterStyle } from "./ui";
import type { SectionProps } from "./types";
import { useI18n } from "@/contexts/I18nContext";

/** The bots in this space, with a way to remove them and to find more. */
export function AppsSection({ onOpenBotMarketplace }: SectionProps) {
  const { t } = useI18n();
  const { members, loadAllMembers, kickMember, serverPermissions, activeServer, user } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);

  useEffect(() => {
    void loadAllMembers();
  }, [loadAllMembers]);

  const bots = useMemo(
    () =>
      members
        .filter((m) => m.profile?.is_bot)
        .sort((a, b) => displayName(a.profile!).localeCompare(displayName(b.profile!))),
    [members],
  );
  const canRemove = activeServer?.owner_id === user?.id || !!serverPermissions.kick;

  return (
    <div className="pb-10">
      <button
        type="button"
        onClick={onOpenBotMarketplace}
        className="group mb-6 flex w-full items-center gap-4 rounded-xl border border-border-subtle bg-surface-raised px-5 py-4 text-left transition-colors hover:border-border-strong hover:bg-interactive-hover"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <IconBot size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-header-primary">{t("Bot Marketplace")}</span>
          <span className="block text-[13px] text-text-muted">{t("Find bots for moderation, music, games and more, and add them to this space.")}</span>
        </span>
        <IconExternalLink size={18} className="shrink-0 text-interactive-normal group-hover:text-interactive-active" />
      </button>

      <InlineError>{error}</InlineError>
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
        {t("In this space")} — {bots.length}
      </h3>
      <div className="overflow-hidden rounded-lg bg-bg-secondary">
        {bots.length === 0 ? (
          <EmptyState icon={<IconBot size={20} />} title={t("No bots yet")} body={t("Bots you add from the Bot Marketplace show up here.")} />
        ) : (
          <ul>
            {bots.map((m, i) => {
              const name = displayName(m.profile!);
              return (
                <li
                  key={m.user_id}
                  className="view-enter flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
                  style={enterStyle(i)}
                >
                  <Avatar profile={m.profile!} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[15px] font-medium text-header-primary">
                      <span className="truncate">{name}</span>
                      <BotTag profile={m.profile!} size="sm" />
                    </p>
                    <p className="text-[12px] text-text-muted">
                      {t("Added {date}", {
                        date: new Date(m.joined_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                      })}
                    </p>
                  </div>
                  {canRemove && (
                    <button type="button" onClick={() => setRemoving({ userId: m.user_id, name })} className={btn.ghost}>
                      {t("Remove")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        title={removing ? t("Remove {name}?", { name: removing.name }) : ""}
        body="It leaves the space and stops working here. You can add it again from the Bot Marketplace."
        confirmLabel={t("Remove bot")}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const err = await kickMember(removing.userId);
          if (err) setError(err);
          setRemoving(null);
        }}
      />
    </div>
  );
}
