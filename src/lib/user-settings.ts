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

export function areLinkPreviewsEnabled(): boolean {
  return cached.linkPreviewsEnabled;
}
