"use client";

import { Avatar } from "@/components/ui/Avatar";
import { UserBadges } from "@/components/ui/UserBadges";
import { IconUpload } from "@/components/icons";
import { getAccentBackground, usesCustomAccent } from "@/lib/profileColor";
import { DisplayName } from "@/components/ui/DisplayName";
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
 * Live preview in Settings → Profile. Mirrors the real profile card
 * (UserProfileModal) so what you see while editing is what others see:
 * dark card, banner, overlapping avatar, name with badges below it, handle and
 * pronouns, status bubble, About me.
 *
 * The old version sat name and badges on one non-wrapping row, so a profile
 * with a lot of badges crushed the name to "pol…"; and it sized the avatar
 * with an override class that a shop ring moved onto the ring's wrapper,
 * leaving the ring off-centre around a larger picture.
 */
export function ProfilePreview({
  profile,
  displayName,
  username,
  bio,
  status,
  onChangeAvatar,
  onChangeBanner,
}: {
  profile: Profile;
  displayName: string;
  username: string;
  bio: string;
  status: UserStatus;

  onChangeAvatar?: (file: File) => void;

  onChangeBanner?: (file: File) => void;
}) {
  const name = displayName.trim() || username.trim() || "Your name";
  const banner = safeImageUrl(profile.banner_url);
  const pronouns = profile.pronouns?.trim();
  const note = profile.status_note?.trim();
  const bannerBg = usesCustomAccent(profile)
    ? getAccentBackground(profile)
    : "linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 52%, var(--color-bg-tertiary)) 0%, color-mix(in srgb, var(--color-brand) 14%, var(--color-bg-tertiary)) 100%)";

  return (
    <div className="overflow-hidden rounded-2xl border border-divider bg-overlay-panel text-text-normal">
      <label className="group relative block cursor-pointer" title={onChangeBanner ? "Change banner" : undefined}>
        <div className="h-[136px] w-full" style={{ background: bannerBg }}>
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        {onChangeBanner && (
          <>
            <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/55 text-[13px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              <IconUpload size={16} /> Change banner
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChangeBanner(file);
                e.target.value = "";
              }}
            />
          </>
        )}
      </label>

      <div className="px-5 pb-5">
        <div className="relative -mt-[46px] w-fit rounded-full bg-overlay-panel p-[5px]">
          <label className="group relative block cursor-pointer rounded-full" title={onChangeAvatar ? "Change avatar" : undefined}>
            <Avatar profile={profile} size="lg" />
            {onChangeAvatar && (
              <>
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <IconUpload size={16} />
                  <span className="text-[10px] font-semibold leading-none">Change</span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onChangeAvatar(file);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </label>
          <span
            className={`absolute bottom-1.5 right-1.5 h-[18px] w-[18px] rounded-full border-[3px] border-overlay-panel ${STATUS_BG[status]}`}
            title={STATUS_LABEL[status]}
          />
        </div>

        <h3 className="mt-2.5 break-words text-[21px] font-semibold leading-tight tracking-[-0.02em]">
          <DisplayName profile={{ ...profile, display_name: name }} />
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-text-muted">
          {username.trim() && <span>@{username.trim()}</span>}
          {pronouns && (
            <>
              <span aria-hidden>·</span>
              <span>{pronouns}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_BG[status]}`} />
            {STATUS_LABEL[status]}
          </span>
        </p>

        {/* Badges get their own row: however many there are, they wrap here
            instead of fighting the name for width. */}
        <UserBadges userId={profile.id} variant="full" size={16} className="mt-2.5" />

        {note && (
          <div className="relative mt-3.5 w-fit max-w-full">
            <span aria-hidden className="absolute -top-[5px] left-5 h-2.5 w-2.5 rotate-45 border-l border-t border-divider bg-bg-accent" />
            <p className="break-words rounded-2xl border border-divider bg-bg-accent px-3.5 py-2 text-[13.5px] leading-snug">{note}</p>
          </div>
        )}

        <div className="mt-4 border-t border-divider pt-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">About me</p>
          <p className={`mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed ${bio.trim() ? "" : "text-text-muted"}`}>
            {bio.trim() || "Your bio will appear here."}
          </p>
        </div>
      </div>
    </div>
  );
}

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
