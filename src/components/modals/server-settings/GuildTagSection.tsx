"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import {
  GUILD_TAG_COLORS,
  GUILD_TAG_ICONS,
  fetchServerGuildTag,
  guildTagError,
  normalizeGuildTagColor,
  removeServerGuildTag,
  sanitizeGuildTag,
  saveServerGuildTag,
  type GuildTag,
  type GuildTagIcon,
} from "@/lib/guild-tags";
import { invalidateAllGuildTags } from "@/lib/guild-tag-store";
import { GuildTagBadge, PixelGuildIcon } from "@/components/ui/GuildTag";
import { FieldLabel, InlineError, LevelLock, SettingsSection, SettingRow, Toggle, btn, settingsInputClass } from "./ui";
import type { SectionProps } from "./types";

const DEFAULT_COLOR = "#5865f2";

export function GuildTagSection({ server, isOwner, catalystCount, onBoost }: SectionProps) {
  const { serverPermissions } = useApp();
  const canEdit = isOwner || !!serverPermissions.manage_server;
  const unlocked = catalystCount >= 6;

  const [existing, setExisting] = useState<GuildTag | null>(null);
  const [tag, setTag] = useState("");
  const [icon, setIcon] = useState<GuildTagIcon>("star");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"saved" | "removed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeArmed, setRemoveArmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setRemoveArmed(false);

    void fetchServerGuildTag(server.id).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setExisting(result.tag);
      setTag(result.tag?.tag ?? "");
      setIcon(result.tag?.icon ?? "star");
      setColor(result.tag?.color ?? DEFAULT_COLOR);
      setIsPrivate(result.tag?.is_private === true);
    });

    return () => {
      cancelled = true;
    };
  }, [server.id]);

  if (!canEdit) {
    return (
      <p className="text-[14px] leading-5 text-text-muted">
        Only people with Manage Space can change this space&apos;s guild tag.
      </p>
    );
  }

  if (!unlocked) {
    return (
      <div className="pb-10">
        <SettingsSection
          title="Guild tag"
          description="A short label, a pixel icon and a colour members can wear next to their name."
        >
          <LevelLock
            level={3}
            count={catalystCount}
            perk="Guild tags"
            onBoost={onBoost}
          />
          <div className="border-t border-divider/60 px-5 py-4">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
              Eight icons, any colour
            </p>
            <div className="flex flex-wrap gap-2 text-text-muted/70">
              {GUILD_TAG_ICONS.map((item) => (
                <span
                  key={item.id}
                  className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-divider/70 bg-bg-tertiary"
                  title={item.label}
                >
                  <PixelGuildIcon icon={item.id} size={24} />
                </span>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-5 text-text-muted">
              Once the tag exists, anyone in {server.name} can wear it. Wearing a tag never needs a Catalyst.
            </p>
          </div>
        </SettingsSection>
      </div>
    );
  }

  const tagProblem = guildTagError(tag);
  const normalizedColor = normalizeGuildTagColor(color) ?? DEFAULT_COLOR;
  const dirty = existing
    ? existing.tag !== tag || existing.icon !== icon || existing.color !== normalizedColor || (existing.is_private === true) !== isPrivate
    : tag.length > 0;
  const preview: GuildTag = {
    server_id: server.id,
    tag: sanitizeGuildTag(tag) || "TAG",
    icon,
    color: normalizedColor,
    is_private: isPrivate,
  };

  function changeTag(next: string) {
    setTag(sanitizeGuildTag(next));
    setNotice(null);
    setRemoveArmed(false);
  }

  function changeIcon(next: GuildTagIcon) {
    setIcon(next);
    setNotice(null);
    setRemoveArmed(false);
  }

  function changeColor(next: string) {
    const normalized = normalizeGuildTagColor(next);
    if (!normalized) return;
    setColor(normalized);
    setNotice(null);
    setRemoveArmed(false);
  }

  function changePrivate(next: boolean) {
    setIsPrivate(next);
    setNotice(null);
    setRemoveArmed(false);
  }

  async function save() {
    if (tagProblem) {
      setError(tagProblem);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await saveServerGuildTag(server.id, { tag, icon, color: normalizedColor, isPrivate });
    setSaving(false);
    if (result.error || !result.tag) {
      setError(result.error ?? "Could not save the guild tag.");
      return;
    }
    setExisting(result.tag);
    setTag(result.tag.tag);
    setIcon(result.tag.icon);
    setColor(result.tag.color);
    setIsPrivate(result.tag.is_private === true);
    setNotice("saved");
    setRemoveArmed(false);
    invalidateAllGuildTags();
  }

  async function remove() {
    if (!removeArmed) {
      setRemoveArmed(true);
      setNotice(null);
      return;
    }
    setSaving(true);
    setError(null);
    const message = await removeServerGuildTag(server.id);
    setSaving(false);
    setRemoveArmed(false);
    if (message) {
      setError(message);
      return;
    }
    setExisting(null);
    setNotice("removed");
    invalidateAllGuildTags();
  }

  return (
    <div className="pb-10">
      <SettingsSection
        title="Tag design"
        description="A 1–4 character label, one of eight pixel icons, and a colour. Members can wear it next to their name everywhere."
      >
        {loading ? (
          <div className="space-y-4 p-5" aria-hidden>
            <div className="skeleton-glimmer h-10 w-full rounded-[3px]" />
            <div className="skeleton-glimmer h-9 w-2/3 rounded-[3px]" />
            <div className="skeleton-glimmer h-8 w-1/2 rounded-[3px]" />
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <FieldLabel htmlFor="guild-tag-text" aside={`${tag.length}/4`}>
                  Tag
                </FieldLabel>
                <input
                  id="guild-tag-text"
                  value={tag}
                  onChange={(e) => changeTag(e.target.value)}
                  maxLength={4}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="DISC"
                  aria-describedby="guild-tag-text-help"
                  className={`${settingsInputClass} uppercase tracking-[0.08em]`}
                />
                <p id="guild-tag-text-help" className="mt-1.5 text-[12px] leading-4 text-text-muted">
                  Letters, numbers, dots, underscores or hyphens.
                </p>
              </div>
              <div>
                <FieldLabel>Preview</FieldLabel>
                <div className="flex h-[46px] items-center gap-2 rounded-[3px] bg-bg-tertiary px-3">
                  <span className="text-[16px] font-medium text-header-primary">polar</span>
                  <GuildTagBadge tag={preview} />
                </div>
              </div>
            </div>

            <div>
              <FieldLabel>Icon</FieldLabel>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {GUILD_TAG_ICONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => changeIcon(item.id)}
                    aria-label={item.label}
                    aria-pressed={icon === item.id}
                    title={item.label}
                    className={`flex aspect-square items-center justify-center rounded-[4px] border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      icon === item.id
                        ? "border-brand bg-brand/15"
                        : "border-divider/70 bg-bg-tertiary hover:bg-interactive-hover"
                    }`}
                    style={{ color: normalizedColor }}
                  >
                    <PixelGuildIcon icon={item.id} size={24} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel aside={normalizedColor.toUpperCase()}>Colour</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                {GUILD_TAG_COLORS.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => changeColor(choice)}
                    aria-label={`Use ${choice}`}
                    aria-pressed={normalizedColor === choice}
                    title={choice}
                    className={`h-8 w-8 rounded-full border-2 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      normalizedColor === choice ? "scale-110 border-white" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: choice }}
                  />
                ))}
                <label
                  className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-divider bg-bg-tertiary text-[17px] font-medium text-text-muted transition-colors hover:bg-interactive-hover"
                  title="Pick any colour"
                >
                  +
                  <input
                    type="color"
                    value={normalizedColor}
                    onChange={(e) => changeColor(e.target.value)}
                    aria-label="Pick a custom guild tag colour"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[4px] border border-divider/70 bg-bg-tertiary/60">
              <SettingRow
                label="Private tag"
                description={`People can still wear the ${sanitizeGuildTag(tag) || "TAG"} tag, but clicking it says this space is private instead of showing the space's profile.`}
                htmlFor="guild-tag-private"
              >
                <Toggle id="guild-tag-private" checked={isPrivate} onChange={changePrivate} label="Private tag" />
              </SettingRow>
            </div>

            {error && <InlineError>{error}</InlineError>}
            {notice && (
              <p role="status" className="rounded-[4px] border border-status-online/25 bg-status-online/8 px-3.5 py-2.5 text-[13px] text-status-online">
                {notice === "removed"
                  ? "Removed. It no longer appears on anyone's profile."
                  : `Saved. Anyone in ${server.name} can wear it from Profile settings.`}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider/60 pt-4">
              <div>
                {existing && (
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={saving}
                    className={btn.dangerGhost}
                  >
                    {removeArmed ? "Click again to remove" : "Remove tag"}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !dirty || !!tagProblem}
                className={btn.primary}
              >
                {saving ? "Saving…" : existing ? "Save changes" : "Create tag"}
              </button>
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Who can wear it"
        description="Wearing a guild tag is a profile choice, not a role or a Catalyst perk."
      >
        <div className="space-y-2 px-5 py-4 text-[14px] leading-5 text-text-muted">
          <p>
            Anyone who is a member of {server.name} can wear this tag. Only one tag can be worn at a time.
          </p>
          <p>
            If you change the tag, icon or colour later, everyone wearing it will need to put it on again.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
