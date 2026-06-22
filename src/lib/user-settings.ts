import type { Profile } from "@/lib/supabase/types";

export interface UserSettings {
  soundEnabled: boolean;
  desktopNotificationsEnabled: boolean;
  linkPreviewsEnabled: boolean;
}

const DEFAULTS: UserSettings = {
  soundEnabled: true,
  desktopNotificationsEnabled: true,
  linkPreviewsEnabled: true,
};

let cached: UserSettings = DEFAULTS;

export function syncUserSettings(profile: Profile | null | undefined) {
  if (!profile) {
    cached = DEFAULTS;
    return;
  }
  cached = {
    soundEnabled: profile.sound_enabled ?? true,
    desktopNotificationsEnabled: profile.desktop_notifications_enabled ?? true,
    linkPreviewsEnabled: profile.link_previews_enabled ?? true,
  };
}

export function getUserSettings(): UserSettings {
  return cached;
}

export function isSoundEnabled(): boolean {
  return cached.soundEnabled;
}

export function areDesktopNotificationsEnabled(): boolean {
  return cached.desktopNotificationsEnabled;
}

export function areLinkPreviewsEnabled(): boolean {
  return cached.linkPreviewsEnabled;
}

export function settingsFromProfile(profile: Profile): Pick<
  Profile,
  "sound_enabled" | "desktop_notifications_enabled" | "link_previews_enabled"
> {
  return {
    sound_enabled: profile.sound_enabled ?? true,
    desktop_notifications_enabled: profile.desktop_notifications_enabled ?? true,
    link_previews_enabled: profile.link_previews_enabled ?? true,
  };
}
