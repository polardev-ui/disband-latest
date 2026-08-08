"use client";

import { Avatar } from "@/components/ui/Avatar";
import { UserBadges } from "@/components/ui/UserBadges";
import { getAccentBackground, getUsernameStyle } from "@/lib/profileColor";
import { safeImageUrl } from "@/lib/safe-url";
import type { Profile, UserStatus } from "@/lib/supabase/types";

const STATUS_BG: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  online: "Online",
  idle: "Away",
  dnd: "Do Not Disturb",
  offline: "Invisible",
};

/**
 * Live preview of the profile card as others will see it.
 *
 * Driven by the *unsaved* form state rather than the stored profile, so colour
 * and name edits are visible before committing — previously you had to save and
 * then go open your own profile to find out what you'd picked.
 */
export function ProfilePreview({
  profile,
  displayName,
  username,
  bio,
  status,
}: {
  profile: Profile;
  displayName: string;
  username: string;
  bio: string;
  status: UserStatus;
}) {
  const name = displayName.trim() || username.trim() || "Your name";
  const banner = safeImageUrl(profile.banner_url);

  return (
    <div className="overflow-hidden rounded-lg border border-divider bg-bg-tertiary">
      <div className="h-16 w-full" style={{ background: getAccentBackground(profile) }}>
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="px-4 pb-4">
        <div className="-mt-8 mb-3 flex items-end justify-between">
          <div className="relative">
            <span className="block rounded-full border-4 border-bg-tertiary">
              <Avatar profile={profile} size="lg" className="h-16 w-16 text-xl" />
            </span>
            <span
              className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-bg-tertiary ${STATUS_BG[status]}`}
              title={STATUS_LABEL[status]}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <p
            className="truncate text-[17px] font-semibold"
            style={getUsernameStyle(profile)}
          >
            {name}
          </p>
          <UserBadges profile={profile} />
        </div>

        {username.trim() && (
          <p className="truncate text-[13px] text-text-muted">@{username.trim()}</p>
        )}

        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-text-muted">
          {bio.trim() || "Your bio will appear here."}
        </p>

        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-text-muted">
          <span className={`h-2 w-2 rounded-full ${STATUS_BG[status]}`} />
          {STATUS_LABEL[status]}
        </p>
      </div>
    </div>
  );
}

/** Curated starting points so users aren't forced to fight a colour picker. */
export const ACCENT_PRESETS: { name: string; from: string; to: string }[] = [
  { name: "Slate", from: "#7a7d85", to: "#7a7d85" },
  { name: "Blurple", from: "#5865f2", to: "#5865f2" },
  { name: "Sunset", from: "#f0913f", to: "#eb459e" },
  { name: "Ocean", from: "#1fb2c9", to: "#3b6fe0" },
  { name: "Forest", from: "#3ba55d", to: "#1f7a4d" },
  { name: "Candy", from: "#eb459e", to: "#8b5cf6" },
  { name: "Ember", from: "#f23f43", to: "#f0913f" },
  { name: "Mono", from: "#e3e5e8", to: "#8a8d94" },
];

export function AccentPresetGrid({
  active,
  onPick,
}: {
  active: { from: string; to: string } | null;
  onPick: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACCENT_PRESETS.map((p) => {
        const selected =
          active &&
          active.from.toLowerCase() === p.from.toLowerCase() &&
          active.to.toLowerCase() === p.to.toLowerCase();
        return (
          <button
            key={p.name}
            type="button"
            title={p.name}
            aria-label={`${p.name} accent`}
            aria-pressed={!!selected}
            onClick={() => onPick(p.from, p.to)}
            className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
              selected ? "ring-2 ring-text-normal ring-offset-2 ring-offset-bg-secondary" : ""
            }`}
            style={{ backgroundImage: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)` }}
          />
        );
      })}
    </div>
  );
}
