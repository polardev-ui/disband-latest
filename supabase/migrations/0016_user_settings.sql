-- User preference columns on profiles
alter table public.profiles
  add column if not exists sound_enabled boolean not null default true,
  add column if not exists desktop_notifications_enabled boolean not null default true,
  add column if not exists link_previews_enabled boolean not null default true;

comment on column public.profiles.sound_enabled is
  'Play in-app sounds for mentions and DMs.';
comment on column public.profiles.desktop_notifications_enabled is
  'Show OS/desktop notifications when the app is in the background.';
comment on column public.profiles.link_previews_enabled is
  'Show rich link embeds for URLs in chat messages.';
